import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PUBLIC_DOWNLOAD_OPERATION_TIMEOUT_MS } from "@/lib/constants";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import {
  signCookie,
  verifyCookie,
  verifyVerifiedEmailCookie,
} from "@/server/cookieHelper";
import {
  getAccessCookieKey,
  getEmailCookieKey,
  type AccessCookiePayload,
  type PublicResourceType,
} from "@/server/cookieConstants";
import { fetchLinkAllowlistStatus } from "@/server/linkAllowlist";
import {
  fetchLinkAlcViewerSeeds,
  filterDataRoomContentByAlc,
  isAlcSeedEmpty,
  isLinkAlcActive,
} from "@/server/linkAlc";
import { hasWorkspaceEntitlement } from "@/server/workspaceEntitlement";
import { getPublicLinkAvailabilityError } from "@/server/publicLinkAvailability";
import { presignGetObject } from "@/server/storage";
import {
  evaluateWorkspaceBandwidthLimit,
  trackWorkspaceBandwidth,
} from "@/server/workspaceUsage";
import { isWatermarkEligibleDocument } from "@/server/watermarkPolicy";
import { resolvePublicDirectAsset } from "@/server/publicDirectAsset";
import { createOperationDeadline } from "@/server/operationDeadline";
import {
  engineFailureSchema,
  toPublicEngineErrorResponse,
} from "@/server/engineErrors";

// resolvePublicDirectAsset can synchronously force-repair a missing converted
// asset (a full conversion, up to DOCUMENT_CONVERSION_TIMEOUT_MS); the default
// function duration would kill it mid-claim like the sibling download routes.
export const maxDuration = 180;

const RequestSchema = z.object({
  linkId: z.string().uuid(),
  documentId: z.string().uuid(),
  dataRoomId: z.string().uuid().optional(),
  variant: z.enum(["original", "converted"]),
});

const createBandwidthLimitResponse = () =>
  NextResponse.json(
    { error: "Bandwidth limit reached", code: "BANDWIDTH_LIMIT_REACHED" },
    { status: 403 },
  );

export async function POST(req: NextRequest) {
  const deadline = createOperationDeadline(
    PUBLIC_DOWNLOAD_OPERATION_TIMEOUT_MS,
  );
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { linkId, documentId, dataRoomId, variant } = parsed.data;
    const resourceType: PublicResourceType = dataRoomId
      ? "data_room"
      : "document";
    const resourceId = dataRoomId ?? documentId;
    const resourceColumn = dataRoomId ? "data_room_id" : "document_id";
    const supabase = createSupabaseServiceClient();

    const { data: link } = await supabase
      .from("links")
      .select(
        "id, document_id, workspace_id, email_verification, nda_gate, can_download, apply_watermark, open_once, revoked_at, expires_at",
      )
      .eq("id", linkId)
      .eq(resourceColumn, resourceId)
      .maybeSingle();

    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    const availabilityError = getPublicLinkAvailabilityError(link);
    if (availabilityError) {
      const { status, ...payload } = availabilityError;
      return NextResponse.json(payload, { status });
    }

    const hasEntitlement = await hasWorkspaceEntitlement(link.workspace_id);
    if (!hasEntitlement) {
      return NextResponse.json(
        { error: "Link not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    // This endpoint returns a raw presigned storage URL. Export entitlement is
    // checked now; watermark eligibility is checked after loading the document.
    if (!link.can_download) {
      return NextResponse.json(
        { error: "Downloads disabled" },
        { status: 403 },
      );
    }
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

    const emailCookieName = getEmailCookieKey(resourceType, resourceId, linkId);
    const emailCookieValue = req.cookies.get(emailCookieName)?.value;
    const emailPayload = emailCookieValue
      ? verifyVerifiedEmailCookie(emailCookieValue, {
          resourceType,
          resourceId,
          linkId,
        })
      : null;
    const allowlistStatus = await fetchLinkAllowlistStatus(
      supabase,
      linkId,
      emailPayload?.email ?? null,
    );
    const alcActive =
      Boolean(dataRoomId) && (await isLinkAlcActive(supabase, linkId));
    const requiresVerifiedEmail = Boolean(
      link.email_verification ||
      link.nda_gate ||
      allowlistStatus.isActive ||
      alcActive,
    );
    let verifiedEmail: string | null =
      allowlistStatus.normalizedEmail ?? emailPayload?.email ?? null;
    if (requiresVerifiedEmail) {
      if (!emailPayload || !emailPayload.email) {
        return NextResponse.json(
          { error: "Email verification required" },
          { status: 401 },
        );
      }
      if (allowlistStatus.isActive && allowlistStatus.emailBlocked === true) {
        return NextResponse.json(
          { error: "Email not allowed", code: "EMAIL_NOT_ALLOWED" },
          { status: 403 },
        );
      }
      if (
        !alcActive &&
        allowlistStatus.isActive &&
        allowlistStatus.emailAllowed === false
      ) {
        return NextResponse.json(
          { error: "Email not allowed", code: "EMAIL_NOT_ALLOWED" },
          { status: 403 },
        );
      }
      verifiedEmail =
        allowlistStatus.normalizedEmail ?? emailPayload.email ?? null;
    }
    if (link.nda_gate) {
      if (!verifiedEmail) {
        return NextResponse.json(
          { error: "Email verification required" },
          { status: 401 },
        );
      }
      const { data: signature } = await supabase
        .from("nda_signatures")
        .select("id, signed_pdf_path")
        .eq("link_id", linkId)
        .eq("email", verifiedEmail)
        .maybeSingle();
      if (!signature) {
        return NextResponse.json(
          { error: "NDA signature required" },
          { status: 403 },
        );
      }
      if (!signature.signed_pdf_path) {
        return NextResponse.json(
          { error: "Signed NDA is being prepared", code: "NDA_PDF_PENDING" },
          { status: 403 },
        );
      }
    }

    const { data: doc } = await supabase
      .from("documents")
      .select(
        "id, storage_path, converted_storage_path, conversion_status, workspace_id, data_room_id, folder_id, size_bytes, file_type",
      )
      .eq("id", documentId)
      .maybeSingle();

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    if (
      link.apply_watermark &&
      isWatermarkEligibleDocument({
        fileType: doc.file_type,
        storagePath: doc.storage_path,
      })
    ) {
      return NextResponse.json(
        { error: "Watermarked exports must be requested via download APIs" },
        { status: 403 },
      );
    }

    if (dataRoomId && doc.data_room_id !== dataRoomId) {
      return NextResponse.json(
        { error: "Document not part of data room" },
        { status: 403 },
      );
    }

    if (alcActive) {
      if (!verifiedEmail) {
        return NextResponse.json(
          { error: "Email verification required", code: "EMAIL_OTP_REQUIRED" },
          { status: 401 },
        );
      }

      const alcSeeds = await fetchLinkAlcViewerSeeds(supabase, {
        linkId,
        workspaceId: link.workspace_id,
        viewerEmail: verifiedEmail,
      }).catch((error) => {
        console.error("[Signed URL] Failed to evaluate ALC", {
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
            .eq("data_room_id", dataRoomId as string);

          if (foldersError) {
            console.error("[Signed URL] Failed to load folders for ALC", {
              linkId,
              dataRoomId,
              error: foldersError,
            });
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

    const directAsset = await resolvePublicDirectAsset({
      client: supabase,
      document: doc,
      requestedVariant: variant,
      fallbackWorkspaceId: link.workspace_id,
      deadlineAt: deadline.deadlineAt,
    });

    if (!directAsset) {
      return NextResponse.json(
        { error: "File not available" },
        { status: 404 },
      );
    }

    const targetWorkspaceId = doc.workspace_id ?? link.workspace_id;
    const directDeliveryBytes = directAsset.document.size_bytes ?? 0;
    const bandwidthEvaluation = await evaluateWorkspaceBandwidthLimit(
      targetWorkspaceId,
      directDeliveryBytes,
    );
    if (bandwidthEvaluation.shouldBlock) {
      return createBandwidthLimitResponse();
    }

    let signedUrl: string;
    try {
      signedUrl = await presignGetObject({
        logicalBucket: directAsset.logicalBucket,
        path: directAsset.path,
        expiresInSeconds: 10 * 60,
      });
    } catch (signError) {
      console.error("[Signed URL] Failed", signError);
      return NextResponse.json(
        { error: "Unable to sign file" },
        { status: 500 },
      );
    }

    const response = NextResponse.json({
      url: signedUrl,
      variant: directAsset.variant,
      email: verifiedEmail,
    });
    void trackWorkspaceBandwidth(targetWorkspaceId, directDeliveryBytes, 0, {
      r2ClassBOps: 1,
    });
    const refreshedAccessValue = signCookie({
      resourceType,
      resourceId,
      linkId,
      exp: Date.now() + 60 * 60 * 1000,
    });
    response.cookies.set(accessCookieName, refreshedAccessValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60,
      path: "/",
    });

    return response;
  } catch (err) {
    const parsedFailure = engineFailureSchema.safeParse(err);
    if (parsedFailure.success) {
      const publicFailure = toPublicEngineErrorResponse(parsedFailure.data);
      return NextResponse.json(publicFailure.body, {
        status: publicFailure.status,
      });
    }
    console.error("[Signed URL API] Error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
