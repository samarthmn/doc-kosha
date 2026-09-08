import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import {
  DATA_ROOM_CONVERTED_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
} from "@/lib/constants";
import { deleteMany, type LogicalBucket } from "@/server/storage";

const RequestSchema = z.object({
  workspaceId: z.string().uuid(),
  dataRoomId: z.string().uuid(),
});

const isDataRoomLogicalBucket = (
  value: string,
): value is
  | typeof DATA_ROOM_STORAGE_BUCKET_NAME
  | typeof DATA_ROOM_CONVERTED_BUCKET_NAME =>
  value === DATA_ROOM_STORAGE_BUCKET_NAME ||
  value === DATA_ROOM_CONVERTED_BUCKET_NAME;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { workspaceId, dataRoomId } = parsed.data;

    // 1. Authenticate caller
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Verify caller can edit this data room before any service-role write
    const { data: canEdit, error: canEditError } = await supabase.rpc(
      "can_edit_data_room",
      { ws: workspaceId, room_id: dataRoomId },
    );
    if (canEditError || !canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createSupabaseServiceClient();

    // 3. Confirm the room belongs to the workspace the caller was checked on
    const { data: room, error: roomError } = await admin
      .from("data_rooms")
      .select("id, workspace_id")
      .eq("id", dataRoomId)
      .maybeSingle();
    if (roomError) {
      console.error("[data-rooms/delete] failed to load data room", {
        dataRoomId,
        error: roomError,
      });
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    if (!room || room.workspace_id !== workspaceId) {
      return NextResponse.json(
        { error: "Data room not found" },
        { status: 404 },
      );
    }

    // 4. Delete DB rows in one database transaction and return all current +
    // archived version storage paths that should be cleaned up afterwards.
    const { data: storageRows, error: deleteError } = await admin.rpc(
      "delete_data_room_cascade",
      {
        p_workspace_id: workspaceId,
        p_data_room_id: dataRoomId,
      },
    );
    if (deleteError) {
      console.error("[data-rooms/delete] transactional delete failed", {
        dataRoomId,
        workspaceId,
        error: deleteError,
      });
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    // 5. R2 object cleanup last (best-effort; DB is already consistent).
    // Only paths scoped to this workspace and data-room buckets are eligible.
    const workspacePrefix = `workspaces/${workspaceId}/`;
    const storageKeys: Array<{ logicalBucket: LogicalBucket; path: string }> =
      [];
    const seenStorageKeys = new Set<string>();
    for (const row of storageRows ?? []) {
      if (
        !isDataRoomLogicalBucket(row.logical_bucket) ||
        !row.storage_path.startsWith(workspacePrefix)
      ) {
        continue;
      }
      const key = `${row.logical_bucket}:${row.storage_path}`;
      if (seenStorageKeys.has(key)) continue;
      seenStorageKeys.add(key);
      storageKeys.push({
        logicalBucket: row.logical_bucket,
        path: row.storage_path,
      });
    }

    let objectsDeleted = 0;
    if (storageKeys.length > 0) {
      const result = await deleteMany({ keys: storageKeys });
      if (!result.ok) {
        console.error("[data-rooms/delete] R2 cleanup failed", {
          dataRoomId,
          workspaceId,
          message: result.message,
        });
      } else {
        objectsDeleted = result.deletedCount ?? storageKeys.length;
      }
    }

    return NextResponse.json({
      ok: true,
      storageObjectsQueued: storageKeys.length,
      objectsDeleted,
    });
  } catch (err) {
    console.error("[data-rooms/delete] unexpected error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
