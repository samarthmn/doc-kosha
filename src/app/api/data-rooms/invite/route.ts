import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { clientEnv } from "@/lib/env";
import { sendAppEmail } from "@/server/emailHelper";
import { buildDataRoomInviteEmail } from "@/server/emails/templates";
import { assertWorkspaceMemberInviteAllowed } from "@/modules/billing/server/planGuards";
import { sanitizeInternalReturnPath } from "@/lib/internalReturnPath";

const AccessLevelSchema = z.enum(["none", "viewer", "editor"]);
const RoomAccessLevelSchema = z.enum(["viewer", "editor"]);

const InviteRoomSchema = z.object({
  dataRoomId: z.string().uuid(),
  accessLevel: RoomAccessLevelSchema,
});

const RequestSchema = z.object({
  dataRoomId: z.string().uuid(),
  email: z.string().email(),
  documentsAccess: AccessLevelSchema.default("none"),
  dataRoomsAccessAll: AccessLevelSchema.default("none"),
  dataRooms: z.array(InviteRoomSchema).default([]),
});

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const INVITE_TTL_DAYS = 14;

const buildInviteUrl = (inviteId: string, redirect?: string | null) => {
  const url = new URL("/auth/sign-in", clientEnv.NEXT_PUBLIC_APP_URL);
  url.searchParams.set("invite", inviteId);
  const safeRedirect = sanitizeInternalReturnPath(redirect);
  if (safeRedirect) {
    url.searchParams.set("redirect", safeRedirect);
  }
  return url.toString();
};

const resolveAuthUserIdByEmail = async (
  admin: ReturnType<typeof createSupabaseServiceClient>,
  email: string,
): Promise<string | null> => {
  const { data: userId, error } = await admin.rpc("auth_user_id_by_email", {
    p_email: email,
  } as never);
  if (error) {
    console.error("[data-rooms.invite] auth_user_id_by_email failed", error);
    throw NextResponse.json(
      { error: "Failed to verify whether this user already exists" },
      { status: 503 },
    );
  }
  return userId ?? null;
};

const getWorkspaceName = async (
  admin: ReturnType<typeof createSupabaseServiceClient>,
  workspaceId: string,
): Promise<string> => {
  const { data, error } = await admin
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error || !data?.name) return "workspace";
  return data.name;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { dataRoomId, documentsAccess, dataRoomsAccessAll, dataRooms } =
      parsed.data;
    const targetEmail = normalizeEmail(parsed.data.email);

    const userClient = await createSupabaseServerClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: room, error: roomError } = await userClient
      .from("data_rooms")
      .select("id, workspace_id, name")
      .eq("id", dataRoomId)
      .maybeSingle();
    if (roomError) {
      console.error("[data-rooms.invite] data room lookup failed", roomError);
      return NextResponse.json(
        { error: "Failed to load data room" },
        { status: 500 },
      );
    }
    if (!room) {
      return NextResponse.json(
        { error: "Data room not found" },
        { status: 404 },
      );
    }

    const { data: workspace, error: workspaceError } = await userClient
      .from("workspaces")
      .select("id, created_by")
      .eq("id", room.workspace_id)
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

    const admin = createSupabaseServiceClient();
    const workspaceId = room.workspace_id as string;
    const memberLimitCheck =
      await assertWorkspaceMemberInviteAllowed(workspaceId);
    if (!memberLimitCheck.ok) {
      return NextResponse.json(
        { error: memberLimitCheck.message, code: memberLimitCheck.code },
        { status: memberLimitCheck.status },
      );
    }

    const workspaceName = await getWorkspaceName(admin, workspaceId);
    const dataRoomName = (room.name || "").trim() || "data room";

    const authUserId = await resolveAuthUserIdByEmail(admin, targetEmail);

    // Block if the user is already a workspace member (manage via access list UI instead).
    if (authUserId) {
      const { data: existingMember, error: memberError } = await admin
        .from("workspace_members" as never)
        .select("user_id" as never)
        .eq("workspace_id", workspaceId)
        .eq("user_id", authUserId)
        .maybeSingle();

      if (memberError) {
        console.error(
          "[data-rooms.invite] membership lookup failed",
          memberError,
        );
        return NextResponse.json(
          { error: "Failed to verify membership" },
          { status: 500 },
        );
      }

      if (existingMember) {
        return NextResponse.json(
          {
            error:
              "User already belongs to this workspace. Grant access from the access list.",
          },
          { status: 409 },
        );
      }

      // Auth user exists but is not in the workspace.
      // Block if they already belong to any other workspace.
      const { count: anyWsCount, error: anyWsError } = await admin
        .from("workspace_members" as never)
        .select("workspace_id" as never, { head: true, count: "exact" })
        .eq("user_id", authUserId)
        .limit(1);

      if (anyWsError) {
        console.error(
          "[data-rooms.invite] membership check failed",
          anyWsError,
        );
        return NextResponse.json(
          { error: "Failed to verify whether this user can be invited" },
          { status: 500 },
        );
      }

      if ((anyWsCount ?? 0) > 0) {
        return NextResponse.json(
          { error: "User already belongs to another workspace" },
          { status: 409 },
        );
      }
    }

    // Ensure the current data room is always included (locked in UI).
    const resolvedRooms = dataRooms ?? [];
    const includesLockedRoom = resolvedRooms.some(
      (r) => r?.dataRoomId === dataRoomId,
    );
    if (!includesLockedRoom) {
      return NextResponse.json(
        { error: "This data room must be included in the invite." },
        { status: 400 },
      );
    }

    // Validate all requested rooms belong to this workspace.
    const requestedRoomIds = Array.from(
      new Set(resolvedRooms.map((r) => r.dataRoomId)),
    );
    const { data: validRooms, error: validRoomsError } = await admin
      .from("data_rooms" as never)
      .select("id" as never)
      .eq("workspace_id", workspaceId)
      .in("id", requestedRoomIds as never);
    if (validRoomsError) {
      console.error(
        "[data-rooms.invite] validate rooms failed",
        validRoomsError,
      );
      return NextResponse.json(
        { error: "Failed to validate data rooms" },
        { status: 500 },
      );
    }
    const validRoomIdSet = new Set(
      ((validRooms as Array<{ id?: string | null }> | null) ?? [])
        .map((r) => r.id)
        .filter(Boolean) as string[],
    );
    if (validRoomIdSet.size !== requestedRoomIds.length) {
      return NextResponse.json(
        { error: "One or more data rooms are invalid." },
        { status: 400 },
      );
    }

    // Invite (new workspace member) and pre-assign data rooms (explicit list).
    const expiresAt = new Date(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Reuse pending invite if it exists.
    const { data: pendingInvite, error: pendingInviteError } = await admin
      .from("workspace_invites" as never)
      .select("id, documents_access, data_rooms_access_all" as never)
      .eq("workspace_id", workspaceId)
      .eq("email", targetEmail)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .is("rejected_at", null)
      .maybeSingle();

    if (pendingInviteError) {
      console.error(
        "[data-rooms.invite] pending invite lookup failed",
        pendingInviteError,
      );
      return NextResponse.json(
        { error: "Failed to create invite" },
        { status: 500 },
      );
    }

    let inviteId: string | null = null;

    const pendingInviteId =
      (pendingInvite as { id?: string | null } | null)?.id ?? null;

    if (pendingInviteId) {
      inviteId = pendingInviteId;
      const { error: updateInviteError } = await admin
        .from("workspace_invites" as never)
        .update({
          documents_access: documentsAccess,
          data_rooms_access_all: dataRoomsAccessAll,
          expires_at: expiresAt,
        } as never)
        .eq("id", inviteId)
        .eq("workspace_id", workspaceId);

      if (updateInviteError) {
        console.error(
          "[data-rooms.invite] invite update failed",
          updateInviteError,
        );
        return NextResponse.json(
          { error: "Failed to update invite" },
          { status: 500 },
        );
      }
    } else {
      const { data: inserted, error: insertInviteError } = await admin
        .from("workspace_invites" as never)
        .insert({
          workspace_id: workspaceId,
          email: targetEmail,
          invited_by: user.id,
          expires_at: expiresAt,
          documents_access: documentsAccess,
          data_rooms_access_all: dataRoomsAccessAll,
        } as never)
        .select("id" as never)
        .single();

      const insertedId =
        (inserted as { id?: string | null } | null)?.id ?? null;
      if (insertInviteError?.code === "23505") {
        const { data: concurrentInvite, error: concurrentInviteError } =
          await admin
            .from("workspace_invites" as never)
            .select("id" as never)
            .eq("workspace_id", workspaceId)
            .eq("email", targetEmail)
            .is("accepted_at", null)
            .is("revoked_at", null)
            .is("rejected_at", null)
            .maybeSingle();

        const concurrentInviteId =
          (concurrentInvite as { id?: string | null } | null)?.id ?? null;
        if (concurrentInviteError || !concurrentInviteId) {
          console.error(
            "[data-rooms.invite] concurrent invite lookup failed",
            concurrentInviteError ?? insertInviteError,
          );
          return NextResponse.json(
            { error: "Failed to create invite" },
            { status: 500 },
          );
        }

        inviteId = concurrentInviteId;
        const { error: updateInviteError } = await admin
          .from("workspace_invites" as never)
          .update({
            documents_access: documentsAccess,
            data_rooms_access_all: dataRoomsAccessAll,
            expires_at: expiresAt,
          } as never)
          .eq("id", inviteId)
          .eq("workspace_id", workspaceId);

        if (updateInviteError) {
          console.error(
            "[data-rooms.invite] invite update after duplicate failed",
            updateInviteError,
          );
          return NextResponse.json(
            { error: "Failed to update invite" },
            { status: 500 },
          );
        }
      } else if (insertInviteError || !insertedId) {
        console.error(
          "[data-rooms.invite] invite insert failed",
          insertInviteError,
        );
        return NextResponse.json(
          { error: "Failed to create invite" },
          { status: 500 },
        );
      }
      if (insertedId) {
        inviteId = insertedId;
      }
    }

    if (!inviteId) {
      console.error("[data-rooms.invite] resolved invite id is missing");
      return NextResponse.json(
        { error: "Failed to create invite" },
        { status: 500 },
      );
    }

    // Explicit room grants: source-of-truth is the provided list,
    // but only relevant when "All data rooms" is not granted.
    if ((dataRoomsAccessAll ?? "none") === "none") {
      const deduped = new Map<string, "viewer" | "editor">();
      resolvedRooms.forEach((r) => {
        if (!r?.dataRoomId) return;
        deduped.set(r.dataRoomId, r.accessLevel);
      });
      const rows = Array.from(deduped.entries()).map(
        ([roomId, accessLevel]) => ({
          workspace_id: workspaceId,
          invite_id: inviteId,
          data_room_id: roomId,
          access_level: accessLevel,
          created_by: user.id,
        }),
      );

      const { data: existingRows, error: existingRowsError } = await admin
        .from("workspace_invite_data_room_access" as never)
        .select("data_room_id" as never)
        .eq("workspace_id", workspaceId)
        .eq("invite_id", inviteId);

      if (existingRowsError) {
        console.error(
          "[data-rooms.invite] failed to load existing invite room access",
          existingRowsError,
        );
        return NextResponse.json(
          { error: "Failed to update invite room access" },
          { status: 500 },
        );
      }

      if (rows.length > 0) {
        const { error: joinError } = await admin
          .from("workspace_invite_data_room_access" as never)
          .upsert(
            rows as never,
            { onConflict: "invite_id,data_room_id" } as never,
          );

        if (joinError) {
          console.error(
            "[data-rooms.invite] invite-room join failed",
            joinError,
          );
          return NextResponse.json(
            { error: "Failed to grant data room access for this invite" },
            { status: 500 },
          );
        }
      }

      const desiredRoomIds = new Set(rows.map((row) => row.data_room_id));
      const staleRoomIds = (
        (existingRows as Array<{ data_room_id?: string | null }> | null) ?? []
      )
        .map((row) => row.data_room_id)
        .filter((roomId): roomId is string => Boolean(roomId))
        .filter((roomId) => !desiredRoomIds.has(roomId));

      if (staleRoomIds.length > 0) {
        const { error: clearInviteRoomsError } = await admin
          .from("workspace_invite_data_room_access" as never)
          .delete()
          .eq("workspace_id", workspaceId)
          .eq("invite_id", inviteId)
          .in("data_room_id", staleRoomIds as never);

        if (clearInviteRoomsError) {
          console.error(
            "[data-rooms.invite] failed to clear stale invite room access",
            clearInviteRoomsError,
          );
          return NextResponse.json(
            { error: "Failed to update invite room access" },
            { status: 500 },
          );
        }
      }
    } else {
      const { error: clearInviteRoomsError } = await admin
        .from("workspace_invite_data_room_access" as never)
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("invite_id", inviteId);
      if (clearInviteRoomsError) {
        console.error(
          "[data-rooms.invite] failed to clear invite room access",
          clearInviteRoomsError,
        );
        return NextResponse.json(
          { error: "Failed to update invite room access" },
          { status: 500 },
        );
      }
    }

    const redirectPath = `/data-rooms/${dataRoomId}/documents`;
    const inviteUrl = buildInviteUrl(inviteId, redirectPath);
    const emailContent = buildDataRoomInviteEmail({
      workspaceName,
      dataRoomName,
      inviteUrl,
    });

    await sendAppEmail({
      to: targetEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    return NextResponse.json({ ok: true, message: "Invite sent." });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[data-rooms.invite][POST] unexpected error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
