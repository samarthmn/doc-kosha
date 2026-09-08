import { NextRequest, NextResponse } from "next/server";
import {
  getVersionHistory,
  versioningHistoryQuerySchema,
} from "@/modules/document-versioning";
import {
  canReadWorkspace,
  requireAuthenticatedUser,
} from "@/modules/document-versioning/server/access";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { isDocumentVersioningError } from "@/modules/document-versioning/server/errors";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();

    const searchParams = req.nextUrl.searchParams;
    const parsed = versioningHistoryQuerySchema.safeParse({
      documentId: searchParams.get("documentId"),
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select(
        "id,workspace_id,title,file_type,conversion_status,size_bytes,created_at,updated_at",
      )
      .eq("id", parsed.data.documentId)
      .maybeSingle();

    if (docError) {
      console.error("[documents.versioning.history] document lookup failed", {
        documentId: parsed.data.documentId,
        error: docError,
      });
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }

    if (!document?.workspace_id) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    const canRead = await canReadWorkspace(document.workspace_id, user.id);
    if (!canRead) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const history = await getVersionHistory({
      documentId: parsed.data.documentId,
      cursor: parsed.data.cursor ?? null,
      limit: parsed.data.limit,
    });

    return NextResponse.json({
      items: [
        {
          kind: "current",
          id: `current:${document.id}`,
          documentId: document.id,
          title: document.title,
          fileType: document.file_type,
          conversionStatus: document.conversion_status,
          sizeBytes: document.size_bytes,
          replacedAt: document.updated_at ?? document.created_at,
          state: "current",
          isFreeIncluded: false,
          countsTowardsStorage: false,
          prunedAt: null,
        },
        ...history.items.map((item) => ({
          kind: "previous",
          id: item.id,
          documentId: item.document_id,
          title: item.title,
          fileType: item.file_type,
          conversionStatus: item.conversion_status,
          sizeBytes: item.size_bytes,
          storagePath: item.state === "pruned" ? undefined : item.storage_path,
          convertedStoragePath:
            item.state === "pruned" ? undefined : item.converted_storage_path,
          sourceScopeDataRoomId: item.source_scope_data_room_id,
          replacedAt: item.replaced_at,
          state: item.state,
          isFreeIncluded: item.is_free_included,
          countsTowardsStorage: item.counts_towards_storage,
          prunedAt: item.pruned_at,
        })),
      ],
      nextCursor: history.nextCursor,
    });
  } catch (error) {
    if (isDocumentVersioningError(error) && error.code === "unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("[documents.versioning.history] unexpected error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
