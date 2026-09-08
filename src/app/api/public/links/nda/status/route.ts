import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { verifyVerifiedEmailCookie } from "@/server/cookieHelper";
import {
  getEmailCookieKey,
  type PublicResourceType,
} from "@/server/cookieConstants";
import { z } from "zod";
import { TrackerResourceType } from "@/lib/analytics/publicTracker";
import { hasWorkspaceEntitlement } from "@/server/workspaceEntitlement";
import { fetchLinkAllowlistStatus } from "@/server/linkAllowlist";
import {
  fetchLinkAlcViewerSeeds,
  isAlcSeedEmpty,
  isLinkAlcActive,
} from "@/server/linkAlc";
import { resolveEffectivePublicLanguage } from "@/modules/public-links/server/settings";

const StatusRequestSchema = z
  .object({
    linkId: z.string().uuid(),
    documentId: z.string().uuid().optional(),
    dataRoomId: z.string().uuid().optional(),
  })
  .refine(
    (value) =>
      (value.documentId && !value.dataRoomId) ||
      (!value.documentId && value.dataRoomId),
    { message: "Provide exactly one resource id", path: ["documentId"] },
  );

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = StatusRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const { linkId, documentId, dataRoomId } = parsed.data;
    const resourceType: PublicResourceType = documentId
      ? TrackerResourceType.Document
      : TrackerResourceType.DataRoom;
    const resourceId = documentId ?? (dataRoomId as string);
    const resourceColumn = documentId ? "document_id" : "data_room_id";

    const supabase = createSupabaseServiceClient();

    const { data: link, error: linkError } = await supabase
      .from("links")
      .select("id, workspace_id, public_language_override")
      .eq("id", linkId)
      .eq(resourceColumn, resourceId)
      .maybeSingle();

    if (linkError) {
      console.error("[NDA Status API] Link query error:", linkError);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }

    if (!link) {
      return NextResponse.json(
        { error: "Link not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    const locale = await resolveEffectivePublicLanguage({
      workspaceId: link.workspace_id,
      linkPublicLanguageOverride: link.public_language_override,
    });

    const hasEntitlement = await hasWorkspaceEntitlement(link.workspace_id);
    if (!hasEntitlement) {
      return NextResponse.json(
        { error: "Link not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    // Read and verify cookie
    const cookieName = getEmailCookieKey(resourceType, resourceId, linkId);
    const cookieValue = req.cookies.get(cookieName)?.value;
    if (!cookieValue) {
      return NextResponse.json({ error: "Not verified" }, { status: 401 });
    }

    const payload = verifyVerifiedEmailCookie(cookieValue, {
      resourceType,
      resourceId,
      linkId,
    });
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired verification" },
        { status: 401 },
      );
    }

    const alcActive =
      resourceType === TrackerResourceType.DataRoom
        ? await isLinkAlcActive(supabase, linkId)
        : false;

    if (alcActive) {
      const allowlistStatus = await fetchLinkAllowlistStatus(
        supabase,
        linkId,
        payload.email,
      );
      if (allowlistStatus.isActive && allowlistStatus.emailBlocked === true) {
        return NextResponse.json(
          { error: "Email not allowed", code: "EMAIL_NOT_ALLOWED" },
          { status: 403 },
        );
      }

      const seeds = await fetchLinkAlcViewerSeeds(supabase, {
        linkId,
        workspaceId: link.workspace_id,
        viewerEmail: allowlistStatus.normalizedEmail ?? payload.email,
      }).catch((error) => {
        console.error("[NDA Status API] Failed to evaluate ALC", {
          linkId,
          workspaceId: link.workspace_id,
          error,
        });
        return null;
      });

      if (!seeds || isAlcSeedEmpty(seeds)) {
        return NextResponse.json(
          { error: "Access denied", code: "ALC_NOT_ALLOWED" },
          { status: 403 },
        );
      }
    }

    // Check if NDA signature exists for this resource+email
    const { data: sig } = await supabase
      .from("nda_signatures")
      .select("id, signed_pdf_path")
      .eq("link_id", linkId)
      .eq("email", payload.email)
      .maybeSingle();

    return NextResponse.json({
      hasSigned: Boolean(sig?.signed_pdf_path),
      signatureRecorded: Boolean(sig),
      pdfReady: Boolean(sig?.signed_pdf_path),
      email: payload.email,
      public_language: locale,
    });
  } catch (err) {
    console.error("[NDA Status API] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
