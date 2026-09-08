import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { clientEnv } from "@/lib/env";
import { claimEmailDelivery, sendClaimedEmail } from "@/server/emailDeliveries";
import {
  buildWorkspaceAccessChangedEmail,
  buildWorkspaceRemovedEmail,
} from "@/server/emails/templates";
import { getOrCreateNotificationPreferences } from "@/server/notificationPreferences";

const AccessLevelSchema = z.enum(["none", "viewer", "editor"]);
const RoomAccessLevelSchema = z.enum(["viewer", "editor"]);

const MemberRoomSchema = z.object({
  dataRoomId: z.string().uuid(),
  accessLevel: RoomAccessLevelSchema,
});

const RequestSchema = z.object({
  workspaceId: z.string().uuid(),
});

const UpdateMemberSchema = z
  .object({
    workspaceId: z.string().uuid(),
    userId: z.string().uuid(),
    documentsAccess: AccessLevelSchema.optional(),
    dataRoomsAccessAll: AccessLevelSchema.optional(),
    dataRooms: z.array(MemberRoomSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.documentsAccess === undefined &&
      value.dataRoomsAccessAll === undefined &&
      value.dataRooms === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field must be provided (access overrides).",
      });
    }
  });

const RemoveMemberSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
});

const dedupeIds = (ids: string[]): string[] =>
  Array.from(new Set(ids.filter(Boolean)));

const ensureOwnerMembership = async (
  workspaceId: string,
): Promise<{ userId: string; ownerUserId: string; workspaceName: string }> => {
  const userClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: workspace, error: workspaceError } = await userClient
    .from("workspaces")
    .select("id, created_by, name")
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

  return {
    userId: user.id,
    ownerUserId: workspace.created_by,
    workspaceName: workspace.name ?? "Workspace",
  };
};

type DataRoomSummary = {
  id: string;
  name: string | null;
};

const loadWorkspaceDataRoomMap = async (
  workspaceId: string,
): Promise<Map<string, DataRoomSummary>> => {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin
    .from("data_rooms")
    .select("id, name")
    .eq("workspace_id", workspaceId);

  if (error) {
    throw error;
  }

  const map = new Map<string, DataRoomSummary>();
  (data ?? []).forEach((room) => {
    map.set(room.id, { id: room.id, name: room.name ?? null });
  });
  return map;
};

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { workspaceId } = parsed.data;

    const userClient = await createSupabaseServerClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: workspace, error: workspaceError } = await userClient
      .from("workspaces")
      .select("id, created_by")
      .eq("id", workspaceId)
      .maybeSingle();

    if (workspaceError) {
      return NextResponse.json(
        { error: "Failed to load workspace" },
        { status: 500 },
      );
    }

    if (!workspace || workspace.created_by !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const ownerUserId = workspace.created_by;

    const supabase = createSupabaseServiceClient();

    // Get workspace members + membership flags.
    const { data: wmRows, error: wmErr } = await supabase
      .from("workspace_members")
      .select("user_id, documents_access, data_rooms_access_all")
      .eq("workspace_id", workspaceId);
    if (wmErr) {
      console.error("[settings.workspace-members] fetch failed", wmErr);
      return NextResponse.json(
        { error: "Failed to load workspace members" },
        { status: 500 },
      );
    }
    const members = (wmRows || []) as Array<{
      user_id: string;
      documents_access: string;
      data_rooms_access_all: string;
    }>;

    // Get profile names
    const userIds = members.map((m) => m.user_id);
    const { data: profiles } =
      userIds.length > 0
        ? await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", userIds)
        : { data: [] };
    const idToName = new Map<string, string | null>();
    (profiles || []).forEach(
      (p: { id?: string; full_name?: string | null }) => {
        if (p?.id) idToName.set(p.id, p.full_name || null);
      },
    );

    // Get user emails (admin API)
    const idToEmail = new Map<string, string | null>();
    if (userIds.length > 0) {
      await Promise.all(
        userIds.map(async (userId) => {
          const { data: authUser, error: authErr } =
            await supabase.auth.admin.getUserById(userId);
          if (authErr) {
            console.error(
              `[settings.workspace-members] failed to get user ${userId}`,
              authErr,
            );
            idToEmail.set(userId, null);
            return;
          }
          idToEmail.set(userId, authUser.user.email ?? null);
        }),
      );
    }

    const dataRoomMap = await loadWorkspaceDataRoomMap(workspaceId);
    const memberRoomAccessMap = new Map<
      string,
      Map<string, "viewer" | "editor">
    >();
    if (userIds.length > 0) {
      const { data: roomMembershipRows, error: roomMembershipError } =
        await supabase
          .from("data_room_members")
          .select("user_id, data_room_id, access_level")
          .eq("workspace_id", workspaceId)
          .in("user_id", userIds);

      if (roomMembershipError) {
        console.error(
          "[settings.workspace-members] data room membership fetch failed",
          roomMembershipError,
        );
      } else {
        (roomMembershipRows ?? []).forEach((row) => {
          if (!row.user_id || !row.data_room_id) return;
          const perUser = memberRoomAccessMap.get(row.user_id) ?? new Map();
          const level = row.access_level === "editor" ? "editor" : "viewer";
          perUser.set(row.data_room_id, level);
          memberRoomAccessMap.set(row.user_id, perUser);
        });
      }
    }

    const enriched = members.map((m) => {
      const isOwner = m.user_id === ownerUserId;
      const documentsAccess = isOwner
        ? "editor"
        : (m.documents_access ?? "none");
      const dataRoomsAccessAll = isOwner
        ? "editor"
        : (m.data_rooms_access_all ?? "none");
      const perUserRooms = memberRoomAccessMap.get(m.user_id) ?? new Map();
      const explicitDataRoomIds = dedupeIds(Array.from(perUserRooms.keys()));

      return {
        user_id: m.user_id,
        is_owner: isOwner,
        email: idToEmail.get(m.user_id) ?? null,
        name: idToName.get(m.user_id) ?? null,
        documents_access: documentsAccess,
        data_rooms_access_all: dataRoomsAccessAll,
        explicit_data_room_ids: explicitDataRoomIds,
        explicit_data_rooms: explicitDataRoomIds
          .map((roomId) => {
            const room = dataRoomMap.get(roomId);
            if (!room) return null;
            return {
              ...room,
              access_level: perUserRooms.get(roomId) ?? "viewer",
            };
          })
          .filter(Boolean),
      };
    });

    const { data: invites, error: invitesError } = await supabase
      .from("workspace_invites")
      .select(
        "id, email, documents_access, data_rooms_access_all, invited_at, accepted_at, accepted_by, revoked_at, rejected_at, rejected_by, expires_at",
      )
      .eq("workspace_id", workspaceId)
      .is("revoked_at", null)
      .order("invited_at", { ascending: false });
    if (invitesError) {
      console.error(
        "[settings.workspace-members] invites fetch failed",
        invitesError,
      );
    }

    const inviteRows = (invites ?? []) as Array<{
      id: string;
      email: string;
      documents_access: string;
      data_rooms_access_all: string;
      invited_at: string;
      accepted_at: string | null;
      accepted_by: string | null;
      revoked_at: string | null;
      rejected_at: string | null;
      rejected_by: string | null;
      expires_at: string | null;
    }>;
    const inviteIds = inviteRows.map((invite) => invite.id);
    const inviteRoomAccessMap = new Map<
      string,
      Map<string, "viewer" | "editor">
    >();
    if (inviteIds.length > 0) {
      const { data: inviteRoomRows, error: inviteRoomError } = await supabase
        .from("workspace_invite_data_room_access")
        .select("invite_id, data_room_id, access_level")
        .eq("workspace_id", workspaceId)
        .in("invite_id", inviteIds);

      if (inviteRoomError) {
        console.error(
          "[settings.workspace-members] invite room assignments fetch failed",
          inviteRoomError,
        );
      } else {
        (inviteRoomRows ?? []).forEach((row) => {
          if (!row.invite_id || !row.data_room_id) return;
          const perInvite = inviteRoomAccessMap.get(row.invite_id) ?? new Map();
          const level = row.access_level === "editor" ? "editor" : "viewer";
          perInvite.set(row.data_room_id, level);
          inviteRoomAccessMap.set(row.invite_id, perInvite);
        });
      }
    }

    const enrichedInvites = inviteRows.map((invite) => {
      const perInviteRooms = inviteRoomAccessMap.get(invite.id) ?? new Map();
      const explicitDataRoomIds = dedupeIds(Array.from(perInviteRooms.keys()));
      return {
        ...invite,
        documents_access: invite.documents_access ?? "none",
        data_rooms_access_all: invite.data_rooms_access_all ?? "none",
        explicit_data_room_ids: explicitDataRoomIds,
        explicit_data_rooms: explicitDataRoomIds
          .map((roomId) => {
            const room = dataRoomMap.get(roomId);
            if (!room) return null;
            return {
              ...room,
              access_level: perInviteRooms.get(roomId) ?? "viewer",
            };
          })
          .filter(Boolean),
      };
    });

    return NextResponse.json({
      members: enriched,
      invites: enrichedInvites,
      viewerIsOwner: true,
    });
  } catch (err) {
    const sanitizedErr = err instanceof Error ? err.message : "Unknown error";
    console.error("[settings.workspace-members] error", sanitizedErr);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = UpdateMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const {
      workspaceId,
      userId: targetUserId,
      documentsAccess: overrideDocumentsAccess,
      dataRoomsAccessAll: overrideDataRoomsAccessAll,
      dataRooms: overrideDataRooms,
    } = parsed.data;
    const {
      userId: actorUserId,
      ownerUserId,
      workspaceName,
    } = await ensureOwnerMembership(workspaceId);
    if (
      actorUserId === targetUserId &&
      (overrideDocumentsAccess !== undefined ||
        overrideDataRoomsAccessAll !== undefined ||
        overrideDataRooms !== undefined)
    ) {
      return NextResponse.json(
        { error: "You can't change your own access." },
        { status: 400 },
      );
    }

    const admin = createSupabaseServiceClient();

    const { data: target, error: targetError } = await admin
      .from("workspace_members")
      .select("user_id, documents_access, data_rooms_access_all")
      .eq("workspace_id", workspaceId)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json(
        { error: "Failed to load member" },
        { status: 500 },
      );
    }
    if (!target) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    let resolvedDocumentsAccess = target.documents_access ?? "none";
    let resolvedDataRoomsAccessAll = target.data_rooms_access_all ?? "none";
    const targetIsOwner = targetUserId === ownerUserId;
    if (targetIsOwner) {
      return NextResponse.json(
        { error: "Workspace owner access is implicit and cannot be edited." },
        { status: 400 },
      );
    }

    // Apply per-member overrides (if provided). Presets are just the starting point.
    if (overrideDocumentsAccess !== undefined) {
      resolvedDocumentsAccess = overrideDocumentsAccess;
    }
    if (overrideDataRoomsAccessAll !== undefined) {
      resolvedDataRoomsAccessAll = overrideDataRoomsAccessAll;
    }

    const { data: updated, error: updateError } = await admin
      .from("workspace_members")
      .update({
        documents_access: resolvedDocumentsAccess,
        data_rooms_access_all: resolvedDataRoomsAccessAll,
      })
      .eq("workspace_id", workspaceId)
      .eq("user_id", targetUserId)
      .select("user_id, documents_access, data_rooms_access_all")
      .maybeSingle();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: "Failed to update member" },
        { status: 500 },
      );
    }

    // Explicit room access:
    // - If `dataRooms` override is provided, it becomes the source-of-truth for this member.
    // - If global data room access is granted, explicit rows are typically unnecessary (but can still exist).
    if (overrideDataRooms !== undefined) {
      const dedupedRooms = dedupeRooms(overrideDataRooms);
      await ensureRoomsBelongToWorkspace(
        admin,
        workspaceId,
        dedupedRooms.map((r) => r.dataRoomId),
      );

      const rows = dedupedRooms.map((r) => ({
        workspace_id: workspaceId,
        data_room_id: r.dataRoomId,
        user_id: targetUserId,
        access_level: r.accessLevel,
        created_by: actorUserId,
      }));

      if (rows.length > 0) {
        const { error: upsertError } = await admin
          .from("data_room_members")
          .upsert(rows, { onConflict: "data_room_id,user_id" });
        if (upsertError) {
          return NextResponse.json(
            { error: "Failed to grant room access" },
            { status: 500 },
          );
        }
      }

      const { data: existingRows, error: existingRowsError } = await admin
        .from("data_room_members")
        .select("data_room_id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", targetUserId);

      if (existingRowsError) {
        return NextResponse.json(
          { error: "Failed to update explicit room access" },
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
          .from("data_room_members")
          .delete()
          .eq("workspace_id", workspaceId)
          .eq("user_id", targetUserId)
          .in("data_room_id", staleRoomIds);
        if (clearError) {
          return NextResponse.json(
            { error: "Failed to update explicit room access" },
            { status: 500 },
          );
        }
      }
    } else if ((resolvedDataRoomsAccessAll ?? "none") === "editor") {
      // Safety: if member now has editor access to all rooms, explicit rows
      // are redundant unless the caller explicitly provided an override.
      const { error: clearError } = await admin
        .from("data_room_members")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("user_id", targetUserId);
      if (clearError) {
        console.error(
          "[settings.workspace-members][PATCH] failed to clear explicit room access",
          clearError,
        );
      }
    }

    const {
      data: { user: targetAuthUser },
      error: targetAuthUserError,
    } = await admin.auth.admin.getUserById(targetUserId);
    if (!targetAuthUserError && targetAuthUser?.email) {
      try {
        const prefs = await getOrCreateNotificationPreferences(targetUserId);
        if (prefs.securityWorkspaceEmailsEnabled) {
          const claim = await claimEmailDelivery({
            template: "workspace-access-changed",
            toEmail: targetAuthUser.email,
            userId: targetUserId,
            workspaceId,
          });
          if (claim.claimed) {
            const email = buildWorkspaceAccessChangedEmail({
              workspaceName,
              documentsAccess: resolvedDocumentsAccess,
              dataRoomsAccessAll: resolvedDataRoomsAccessAll,
              settingsUrl: `${clientEnv.NEXT_PUBLIC_APP_URL}/settings?tab=notifications`,
            });
            await sendClaimedEmail({
              id: claim.id,
              claimToken: claim.token,
              toEmail: targetAuthUser.email,
              subject: email.subject,
              html: email.html,
              text: email.text,
            });
          }
        }
      } catch (error) {
        console.error(
          "[settings.workspace-members][PATCH] failed to send access-change email",
          { workspaceId, targetUserId, error },
        );
      }
    }

    return NextResponse.json({ member: updated });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[settings.workspace-members][PATCH] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RemoveMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { workspaceId, userId: targetUserId } = parsed.data;
    const {
      userId: actorUserId,
      ownerUserId,
      workspaceName,
    } = await ensureOwnerMembership(workspaceId);
    if (actorUserId === targetUserId) {
      return NextResponse.json(
        { error: "You can't remove yourself from the workspace." },
        { status: 400 },
      );
    }
    if (targetUserId === ownerUserId) {
      return NextResponse.json(
        { error: "You can't remove the workspace owner." },
        { status: 400 },
      );
    }

    const admin = createSupabaseServiceClient();

    const { data: target, error: targetError } = await admin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json(
        { error: "Failed to load member" },
        { status: 500 },
      );
    }
    if (!target) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const { error: deleteError } = await admin
      .from("workspace_members")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("user_id", targetUserId);

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to remove member" },
        { status: 500 },
      );
    }

    const { error: clearRoomsError } = await admin
      .from("data_room_members")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("user_id", targetUserId);
    if (clearRoomsError) {
      console.error(
        "[settings.workspace-members][DELETE] failed to clear room access",
        clearRoomsError,
      );
    }

    const {
      data: { user: targetAuthUser },
      error: targetAuthUserError,
    } = await admin.auth.admin.getUserById(targetUserId);
    if (!targetAuthUserError && targetAuthUser?.email) {
      try {
        const prefs = await getOrCreateNotificationPreferences(targetUserId);
        if (prefs.securityWorkspaceEmailsEnabled) {
          const claim = await claimEmailDelivery({
            template: "workspace-removed",
            toEmail: targetAuthUser.email,
            userId: targetUserId,
            workspaceId,
          });
          if (claim.claimed) {
            const email = buildWorkspaceRemovedEmail({
              workspaceName,
              settingsUrl: `${clientEnv.NEXT_PUBLIC_APP_URL}/settings?tab=notifications`,
            });
            await sendClaimedEmail({
              id: claim.id,
              claimToken: claim.token,
              toEmail: targetAuthUser.email,
              subject: email.subject,
              html: email.html,
              text: email.text,
            });
          }
        }
      } catch (error) {
        console.error(
          "[settings.workspace-members][DELETE] failed to send removal email",
          { workspaceId, targetUserId, error },
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[settings.workspace-members][DELETE] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
