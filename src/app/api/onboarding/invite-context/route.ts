import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { z } from "zod";

const InviteIdSchema = z.string().uuid();

type InviteContextSource = "explicit" | "accepted" | "pending_email";

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ invited: false });
    }

    const normalizedEmail = user.email.trim().toLowerCase();
    const admin = createSupabaseServiceClient();

    const selectColumns =
      "id, email, invited_at, accepted_at, accepted_by, revoked_at, rejected_at, rejected_by, workspace_id, workspace:workspaces(name)";

    const url = new URL(request.url);
    const inviteParam = url.searchParams.get("invite");
    const parsedInvite = InviteIdSchema.safeParse(inviteParam);
    const explicitInviteId = parsedInvite.success ? parsedInvite.data : null;

    const explicitInvitePromise = explicitInviteId
      ? admin
          .from("workspace_invites")
          .select(selectColumns)
          .eq("id", explicitInviteId)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });

    const [explicitInvite, acceptedInvite, pendingInvite] = await Promise.all([
      explicitInvitePromise,
      admin
        .from("workspace_invites")
        .select(selectColumns)
        .eq("accepted_by", user.id)
        .order("accepted_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("workspace_invites")
        .select(selectColumns)
        .eq("email", normalizedEmail)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .is("rejected_at", null)
        .order("invited_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (explicitInvite.error) {
      console.error(
        "[onboarding-invite-context] explicit invite query failed",
        explicitInvite.error,
      );
      return NextResponse.json({ invited: false });
    }

    if (acceptedInvite.error) {
      console.error(
        "[onboarding-invite-context] accepted invite query failed",
        acceptedInvite.error,
      );
      return NextResponse.json({ invited: false });
    }

    if (pendingInvite.error) {
      console.error(
        "[onboarding-invite-context] pending invite query failed",
        pendingInvite.error,
      );
      return NextResponse.json({ invited: false });
    }

    const explicitInviteRow = explicitInvite.data ?? null;
    const acceptedInviteRow = acceptedInvite.data ?? null;
    const pendingInviteRow = pendingInvite.data ?? null;

    const normalize = (email: string | null | undefined) =>
      (email ?? "").trim().toLowerCase();

    const sanitizedExplicitInviteRow =
      explicitInviteRow &&
      !explicitInviteRow.revoked_at &&
      !explicitInviteRow.rejected_at &&
      normalize(explicitInviteRow.email) === normalizedEmail
        ? explicitInviteRow
        : null;

    const inviteRow =
      sanitizedExplicitInviteRow ??
      acceptedInviteRow ??
      pendingInviteRow ??
      null;

    if (!inviteRow) {
      return NextResponse.json({ invited: false });
    }

    const source: InviteContextSource = sanitizedExplicitInviteRow
      ? "explicit"
      : acceptedInviteRow && inviteRow.id === acceptedInviteRow.id
        ? "accepted"
        : "pending_email";

    const workspaceId = inviteRow.workspace_id;
    let hasPaidSubscription = false;

    if (workspaceId) {
      const { data: entitlementData, error: entitlementError } =
        await admin.rpc("workspace_has_entitlement", { ws: workspaceId });

      if (!entitlementError) {
        hasPaidSubscription = Boolean(entitlementData);
      } else {
        console.warn(
          "[onboarding-invite-context] entitlement check failed",
          entitlementError,
        );
      }
    }
    if (process.env.NODE_ENV === "development") {
      console.log("[onboarding-invite-context] invite found", {
        invited: true,
        workspaceId,
        workspaceName: inviteRow.workspace?.name ?? null,
        inviteId: inviteRow.id,
        hasPaidSubscription,
        source,
      });
    }

    return NextResponse.json({
      invited: true,
      workspaceId,
      workspaceName: inviteRow.workspace?.name ?? null,
      inviteId: inviteRow.id,
      hasPaidSubscription,
      source,
    });
  } catch (err) {
    console.error("[onboarding-invite-context] unexpected error", err);
    return NextResponse.json({ invited: false });
  }
}
