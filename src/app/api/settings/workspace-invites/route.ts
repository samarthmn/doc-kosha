import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { sendAppEmail } from "@/server/emailHelper";
import { buildWorkspaceInviteEmail } from "@/server/emails/templates";
import { clientEnv } from "@/lib/env";
import { sanitizeInternalReturnPath } from "@/lib/internalReturnPath";
import { assertWorkspaceMemberInviteAllowed } from "@/modules/billing/server/planGuards";

const AccessLevelSchema = z.enum(["none", "viewer", "editor"]);
const RoomAccessLevelSchema = z.enum(["viewer", "editor"]);

const InviteRoomSchema = z.object({
  dataRoomId: z.string().uuid(),
  accessLevel: RoomAccessLevelSchema,
});

const CreateInviteSchema = z.object({
  workspaceId: z.string().uuid(),
  email: z.string().email(),
  documentsAccess: AccessLevelSchema.default("none"),
  dataRoomsAccessAll: AccessLevelSchema.default("none"),
  dataRooms: z.array(InviteRoomSchema).default([]),
});

const RevokeInviteSchema = z.object({
  workspaceId: z.string().uuid(),
  inviteId: z.string().uuid(),
});

const ListSchema = z.object({
  workspaceId: z.string().uuid(),
});

const normalizeEmail = (email: string) => email.trim().toLowerCase();

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

const ensureOwnerMembership = async (
  workspaceId: string,
): Promise<{ userId: string }> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: workspace, error: workspaceError } = await supabase
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

const findAuthUserByEmail = async (email: string) => {
  const adminClient = createSupabaseServiceClient();
  const target = email.toLowerCase();

  const { data: userId, error } = await adminClient.rpc(
    "auth_user_id_by_email",
    { p_email: target },
  );

  if (error) {
    console.error("[workspace-invites] auth_user_id_by_email failed", error);
    throw NextResponse.json(
      { error: "Failed to verify whether this user already exists" },
      { status: 503 },
    );
  }

  if (!userId) {
    return null;
  }

  return { id: userId, email: target };
};

const hasAnyWorkspaceMembership = async (userId: string): Promise<boolean> => {
  const admin = createSupabaseServiceClient();
  const { count, error } = await admin
    .from("workspace_members")
    .select("workspace_id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .limit(1);

  if (error) {
    throw new Error("Failed to verify membership");
  }
  return (count ?? 0) > 0;
};

const fetchWorkspaceName = async (workspaceId: string): Promise<string> => {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error || !data?.name) {
    return "workspace";
  }
  return data.name;
};

const sendInviteEmail = async (
  email: string,
  workspaceName: string,
  inviteId: string,
) => {
  const inviteUrl = buildInviteUrl(inviteId, "/dashboard");
  const inviteEmail = buildWorkspaceInviteEmail({ workspaceName, inviteUrl });
  await sendAppEmail({
    to: email,
    subject: inviteEmail.subject,
    html: inviteEmail.html,
    text: inviteEmail.text,
  });
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
    const { data, error } = await admin
      .from("workspace_invites")
      .select(
        "id, workspace_id, email, documents_access, data_rooms_access_all, invited_at, invited_by, accepted_at, accepted_by, revoked_at, rejected_at, rejected_by, expires_at",
      )
      .eq("workspace_id", workspaceId)
      .is("revoked_at", null)
      .order("invited_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Failed to load invites" },
        { status: 500 },
      );
    }

    return NextResponse.json({ invites: data ?? [] });
  } catch (err) {
    if (err instanceof Response) {
      return err;
    }
    console.error("[workspace-invites][GET] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => ({}));
    const parsed = CreateInviteSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { workspaceId, documentsAccess, dataRoomsAccessAll, dataRooms } =
      parsed.data;
    const normalizedEmail = normalizeEmail(parsed.data.email);

    const { userId } = await ensureOwnerMembership(workspaceId);
    const admin = createSupabaseServiceClient();
    const memberLimitCheck =
      await assertWorkspaceMemberInviteAllowed(workspaceId);
    if (!memberLimitCheck.ok) {
      return NextResponse.json(
        { error: memberLimitCheck.message, code: memberLimitCheck.code },
        { status: memberLimitCheck.status },
      );
    }

    const resolvedDocumentsAccess = documentsAccess ?? "none";
    const resolvedDataRoomsAccessAll = dataRoomsAccessAll ?? "none";

    const { data: existingInvite } = await admin
      .from("workspace_invites")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("email", normalizedEmail)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .is("rejected_at", null)
      .maybeSingle();
    if (existingInvite) {
      return NextResponse.json(
        { error: "Invite already pending for this email" },
        { status: 409 },
      );
    }

    const existingAuthUser = await findAuthUserByEmail(normalizedEmail);
    if (existingAuthUser) {
      const alreadyInWorkspace = await admin
        .from("workspace_members")
        .select("workspace_id", { head: true, count: "exact" })
        .eq("workspace_id", workspaceId)
        .eq("user_id", existingAuthUser.id)
        .limit(1);
      if (alreadyInWorkspace.error) {
        console.error(
          "[workspace-invites][POST] membership lookup failed",
          alreadyInWorkspace.error,
        );
        return NextResponse.json(
          { error: "Failed to verify membership" },
          { status: 500 },
        );
      }
      if ((alreadyInWorkspace.count ?? 0) > 0) {
        return NextResponse.json(
          { error: "User already belongs to this workspace" },
          { status: 409 },
        );
      }
      if (await hasAnyWorkspaceMembership(existingAuthUser.id)) {
        return NextResponse.json(
          { error: "User already belongs to another workspace" },
          { status: 409 },
        );
      }
    }

    const expiresAt = new Date(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: inserted, error: insertError } = await admin
      .from("workspace_invites")
      .insert({
        workspace_id: workspaceId,
        email: normalizedEmail,
        invited_by: userId,
        expires_at: expiresAt,
        documents_access: resolvedDocumentsAccess,
        data_rooms_access_all: resolvedDataRoomsAccessAll,
      })
      .select(
        "id, workspace_id, email, documents_access, data_rooms_access_all, invited_at, invited_by, accepted_at, accepted_by, revoked_at, rejected_at, rejected_by, expires_at",
      )
      .single();

    if (insertError || !inserted) {
      console.error(
        "[workspace-invites][POST] insert failed",
        insertError ?? "missing row",
      );
      return NextResponse.json(
        { error: "Failed to create invite" },
        { status: 500 },
      );
    }

    // Explicit room access:
    // - If global data-room access is granted, explicit rows should be empty.
    // - Otherwise, the provided dataRooms list is the source-of-truth.
    if ((resolvedDataRoomsAccessAll ?? "none") !== "none") {
      const { error: clearInviteRoomsError } = await admin
        .from("workspace_invite_data_room_access")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("invite_id", inserted.id);
      if (clearInviteRoomsError) {
        console.error(
          "[workspace-invites][POST] failed to clear invite room access",
          clearInviteRoomsError,
        );
      }
    } else {
      const dedupedRooms = dedupeRooms(dataRooms ?? []);
      await ensureRoomsBelongToWorkspace(
        admin,
        workspaceId,
        dedupedRooms.map((r) => r.dataRoomId),
      );

      const { error: clearInviteRoomsError } = await admin
        .from("workspace_invite_data_room_access")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("invite_id", inserted.id);
      if (clearInviteRoomsError) {
        console.error(
          "[workspace-invites][POST] failed to clear invite room access",
          clearInviteRoomsError,
        );
        await admin
          .from("workspace_invites")
          .delete()
          .eq("id", inserted.id)
          .eq("workspace_id", workspaceId);
        return NextResponse.json(
          { error: "Failed to assign data room access. Please try again." },
          { status: 500 },
        );
      }

      const rows = dedupedRooms.map((row) => ({
        workspace_id: workspaceId,
        invite_id: inserted.id,
        data_room_id: row.dataRoomId,
        access_level: row.accessLevel,
        created_by: userId,
      }));

      if (rows.length > 0) {
        const { error: joinError } = await admin
          .from("workspace_invite_data_room_access")
          .upsert(rows, { onConflict: "invite_id,data_room_id" });

        if (joinError) {
          console.error(
            "[workspace-invites][POST] invite-room assignment failed",
            joinError,
          );
          await admin
            .from("workspace_invites")
            .delete()
            .eq("id", inserted.id)
            .eq("workspace_id", workspaceId);
          return NextResponse.json(
            { error: "Failed to assign data room access. Please try again." },
            { status: 500 },
          );
        }
      }
    }

    try {
      const workspaceName = await fetchWorkspaceName(workspaceId);
      await sendInviteEmail(normalizedEmail, workspaceName, inserted.id);
    } catch (emailErr) {
      console.error("[workspace-invites][POST] email failed", emailErr);
      await admin
        .from("workspace_invites")
        .delete()
        .eq("id", inserted.id)
        .eq("workspace_id", workspaceId);
      return NextResponse.json(
        { error: "Failed to send invite email. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ invite: inserted }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) {
      return err;
    }
    console.error("[workspace-invites][POST] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => ({}));
    const parsed = RevokeInviteSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { workspaceId, inviteId } = parsed.data;
    await ensureOwnerMembership(workspaceId);
    const admin = createSupabaseServiceClient();
    const { error } = await admin
      .from("workspace_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("id", inviteId)
      .is("accepted_at", null)
      .is("revoked_at", null);

    if (error) {
      return NextResponse.json(
        { error: "Failed to revoke invite" },
        { status: 500 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Response) {
      return err;
    }
    console.error("[workspace-invites][DELETE] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
