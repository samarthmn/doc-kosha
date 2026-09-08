import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";

const FolderNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (val) => {
      if (val.includes("\0")) return false;
      if (val.includes("/")) return false;
      if (val.includes("\\")) return false;
      return true;
    },
    { message: "Invalid folder name" },
  );

const RequestSchema = z.object({
  folderId: z.string().uuid(),
  name: FolderNameSchema,
  dataRoomId: z.string().uuid().nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { folderId, name } = parsed.data;
    const requestedDataRoomId = parsed.data.dataRoomId ?? null;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: folder, error: folderError } = await supabase
      .from("folders")
      .select("id, name, workspace_id, parent_folder_id, data_room_id")
      .eq("id", folderId)
      .maybeSingle();

    if (folderError || !folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const actualDataRoomId =
      (folder as { data_room_id?: string | null }).data_room_id ?? null;
    if (
      (requestedDataRoomId && requestedDataRoomId !== actualDataRoomId) ||
      (!requestedDataRoomId && actualDataRoomId)
    ) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const workspaceId = folder.workspace_id as string;
    const { data: canEdit, error: canEditError } = actualDataRoomId
      ? await supabase.rpc("can_edit_data_room", {
          ws: workspaceId,
          room_id: actualDataRoomId,
        })
      : await supabase.rpc("can_edit_workspace_documents", { ws: workspaceId });

    if (canEditError || !canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const normalizedName = name.trim();

    const { data: updated, error: updateError } = await supabase
      .from("folders")
      .update({ name: normalizedName })
      .eq("id", folderId)
      .select("*")
      .single();

    if (updateError || !updated) {
      if (updateError?.code === "23505") {
        return NextResponse.json(
          { error: "A folder with this name already exists in this location." },
          { status: 409 },
        );
      }
      console.error("[folders.rename] update failed", updateError);
      return NextResponse.json(
        { error: "Unable to rename folder" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, folder: updated });
  } catch (err) {
    console.error("[folders.rename] unexpected error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
