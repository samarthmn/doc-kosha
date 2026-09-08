import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import {
  getAccessCookieKey,
  getEmailCookieKey,
  type AccessCookiePayload,
  type PublicResourceType,
} from "@/server/cookieConstants";
import { verifyCookie, verifyVerifiedEmailCookie } from "@/server/cookieHelper";
import {
  resolveRequiredWatermarkDefinition,
  type BrandingRecord,
  type WatermarkDynamicValues,
} from "@/lib/branding";
import type { WatermarkDefinition } from "@/lib/branding";
import { extractClientIp } from "@/server/requestIp";
import {
  materializeWatermark,
  type WatermarkTemplateRow,
} from "@/lib/watermarks";
import { BRANDING_ASSETS_BUCKET_NAME } from "@/lib/constants";
import { hasWorkspaceEntitlement } from "@/server/workspaceEntitlement";
import { getPublicLinkAvailabilityError } from "@/server/publicLinkAvailability";
import { presignGetObject } from "@/server/storage";
import { fetchLinkAllowlistStatus } from "@/server/linkAllowlist";
import {
  fetchLinkAlcViewerSeeds,
  filterDataRoomContentByAlc,
  isAlcSeedEmpty,
  isLinkAlcActive,
} from "@/server/linkAlc";

const RequestSchema = z.object({
  linkId: z.string().uuid(),
  documentId: z.string().uuid(),
  dataRoomId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { linkId, documentId, dataRoomId } = parsed.data;
    const resourceType: PublicResourceType = dataRoomId
      ? "data_room"
      : "document";
    const resourceId = dataRoomId ?? documentId;
    const resourceColumn = dataRoomId ? "data_room_id" : "document_id";
    const supabase = createSupabaseServiceClient();

    const accessCookieName = getAccessCookieKey(
      resourceType,
      resourceId,
      linkId,
    );
    const accessCookieValue = req.cookies.get(accessCookieName)?.value;
    if (!accessCookieValue) {
      return NextResponse.json(
        { error: "Access confirmation required" },
        { status: 401 },
      );
    }

    const accessPayload =
      accessCookieValue && verifyCookie<AccessCookiePayload>(accessCookieValue);

    if (
      !accessPayload ||
      accessPayload.resourceId !== resourceId ||
      accessPayload.resourceType !== resourceType ||
      accessPayload.linkId !== linkId ||
      (typeof accessPayload.exp === "number" && accessPayload.exp < Date.now())
    ) {
      return NextResponse.json({ error: "Access expired" }, { status: 401 });
    }

    const { data: linkRow, error: linkError } = await supabase
      .from("links" as never)
      .select(
        "workspace_id, apply_watermark, dynamic_watermark_email, dynamic_watermark_ip, dynamic_watermark_datetime, email_verification, watermark_id, open_once, revoked_at, expires_at",
      )
      .eq("id", linkId)
      .eq(resourceColumn, resourceId)
      .maybeSingle();

    const link =
      (linkRow as
        | {
            workspace_id: string;
            apply_watermark: boolean;
            dynamic_watermark_email?: boolean | null;
            dynamic_watermark_ip?: boolean | null;
            dynamic_watermark_datetime?: boolean | null;
            email_verification?: boolean | null;
            watermark_id?: string | null;
            revoked_at: string | null;
            expires_at: string | null;
            open_once: boolean;
          }
        | null
        | undefined) ?? null;

    if (linkError || !link) {
      return NextResponse.json({ apply: false }, { status: 200 });
    }

    const availabilityError = getPublicLinkAvailabilityError(link);
    if (availabilityError) {
      const { status, ...payload } = availabilityError;
      return NextResponse.json(payload, { status });
    }

    const hasEntitlement = await hasWorkspaceEntitlement(link.workspace_id);
    if (!hasEntitlement) {
      return NextResponse.json({ apply: false }, { status: 200 });
    }

    if (!link.apply_watermark) {
      return NextResponse.json({ apply: false }, { status: 200 });
    }

    if (dataRoomId) {
      const { data: doc } = await supabase
        .from("documents")
        .select("id, data_room_id, folder_id")
        .eq("id", documentId)
        .maybeSingle();
      if (!doc || doc.data_room_id !== dataRoomId) {
        return NextResponse.json(
          { error: "Document not part of data room" },
          { status: 403 },
        );
      }

      const alcActive = await isLinkAlcActive(supabase, linkId);
      if (alcActive) {
        const emailCookieName = getEmailCookieKey(
          resourceType,
          resourceId,
          linkId,
        );
        const emailCookieValue = req.cookies.get(emailCookieName)?.value;
        const emailPayload = emailCookieValue
          ? verifyVerifiedEmailCookie(emailCookieValue, {
              resourceType,
              resourceId,
              linkId,
            })
          : null;

        if (!emailPayload?.email) {
          return NextResponse.json(
            {
              error: "Email verification required",
              code: "EMAIL_OTP_REQUIRED",
            },
            { status: 401 },
          );
        }

        const expirationMs =
          typeof emailPayload.exp === "number"
            ? emailPayload.exp < 1_000_000_000_000
              ? emailPayload.exp * 1000
              : emailPayload.exp
            : null;

        if (expirationMs !== null && expirationMs < Date.now()) {
          return NextResponse.json(
            { error: "Email verification expired", code: "EMAIL_OTP_REQUIRED" },
            { status: 401 },
          );
        }

        const allowlistStatus = await fetchLinkAllowlistStatus(
          supabase,
          linkId,
          emailPayload.email,
        );
        if (allowlistStatus.isActive && allowlistStatus.emailBlocked === true) {
          return NextResponse.json(
            { error: "Email not allowed", code: "EMAIL_NOT_ALLOWED" },
            { status: 403 },
          );
        }

        const alcSeeds = await fetchLinkAlcViewerSeeds(supabase, {
          linkId,
          workspaceId: link.workspace_id,
          viewerEmail: allowlistStatus.normalizedEmail ?? emailPayload.email,
        }).catch((error) => {
          console.error("[public.links.watermark] failed to evaluate ALC", {
            linkId,
            workspaceId: link.workspace_id,
            error,
          });
          return null;
        });

        if (!alcSeeds || isAlcSeedEmpty(alcSeeds)) {
          return NextResponse.json(
            { error: "Access denied", code: "ALC_NOT_ALLOWED" },
            { status: 403 },
          );
        }

        if (!alcSeeds.roomAllowed) {
          const docAllowedExplicitly =
            alcSeeds.allowedDocumentSeedIds.has(documentId);

          if (!docAllowedExplicitly) {
            const docFolderId =
              (doc as { folder_id?: string | null }).folder_id ?? null;
            const shouldCheckFolderRules =
              alcSeeds.allowedFolderSeedIds.size > 0 && Boolean(docFolderId);

            if (!shouldCheckFolderRules) {
              return NextResponse.json(
                { error: "Access denied", code: "ALC_NOT_ALLOWED" },
                { status: 403 },
              );
            }

            const { data: folders, error: foldersError } = await supabase
              .from("folders")
              .select("id, parent_folder_id")
              .eq("data_room_id", dataRoomId);

            if (foldersError) {
              console.error(
                "[public.links.watermark] failed to load folders for ALC",
                { linkId, dataRoomId, error: foldersError },
              );
              return NextResponse.json(
                { error: "Access denied", code: "ALC_NOT_ALLOWED" },
                { status: 403 },
              );
            }

            const { allowedDocumentIds } = filterDataRoomContentByAlc({
              folders: (folders ?? []) as Array<{
                id: string;
                parent_folder_id: string | null;
              }>,
              documents: [{ id: documentId, folder_id: docFolderId }],
              roomAllowed: alcSeeds.roomAllowed,
              allowedFolderSeedIds: alcSeeds.allowedFolderSeedIds,
              allowedDocumentSeedIds: alcSeeds.allowedDocumentSeedIds,
            });

            if (!allowedDocumentIds.has(documentId)) {
              return NextResponse.json(
                { error: "Access denied", code: "ALC_NOT_ALLOWED" },
                { status: 403 },
              );
            }
          }
        }
      }
    }

    let definition: WatermarkDefinition | null = null;
    const watermarkId = (link as { watermark_id?: string | null }).watermark_id;
    if (watermarkId) {
      const { data: tplRow } = await supabase
        .from("watermarks" as never)
        .select("*")
        .eq("id", watermarkId)
        .maybeSingle();
      const materialized = tplRow
        ? materializeWatermark(tplRow as WatermarkTemplateRow)
        : null;
      if (materialized) {
        definition = {
          ...materialized.definition,
          pattern: materialized.pattern,
          rotationDeg: materialized.rotationDeg,
          xSpacing: materialized.xSpacing,
          ySpacing: materialized.ySpacing,
          mode: materialized.mode,
          imageWidthPt: materialized.imageWidthPt ?? undefined,
          imageHeightPt: materialized.imageHeightPt ?? undefined,
          imagePath: materialized.imageStoragePath ?? undefined,
        };
      } else {
        definition = null;
      }
    } else {
      const { data: brandingRow } = await supabase
        .from("branding")
        .select("*")
        .eq("workspace_id", link.workspace_id)
        .maybeSingle();
      definition = resolveRequiredWatermarkDefinition(
        (brandingRow as BrandingRecord | null) ?? null,
      );
    }
    if (!definition) {
      return NextResponse.json({ apply: false }, { status: 200 });
    }

    let imageSignedUrl: string | null = null;
    if (
      (definition.mode === "image" || definition.mode === "hybrid") &&
      definition.imagePath
    ) {
      try {
        imageSignedUrl = await presignGetObject({
          logicalBucket: BRANDING_ASSETS_BUCKET_NAME,
          path: definition.imagePath,
          expiresInSeconds: 60 * 10,
        });
      } catch {
        imageSignedUrl = null;
      }
    }

    let dynamicValues: WatermarkDynamicValues | undefined;
    if (
      (link as { dynamic_watermark_email?: boolean }).dynamic_watermark_email
    ) {
      dynamicValues = dynamicValues ?? {};
      const emailCookieName = getEmailCookieKey(
        resourceType,
        resourceId,
        linkId,
      );
      const emailCookieValue = req.cookies.get(emailCookieName)?.value;
      const emailPayload = emailCookieValue
        ? verifyVerifiedEmailCookie(emailCookieValue, {
            resourceType,
            resourceId,
            linkId,
          })
        : null;
      if (emailPayload?.email) {
        const rawExpiration = emailPayload.exp;
        const expirationMs =
          typeof rawExpiration === "number"
            ? rawExpiration < 1_000_000_000_000
              ? rawExpiration * 1000
              : rawExpiration
            : null;

        if (expirationMs !== null && expirationMs > Date.now()) {
          dynamicValues.email = emailPayload.email;
        }
      }
    }

    if ((link as { dynamic_watermark_ip?: boolean }).dynamic_watermark_ip) {
      dynamicValues = dynamicValues ?? {};
      const clientIp = extractClientIp(req);
      if (clientIp) {
        dynamicValues.ip = clientIp;
      }
    }

    if (
      (link as { dynamic_watermark_datetime?: boolean })
        .dynamic_watermark_datetime
    ) {
      dynamicValues = dynamicValues ?? {};
      dynamicValues.datetime = new Date();
    }

    return NextResponse.json({
      apply: true,
      definition,
      dynamic: dynamicValues ?? null,
      image_signed_url: imageSignedUrl,
    });
  } catch (error) {
    console.error("[public.links.watermark] unexpected error", error);
    return NextResponse.json(
      { error: "Unable to build watermark overlay" },
      { status: 500 },
    );
  }
}
