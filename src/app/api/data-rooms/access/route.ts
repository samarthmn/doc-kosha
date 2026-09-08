import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";

const ListSchema = z.object({
  dataRoomId: z.string().uuid(),
});

const SetAccessSchema = z.object({
  dataRoomId: z.string().uuid(),
  userId: z.string().uuid(),
  accessLevel: z.enum(["none", "viewer", "editor"]),
});

const ensureOwnerForDataRoom = async (dataRoomId: string) => {
  const userClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: room, error: roomError } = await userClient
    .from("data_rooms")
    .select("id, workspace_id, name")
    .eq("id", dataRoomId)
    .maybeSingle();

  if (roomError) {
    throw NextResponse.json(
      { error: "Failed to load data room" },
      { status: 500 },
    );
  }
  if (!room) {
    throw NextResponse.json({ error: "Data room not found" }, { status: 404 });
  }

  const { data: workspace, error: workspaceError } = await userClient
    .from("workspaces")
    .select("id, created_by")
    .eq("id", room.workspace_id)
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

  return {
    actorUserId: user.id,
    workspaceId: room.workspace_id as string,
    workspaceOwnerUserId: workspace.created_by,
    dataRoom: room as { id: string; workspace_id: string; name: string | null },
  };
};

type AccessMember = {
  id: string; // userId or inviteId
  type: "member" | "invite";
  userId?: string; // only for members
  email: string | null;
  name: string | null;
  isOwner: boolean;
  documentsAccess: "none" | "viewer" | "editor";
  dataRoomsAccessAll: "none" | "viewer" | "editor";
  explicitAccessLevel: "none" | "viewer" | "editor";
  effectiveAccessLevel: "none" | "viewer" | "editor";
  accessSource: "owner" | "all_data_rooms" | "explicit" | "none";
  invitedAt?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = ListSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { dataRoomId } = parsed.data;
    const { workspaceId, dataRoom, workspaceOwnerUserId } =
      await ensureOwnerForDataRoom(dataRoomId);
    const admin = createSupabaseServiceClient();

    const [
      { data: wmRows, error: wmError },
      { data: drmRows, error: drmError },
      { data: invRows, error: invError },
      { data: idrRows, error: idrError },
    ] = await Promise.all([
      admin
        .from("workspace_members")
        .select("user_id, documents_access, data_rooms_access_all")
        .eq("workspace_id", workspaceId),
      admin
        .from("data_room_members")
        .select("user_id, access_level")
        .eq("workspace_id", workspaceId)
        .eq("data_room_id", dataRoomId),
      admin
        .from("workspace_invites")
        .select(
          "id, email, documents_access, data_rooms_access_all, invited_at",
        )
        .eq("workspace_id", workspaceId)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .is("rejected_at", null),
      admin
        .from("workspace_invite_data_room_access")
        .select("invite_id, access_level")
        .eq("workspace_id", workspaceId)
        .eq("data_room_id", dataRoomId),
    ]);

    if (wmError || drmError || invError || idrError) {
      console.error("[data-rooms.access] fetch failed", {
        wmError,
        drmError,
        invError,
        idrError,
      });
      return NextResponse.json(
        { error: "Failed to load access list" },
        { status: 500 },
      );
    }

    const members = wmRows ?? [];
    const explicitMap = new Map<string, "none" | "viewer" | "editor">();
    (drmRows ?? []).forEach((r) => {
      if (!r.user_id) return;
      const level =
        r.access_level === "editor"
          ? "editor"
          : r.access_level === "viewer"
            ? "viewer"
            : "none";
      explicitMap.set(r.user_id, level);
    });

    const inviteExplicitMap = new Map<string, "none" | "viewer" | "editor">();
    (idrRows ?? []).forEach((r) => {
      if (!r.invite_id) return;
      const level = r.access_level === "editor" ? "editor" : "viewer";
      inviteExplicitMap.set(r.invite_id, level);
    });

    const userIds = members.map((m) => m.user_id);

    const { data: profiles } =
      userIds.length > 0
        ? await admin.from("profiles").select("id, full_name").in("id", userIds)
        : { data: [] };

    const idToName = new Map<string, string | null>();
    (profiles ?? []).forEach(
      (p: { id?: string; full_name?: string | null }) => {
        if (p?.id) idToName.set(p.id, p.full_name || null);
      },
    );

    const idToEmail = new Map<string, string | null>();
    if (userIds.length > 0) {
      await Promise.all(
        userIds.map(async (userId) => {
          const { data: authUser, error: authErr } =
            await admin.auth.admin.getUserById(userId);
          if (authErr) {
            console.error(
              `[data-rooms.access] failed to get user ${userId}`,
              authErr,
            );
            idToEmail.set(userId, null);
            return;
          }
          idToEmail.set(userId, authUser.user.email ?? null);
        }),
      );
    }

    const memberRows: AccessMember[] = members.map((m) => {
      const isOwner = m.user_id === workspaceOwnerUserId;
      const documentsAccess: AccessMember["documentsAccess"] = isOwner
        ? "editor"
        : (m.documents_access ?? "none");
      const dataRoomsAccessAll: AccessMember["dataRoomsAccessAll"] = isOwner
        ? "editor"
        : (m.data_rooms_access_all ?? "none");
      const explicitAccessLevel: AccessMember["explicitAccessLevel"] =
        explicitMap.get(m.user_id) ?? "none";

      const effectiveAccessLevel: AccessMember["effectiveAccessLevel"] = isOwner
        ? "editor"
        : dataRoomsAccessAll !== "none"
          ? dataRoomsAccessAll
          : explicitAccessLevel !== "none"
            ? explicitAccessLevel
            : "none";

      const accessSource: AccessMember["accessSource"] = isOwner
        ? "owner"
        : dataRoomsAccessAll !== "none"
          ? "all_data_rooms"
          : explicitAccessLevel !== "none"
            ? "explicit"
            : "none";

      return {
        id: m.user_id,
        type: "member",
        userId: m.user_id,
        email: idToEmail.get(m.user_id) ?? null,
        name: idToName.get(m.user_id) ?? null,
        isOwner,
        documentsAccess,
        dataRoomsAccessAll,
        explicitAccessLevel,
        effectiveAccessLevel,
        accessSource,
      };
    });

    const inviteRows: AccessMember[] = [];
    (invRows ?? []).forEach((inv) => {
      const documentsAccess = (inv.documents_access ??
        "none") as AccessMember["documentsAccess"];
      const dataRoomsAccessAll = (inv.data_rooms_access_all ??
        "none") as AccessMember["dataRoomsAccessAll"];
      const explicitAccessLevel: AccessMember["explicitAccessLevel"] =
        inviteExplicitMap.get(inv.id) ?? "none";

      const effectiveAccessLevel: AccessMember["effectiveAccessLevel"] =
        dataRoomsAccessAll !== "none"
          ? dataRoomsAccessAll
          : explicitAccessLevel !== "none"
            ? explicitAccessLevel
            : "none";

      const accessSource: AccessMember["accessSource"] =
        dataRoomsAccessAll !== "none"
          ? "all_data_rooms"
          : explicitAccessLevel !== "none"
            ? "explicit"
            : "none";

      inviteRows.push({
        id: inv.id,
        type: "invite",
        email: inv.email,
        name: null,
        isOwner: false,
        documentsAccess,
        dataRoomsAccessAll,
        explicitAccessLevel,
        effectiveAccessLevel,
        accessSource,
        invitedAt: inv.invited_at,
      });
    });

    const rows = [...memberRows, ...inviteRows];

    rows.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "member" ? -1 : 1;
      }
      const rr = Number(b.isOwner) - Number(a.isOwner);
      if (rr !== 0) return rr;
      const ae = a.email ?? "";
      const be = b.email ?? "";
      return ae.localeCompare(be);
    });

    return NextResponse.json({
      dataRoom: { id: dataRoom.id, name: dataRoom.name, workspaceId },
      members: rows,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[data-rooms.access][POST] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = SetAccessSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { dataRoomId, userId: targetUserId, accessLevel } = parsed.data;
    const { actorUserId, workspaceId, workspaceOwnerUserId } =
      await ensureOwnerForDataRoom(dataRoomId);
    if (targetUserId === workspaceOwnerUserId) {
      return NextResponse.json(
        { error: "You can't change the workspace owner's access." },
        { status: 400 },
      );
    }
    const admin = createSupabaseServiceClient();

    const { count, error: memberError } = await admin
      .from("workspace_members")
      .select("user_id", { head: true, count: "exact" })
      .eq("workspace_id", workspaceId)
      .eq("user_id", targetUserId)
      .limit(1);

    if (memberError) {
      return NextResponse.json(
        { error: "Failed to verify member" },
        { status: 500 },
      );
    }
    if ((count ?? 0) === 0) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (accessLevel === "none") {
      const { error: deleteError } = await admin
        .from("data_room_members")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("data_room_id", dataRoomId)
        .eq("user_id", targetUserId);

      if (deleteError) {
        console.error("[data-rooms.access][PATCH] delete failed", deleteError);
        return NextResponse.json(
          { error: "Failed to revoke access" },
          { status: 500 },
        );
      }
    } else {
      const { error: upsertError } = await admin
        .from("data_room_members")
        .upsert(
          {
            workspace_id: workspaceId,
            data_room_id: dataRoomId,
            user_id: targetUserId,
            access_level: accessLevel,
            created_by: actorUserId,
          },
          { onConflict: "data_room_id,user_id" },
        );

      if (upsertError) {
        console.error("[data-rooms.access][PATCH] upsert failed", upsertError);
        return NextResponse.json(
          { error: "Failed to update access" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[data-rooms.access][PATCH] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = z
      .object({
        dataRoomId: z.string().uuid(),
        userId: z.string().uuid(),
      })
      .safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { dataRoomId, userId: targetUserId } = parsed.data;
    const { workspaceId } = await ensureOwnerForDataRoom(dataRoomId);
    const admin = createSupabaseServiceClient();

    const { error: deleteError } = await admin
      .from("data_room_members")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("data_room_id", dataRoomId)
      .eq("user_id", targetUserId);

    if (deleteError) {
      console.error("[data-rooms.access][DELETE] delete failed", deleteError);
      return NextResponse.json(
        { error: "Failed to revoke access" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[data-rooms.access][DELETE] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
