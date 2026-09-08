import { NextRequest, NextResponse } from "next/server";
import {
  restoreVersionToCurrent,
  versioningRestoreSchema,
} from "@/modules/document-versioning";
import {
  canEditDocumentsScope,
  requireAuthenticatedUser,
} from "@/modules/document-versioning/server/access";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { isDocumentVersioningError } from "@/modules/document-versioning/server/errors";

export async function POST(req: NextRequest) {
  try {
    await requireAuthenticatedUser();

    const body = await req.json().catch(() => ({}));
    const parsed = versioningRestoreSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("id,workspace_id,data_room_id")
      .eq("id", parsed.data.documentId)
      .maybeSingle();

    if (documentError) {
      console.error("[documents.versioning.restore] document lookup failed", {
        documentId: parsed.data.documentId,
        error: documentError,
      });
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    if (document.workspace_id !== parsed.data.workspaceId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const canEdit = await canEditDocumentsScope({
      workspaceId: document.workspace_id,
      dataRoomId: document.data_room_id,
    });

    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await restoreVersionToCurrent({
      workspaceId: document.workspace_id,
      documentId: parsed.data.documentId,
      versionId: parsed.data.versionId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (isDocumentVersioningError(error) && error.code === "unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (isDocumentVersioningError(error) && error.code === "version_pruned") {
      return NextResponse.json(
        { error: "Version is pruned and cannot be restored" },
        { status: 409 },
      );
    }
    if (
      isDocumentVersioningError(error) &&
      (error.code === "document_not_found" ||
        error.code === "version_not_found")
    ) {
      console.error("[documents.versioning.restore] not found", {
        message: error.message,
      });
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (error instanceof Error && error.name === "PLAN_UPGRADE_REQUIRED") {
      return NextResponse.json(
        {
          error:
            "Version restore requires a paid plan. Upgrade to Essential to retain and restore previous versions.",
          code: "PLAN_UPGRADE_REQUIRED",
        },
        { status: 403 },
      );
    }

    console.error("[documents.versioning.restore] unexpected error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
