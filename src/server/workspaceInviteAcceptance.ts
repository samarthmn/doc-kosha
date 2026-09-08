import { z } from "zod";

import { sendWorkspaceInviteAcceptedLifecycleEmail } from "@/modules/lifecycle-email/server";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { assertWorkspaceMemberInviteAllowed } from "@/modules/billing/server/planGuards";

const InviteIdSchema = z.string().uuid();

const normalizeEmail = (email: string | null | undefined) =>
  (email ?? "").trim().toLowerCase();

export const acceptWorkspaceInvite = async (
  rawInviteId: string | null | undefined,
): Promise<void> => {
  const parsed = InviteIdSchema.safeParse(rawInviteId);
  if (!parsed.success) {
    return;
  }
  const inviteId = parsed.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return;
  }

  const normalizedEmail = normalizeEmail(user.email);
  const admin = createSupabaseServiceClient();

  const { data: invite, error: inviteError } = await admin
    .from("workspace_invites")
    .select(
      "id, workspace_id, email, documents_access, data_rooms_access_all, invited_by, accepted_at, accepted_by, revoked_at, expires_at, rejected_at, rejected_by",
    )
    .eq("id", inviteId)
    .maybeSingle();

  if (inviteError || !invite) {
    return;
  }

  if (
    invite.revoked_at ||
    invite.accepted_at ||
    (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) ||
    normalizeEmail(invite.email) !== normalizedEmail
  ) {
    return;
  }

  const { count: existingMembershipCount, error: membershipError } = await admin
    .from("workspace_members")
    .select("workspace_id", { head: true, count: "exact" })
    .eq("workspace_id", invite.workspace_id)
    .eq("user_id", user.id)
    .limit(1);

  if (membershipError || (existingMembershipCount ?? 0) > 0) {
    return;
  }

  const memberLimitCheck = await assertWorkspaceMemberInviteAllowed(
    invite.workspace_id,
  );
  if (!memberLimitCheck.ok) {
    return;
  }

  const invitedBy = invite.invited_by ?? null;

  const { error: insertError } = await admin.from("workspace_members").insert({
    workspace_id: invite.workspace_id,
    user_id: user.id,
    documents_access: invite.documents_access,
    data_rooms_access_all: invite.data_rooms_access_all,
  });

  if (insertError && insertError.code !== "23505") {
    console.error("[workspace-invite] membership insert failed", insertError);
    return;
  }

  if ((invite.data_rooms_access_all ?? "none") === "none") {
    const { data: roomAccessRows, error: roomAccessError } = await admin
      .from("workspace_invite_data_room_access")
      .select("data_room_id, access_level")
      .eq("workspace_id", invite.workspace_id)
      .eq("invite_id", inviteId);

    if (roomAccessError) {
      console.error(
        "[workspace-invite] room access lookup failed",
        roomAccessError,
      );
      // continue; invite acceptance still succeeded for workspace membership
    } else {
      const roomRows = (roomAccessRows ?? []).filter((row) => row.data_room_id);

      if (roomRows.length > 0) {
        const rows = roomRows.map((row) => ({
          workspace_id: invite.workspace_id,
          data_room_id: row.data_room_id,
          user_id: user.id,
          access_level: row.access_level,
          created_by: invitedBy,
        }));
        const { error: insertRoomsError } = await admin
          .from("data_room_members")
          .upsert(rows, { onConflict: "data_room_id,user_id" });

        if (insertRoomsError) {
          console.error(
            "[workspace-invite] data room membership insert failed",
            insertRoomsError,
          );
        }
      }
    }
  }

  const acceptedAt = new Date().toISOString();
  const { data: acceptedInvite, error: updateError } = await admin
    .from("workspace_invites")
    .update({
      accepted_at: acceptedAt,
      accepted_by: user.id,
      rejected_at: null,
      rejected_by: null,
    })
    .eq("id", inviteId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("[workspace-invite] mark accepted failed", updateError);
    return;
  }

  if (!acceptedInvite?.id) {
    return;
  }

  void sendWorkspaceInviteAcceptedLifecycleEmail({
    workspaceId: invite.workspace_id,
    inviteId,
    acceptedAt,
    acceptedByUserId: user.id,
  }).catch((error) => {
    console.error("[workspace-invite] invite accepted email failed", error);
  });
};
