import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import {
  findSiblingTitleConflict,
  isDocumentMetadataMutationBlocked,
} from "@/server/documentMetadataMutation";

const SafeBaseNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(
    (val) => {
      if (val.includes("\0")) return false;
      if (val.includes("..")) return false;
      if (val.includes("/")) return false;
      if (val.includes("\\")) return false;
      return true;
    },
    { message: "Invalid name" },
  );

const RequestSchema = z.object({
  documentId: z.string().uuid(),
  newBaseName: SafeBaseNameSchema,
  dataRoomId: z.string().uuid().nullable().optional(),
});

type DocumentRow = {
  id: string;
  title: string;
  file_type: string;
  storage_path: string;
  conversion_status: string;
  folder_id: string | null;
  workspace_id: string;
  data_room_id: string | null;
};

const normalizeBaseName = (base: string, ext: string): string => {
  const trimmed = base.trim();
  const suffix = `.${ext.toLowerCase()}`;
  if (trimmed.toLowerCase().endsWith(suffix)) {
    return trimmed.slice(0, -suffix.length).trim();
  }
  return trimmed;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { documentId, newBaseName } = parsed.data;
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
        "id, title, file_type, storage_path, conversion_status, folder_id, workspace_id, data_room_id",
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

    const ext = (row.file_type || "").trim().toLowerCase();
    if (!ext) {
      return NextResponse.json(
        { error: "Invalid document type" },
        { status: 400 },
      );
    }

    const base = normalizeBaseName(newBaseName, ext);
    if (!base) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    const newFileName = `${base}.${ext}`;

    if (row.title === newFileName) {
      return NextResponse.json({ ok: true, document: row });
    }

    const conflict = await findSiblingTitleConflict({
      client: supabase,
      workspaceId: row.workspace_id,
      dataRoomId: actualDataRoomId ?? null,
      folderId: row.folder_id ?? null,
      excludeDocumentId: row.id,
      title: newFileName,
    });
    if (!conflict.ok) {
      console.error(
        "[documents.rename] failed to check sibling documents",
        conflict.error,
      );
      return NextResponse.json(
        { error: "Unable to rename right now." },
        { status: 500 },
      );
    }
    if (conflict.hasConflict) {
      return NextResponse.json(
        { error: "A file with this name already exists in this folder." },
        { status: 409 },
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("documents")
      .update({ title: newFileName })
      .eq("id", documentId)
      .eq("workspace_id", row.workspace_id)
      .eq("storage_path", row.storage_path)
      .eq("conversion_status", row.conversion_status)
      .select("*")
      .maybeSingle();

    if (updateError || !updated) {
      console.error("[documents.rename] db update failed", updateError);
      if (updateError?.code === "23505") {
        return NextResponse.json(
          { error: "A file with this name already exists in this folder." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error: updateError
            ? "Unable to rename right now."
            : "The document changed while it was being renamed. Please retry.",
        },
        { status: updateError ? 500 : 409 },
      );
    }

    return NextResponse.json({ ok: true, document: updated });
  } catch (err) {
    console.error("[documents.rename] unexpected error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
