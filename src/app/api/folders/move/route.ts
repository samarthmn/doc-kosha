import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";

const RequestSchema = z.object({
  folderId: z.string().uuid(),
  destinationParentId: z.string().uuid().nullable(),
  dataRoomId: z.string().uuid().nullable().optional(),
});

type FolderRow = {
  id: string;
  name: string;
  workspace_id: string;
  parent_folder_id: string | null;
  data_room_id: string | null;
};

const buildDescendantSet = (
  folders: FolderRow[],
  rootId: string,
): Set<string> => {
  const childrenByParent = new Map<string, string[]>();
  for (const f of folders) {
    const p = f.parent_folder_id ?? "root";
    const arr = childrenByParent.get(p) ?? [];
    arr.push(f.id);
    childrenByParent.set(p, arr);
  }

  const res = new Set<string>();
  const stack: string[] = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (res.has(cur)) continue;
    res.add(cur);
    const kids = childrenByParent.get(cur) ?? [];
    kids.forEach((k) => stack.push(k));
  }
  return res;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { folderId, destinationParentId } = parsed.data;
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

    const row = folder as FolderRow;
    const actualDataRoomId = row.data_room_id ?? null;
    if (
      (requestedDataRoomId && requestedDataRoomId !== actualDataRoomId) ||
      (!requestedDataRoomId && actualDataRoomId)
    ) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const workspaceId = row.workspace_id;
    const { data: canEdit, error: canEditError } = actualDataRoomId
      ? await supabase.rpc("can_edit_data_room", {
          ws: workspaceId,
          room_id: actualDataRoomId,
        })
      : await supabase.rpc("can_edit_workspace_documents", { ws: workspaceId });

    if (canEditError || !canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // No-op move.
    if ((row.parent_folder_id ?? null) === (destinationParentId ?? null)) {
      return NextResponse.json({ ok: true, folder: row });
    }

    // Validate destination parent (if any).
    if (destinationParentId) {
      const { data: dest, error: destError } = await supabase
        .from("folders")
        .select("id, workspace_id, data_room_id")
        .eq("id", destinationParentId)
        .maybeSingle();
      if (destError || !dest) {
        return NextResponse.json(
          { error: "Destination folder not found" },
          { status: 404 },
        );
      }
      const destWs = (dest as { workspace_id?: string }).workspace_id;
      const destRoom =
        (dest as { data_room_id?: string | null }).data_room_id ?? null;
      if (destWs !== workspaceId || destRoom !== actualDataRoomId) {
        return NextResponse.json(
          { error: "Destination folder not found" },
          { status: 404 },
        );
      }
      if (destinationParentId === folderId) {
        return NextResponse.json(
          { error: "Cannot move a folder into itself." },
          { status: 400 },
        );
      }
    }

    // Cycle guard: destination cannot be in the folder's subtree.
    const scopeQuery = supabase
      .from("folders")
      .select("id, name, workspace_id, parent_folder_id, data_room_id")
      .eq("workspace_id", workspaceId);
    if (actualDataRoomId) scopeQuery.eq("data_room_id", actualDataRoomId);
    else scopeQuery.is("data_room_id", null);
    const { data: allFolders, error: allErr } = await scopeQuery;
    if (allErr) {
      console.error("[folders.move] failed to load scope folders", allErr);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    const descendants = buildDescendantSet(
      (allFolders ?? []) as FolderRow[],
      folderId,
    );
    if (destinationParentId && descendants.has(destinationParentId)) {
      return NextResponse.json(
        { error: "Cannot move a folder into itself." },
        { status: 400 },
      );
    }

    // Duplicate check in destination (case-insensitive).
    const normalizedLower = (row.name || "").trim().toLowerCase();
    const siblingsQuery = supabase
      .from("folders")
      .select("id, name")
      .eq("workspace_id", workspaceId);
    if (actualDataRoomId) siblingsQuery.eq("data_room_id", actualDataRoomId);
    else siblingsQuery.is("data_room_id", null);
    if (destinationParentId)
      siblingsQuery.eq("parent_folder_id", destinationParentId);
    else siblingsQuery.is("parent_folder_id", null);
    const { data: destSiblings, error: sibErr } = await siblingsQuery;
    if (sibErr) {
      console.error("[folders.move] failed to load dest siblings", sibErr);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    const conflict = (destSiblings ?? []).some((s) => {
      if (!s?.id || s.id === folderId) return false;
      const n = typeof s.name === "string" ? s.name.trim().toLowerCase() : "";
      return n === normalizedLower;
    });
    if (conflict) {
      return NextResponse.json(
        { error: "A folder with this name already exists in this location." },
        { status: 409 },
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("folders")
      .update({ parent_folder_id: destinationParentId })
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
      console.error("[folders.move] update failed", updateError);
      return NextResponse.json(
        { error: "Unable to move folder" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, folder: updated });
  } catch (err) {
    console.error("[folders.move] unexpected error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
