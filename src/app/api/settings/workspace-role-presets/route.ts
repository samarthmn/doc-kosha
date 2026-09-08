import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import type { TablesUpdate } from "@/types/generated/supabase";

const AccessLevelSchema = z.enum(["none", "viewer", "editor"]);
const RoomAccessLevelSchema = z.enum(["viewer", "editor"]);

const ensureOwnerMembership = async (
  workspaceId: string,
): Promise<{ userId: string }> => {
  const userClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: workspace, error: workspaceError } = await userClient
    .from("workspaces")
    .select("id, created_by")
    .eq("id", workspaceId)
    .maybeSingle();

  if (workspaceError) {
    throw NextResponse.json(
      { error: "Failed to load workspace" },
      { status: 500 },
    );
  }

  if (!workspace || workspace.created_by !== user.id) {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { userId: user.id };
};

const ListSchema = z.object({
  workspaceId: z.string().uuid(),
});

const PresetRoomSchema = z.object({
  dataRoomId: z.string().uuid(),
  accessLevel: RoomAccessLevelSchema,
});

const CreateSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  documentsAccess: AccessLevelSchema.default("none"),
  dataRoomsAccessAll: AccessLevelSchema.default("none"),
  dataRooms: z.array(PresetRoomSchema).default([]),
});

const UpdateSchema = z
  .object({
    workspaceId: z.string().uuid(),
    presetId: z.string().uuid(),
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().optional().nullable(),
    documentsAccess: AccessLevelSchema.optional(),
    dataRoomsAccessAll: AccessLevelSchema.optional(),
    dataRooms: z.array(PresetRoomSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.name === undefined &&
      value.description === undefined &&
      value.documentsAccess === undefined &&
      value.dataRoomsAccessAll === undefined &&
      value.dataRooms === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field must be provided.",
      });
    }
  });

const DeleteSchema = z.object({
  workspaceId: z.string().uuid(),
  presetId: z.string().uuid(),
});

const dedupeRooms = (
  rooms: Array<{ dataRoomId: string; accessLevel: "viewer" | "editor" }>,
) => {
  const map = new Map<string, "viewer" | "editor">();
  rooms.forEach((r) => {
    if (!r?.dataRoomId) return;
    map.set(r.dataRoomId, r.accessLevel);
  });
  return Array.from(map.entries()).map(([dataRoomId, accessLevel]) => ({
    dataRoomId,
    accessLevel,
  }));
};

const ensureRoomsBelongToWorkspace = async (
  admin: ReturnType<typeof createSupabaseServiceClient>,
  workspaceId: string,
  dataRoomIds: string[],
) => {
  const ids = Array.from(new Set(dataRoomIds.filter(Boolean)));
  if (ids.length === 0) return;

  const { data, error } = await admin
    .from("data_rooms")
    .select("id")
    .eq("workspace_id", workspaceId)
    .in("id", ids);

  if (error) {
    throw NextResponse.json(
      { error: "Failed to validate data rooms" },
      { status: 500 },
    );
  }

  const valid = new Set((data ?? []).map((r) => r.id));
  if (valid.size !== ids.length) {
    throw NextResponse.json(
      { error: "One or more data rooms are invalid." },
      { status: 400 },
    );
  }
};

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = ListSchema.safeParse({
      workspaceId: url.searchParams.get("workspaceId"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { workspaceId } = parsed.data;
    await ensureOwnerMembership(workspaceId);
    const admin = createSupabaseServiceClient();

    const [
      { data: presets, error: presetsError },
      { data: roomRows, error: roomsError },
    ] = await Promise.all([
      admin
        .from("workspace_role_presets")
        .select(
          "id, workspace_id, name, description, documents_access, data_rooms_access_all, created_at, updated_at",
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true }),
      admin
        .from("workspace_role_preset_data_rooms")
        .select("preset_id, data_room_id, access_level")
        .eq("workspace_id", workspaceId),
    ]);

    if (presetsError || roomsError) {
      console.error("[workspace-role-presets][GET] fetch failed", {
        presetsError,
        roomsError,
      });
      return NextResponse.json(
        { error: "Failed to load role presets" },
        { status: 500 },
      );
    }

    const presetIdToRooms = new Map<
      string,
      Array<{ dataRoomId: string; accessLevel: string }>
    >();
    (roomRows ?? []).forEach((row) => {
      if (!row?.preset_id || !row?.data_room_id) return;
      const next = presetIdToRooms.get(row.preset_id) ?? [];
      next.push({
        dataRoomId: row.data_room_id,
        accessLevel: row.access_level,
      });
      presetIdToRooms.set(row.preset_id, next);
    });

    const enriched = (presets ?? []).map((p) => ({
      ...p,
      rooms: presetIdToRooms.get(p.id) ?? [],
    }));

    return NextResponse.json({ presets: enriched });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[workspace-role-presets][GET] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const {
      workspaceId,
      name,
      description,
      documentsAccess,
      dataRoomsAccessAll,
      dataRooms,
    } = parsed.data;

    const { userId } = await ensureOwnerMembership(workspaceId);
    const admin = createSupabaseServiceClient();
    const dedupedRooms = dedupeRooms(dataRooms);

    if (dedupedRooms.length > 0) {
      await ensureRoomsBelongToWorkspace(
        admin,
        workspaceId,
        dedupedRooms.map((r) => r.dataRoomId),
      );
    }

    const { data: inserted, error: insertError } = await admin
      .from("workspace_role_presets")
      .insert({
        workspace_id: workspaceId,
        name,
        description: description ?? null,
        documents_access: documentsAccess,
        data_rooms_access_all: dataRoomsAccessAll,
        created_by: userId,
      })
      .select(
        "id, workspace_id, name, description, documents_access, data_rooms_access_all, created_at, updated_at",
      )
      .single();

    if (insertError || !inserted) {
      if (insertError?.code === "23505") {
        return NextResponse.json(
          { error: "A preset with this name already exists." },
          { status: 409 },
        );
      }
      console.error(
        "[workspace-role-presets][POST] insert failed",
        insertError,
      );
      return NextResponse.json(
        { error: "Failed to create preset" },
        { status: 500 },
      );
    }

    if (dedupedRooms.length > 0) {
      const rows = dedupedRooms.map((r) => ({
        workspace_id: workspaceId,
        preset_id: inserted.id,
        data_room_id: r.dataRoomId,
        access_level: r.accessLevel,
        created_by: userId,
      }));

      const { error: joinError } = await admin
        .from("workspace_role_preset_data_rooms")
        .insert(rows);

      if (joinError) {
        console.error(
          "[workspace-role-presets][POST] room join insert failed",
          joinError,
        );
        await admin
          .from("workspace_role_presets")
          .delete()
          .eq("workspace_id", workspaceId)
          .eq("id", inserted.id);
        return NextResponse.json(
          { error: "Failed to set data room access. Please try again." },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ preset: inserted }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[workspace-role-presets][POST] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const {
      workspaceId,
      presetId,
      name,
      description,
      documentsAccess,
      dataRoomsAccessAll,
      dataRooms,
    } = parsed.data;

    const { userId } = await ensureOwnerMembership(workspaceId);
    const admin = createSupabaseServiceClient();

    const updatePayload: TablesUpdate<"workspace_role_presets"> = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) updatePayload.name = name;
    if (description !== undefined) updatePayload.description = description;
    if (documentsAccess !== undefined)
      updatePayload.documents_access = documentsAccess;
    if (dataRoomsAccessAll !== undefined)
      updatePayload.data_rooms_access_all = dataRoomsAccessAll;

    const { data: updated, error: updateError } = await admin
      .from("workspace_role_presets")
      .update(updatePayload)
      .eq("workspace_id", workspaceId)
      .eq("id", presetId)
      .select(
        "id, workspace_id, name, description, documents_access, data_rooms_access_all, created_at, updated_at",
      )
      .maybeSingle();

    if (updateError) {
      if (updateError.code === "23505") {
        return NextResponse.json(
          { error: "A preset with this name already exists." },
          { status: 409 },
        );
      }
      console.error(
        "[workspace-role-presets][PATCH] update failed",
        updateError,
      );
      return NextResponse.json(
        { error: "Failed to update preset" },
        { status: 500 },
      );
    }
    if (!updated) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }

    if (dataRooms !== undefined) {
      const dedupedRooms = dedupeRooms(dataRooms);
      await ensureRoomsBelongToWorkspace(
        admin,
        workspaceId,
        dedupedRooms.map((r) => r.dataRoomId),
      );

      const rows = dedupedRooms.map((r) => ({
        workspace_id: workspaceId,
        preset_id: presetId,
        data_room_id: r.dataRoomId,
        access_level: r.accessLevel,
        created_by: userId,
      }));

      if (rows.length > 0) {
        const { error: upsertRoomsError } = await admin
          .from("workspace_role_preset_data_rooms")
          .upsert(rows, { onConflict: "preset_id,data_room_id" });

        if (upsertRoomsError) {
          console.error(
            "[workspace-role-presets][PATCH] failed to upsert room assignments",
            upsertRoomsError,
          );
          return NextResponse.json(
            { error: "Failed to update data room assignments" },
            { status: 500 },
          );
        }
      }

      const { data: existingRows, error: existingRowsError } = await admin
        .from("workspace_role_preset_data_rooms")
        .select("data_room_id")
        .eq("workspace_id", workspaceId)
        .eq("preset_id", presetId);

      if (existingRowsError) {
        console.error(
          "[workspace-role-presets][PATCH] failed to load existing room assignments",
          existingRowsError,
        );
        return NextResponse.json(
          { error: "Failed to update data room assignments" },
          { status: 500 },
        );
      }

      const desiredRoomIds = new Set(dedupedRooms.map((r) => r.dataRoomId));
      const staleRoomIds = (existingRows ?? [])
        .map((row) => row.data_room_id)
        .filter((roomId): roomId is string => Boolean(roomId))
        .filter((roomId) => !desiredRoomIds.has(roomId));

      if (staleRoomIds.length > 0) {
        const { error: clearError } = await admin
          .from("workspace_role_preset_data_rooms")
          .delete()
          .eq("workspace_id", workspaceId)
          .eq("preset_id", presetId)
          .in("data_room_id", staleRoomIds);

        if (clearError) {
          console.error(
            "[workspace-role-presets][PATCH] failed to remove stale room assignments",
            clearError,
          );
          return NextResponse.json(
            { error: "Failed to update data room assignments" },
            { status: 500 },
          );
        }
      }
    }

    return NextResponse.json({ preset: updated });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[workspace-role-presets][PATCH] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = DeleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { workspaceId, presetId } = parsed.data;
    await ensureOwnerMembership(workspaceId);
    const admin = createSupabaseServiceClient();

    const { error } = await admin
      .from("workspace_role_presets")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("id", presetId);

    if (error) {
      console.error("[workspace-role-presets][DELETE] failed", error);
      return NextResponse.json(
        { error: "Failed to delete preset" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[workspace-role-presets][DELETE] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
