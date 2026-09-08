import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import {
  findSiblingTitleConflict,
  isDocumentMetadataMutationBlocked,
} from "@/server/documentMetadataMutation";

const RequestSchema = z.object({
  documentId: z.string().uuid(),
  destinationFolderId: z.string().uuid().nullable(),
  dataRoomId: z.string().uuid().nullable().optional(),
});

type DocumentRow = {
  id: string;
  title: string;
  storage_path: string;
  conversion_status: string;
  folder_id: string | null;
  workspace_id: string;
  data_room_id: string | null;
};

type FolderRow = {
  id: string;
  workspace_id: string;
  data_room_id: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { documentId, destinationFolderId } = parsed.data;
    const requestedDataRoomId = parsed.data.dataRoomId ?? null;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select(
        "id, title, storage_path, conversion_status, folder_id, workspace_id, data_room_id",
      )
      .eq("id", documentId)
      .maybeSingle();

    if (docError || !doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    const row = doc as DocumentRow;
    const actualDataRoomId = row.data_room_id ?? null;
    if (
      (requestedDataRoomId && requestedDataRoomId !== actualDataRoomId) ||
      (!requestedDataRoomId && actualDataRoomId)
    ) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    const { data: canEdit, error: canEditError } = actualDataRoomId
      ? await supabase.rpc("can_edit_data_room", {
          ws: row.workspace_id,
          room_id: actualDataRoomId,
        })
      : await supabase.rpc("can_edit_workspace_documents", {
          ws: row.workspace_id,
        });

    if (canEditError || !canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (isDocumentMetadataMutationBlocked(row.conversion_status)) {
      return NextResponse.json(
        {
          error: "This document is still processing. Please try again shortly.",
        },
        { status: 409 },
      );
    }

    // No-op move.
    if ((row.folder_id ?? null) === (destinationFolderId ?? null)) {
      return NextResponse.json({ ok: true, document: row });
    }

    // Validate destination folder (if provided).
    if (destinationFolderId) {
      const { data: dest, error: destError } = await supabase
        .from("folders")
        .select("id, workspace_id, data_room_id")
        .eq("id", destinationFolderId)
        .maybeSingle();
      if (destError || !dest) {
        return NextResponse.json(
          { error: "Destination folder not found" },
          { status: 404 },
        );
      }
      const destRow = dest as FolderRow;
      if (
        destRow.workspace_id !== row.workspace_id ||
        (destRow.data_room_id ?? null) !== actualDataRoomId
      ) {
        return NextResponse.json(
          { error: "Destination folder not found" },
          { status: 404 },
        );
      }
    }

    const conflict = await findSiblingTitleConflict({
      client: supabase,
      workspaceId: row.workspace_id,
      dataRoomId: actualDataRoomId ?? null,
      folderId: destinationFolderId ?? null,
      excludeDocumentId: row.id,
      title: row.title,
    });
    if (!conflict.ok) {
      console.error(
        "[documents.move] failed to check destination documents",
        conflict.error,
      );
      return NextResponse.json(
        { error: "Unable to move right now." },
        { status: 500 },
      );
    }
    if (conflict.hasConflict) {
      return NextResponse.json(
        {
          error:
            "A file with this name already exists in the destination folder.",
        },
        { status: 409 },
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("documents")
      .update({ folder_id: destinationFolderId ?? null })
      .eq("id", documentId)
      .eq("workspace_id", row.workspace_id)
      .eq("storage_path", row.storage_path)
      .eq("conversion_status", row.conversion_status)
      .select("*")
      .maybeSingle();

    if (updateError || !updated) {
      console.error("[documents.move] db update failed", updateError);
      if (updateError?.code === "23505") {
        return NextResponse.json(
          {
            error:
              "A file with this name already exists in the destination folder.",
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error: updateError
            ? "Unable to move right now."
            : "The document changed while it was being moved. Please retry.",
        },
        { status: updateError ? 500 : 409 },
      );
    }

    return NextResponse.json({ ok: true, document: updated });
  } catch (err) {
    console.error("[documents.move] unexpected error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
