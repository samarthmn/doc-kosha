import type { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { normalizeEmail } from "@/lib/email";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export const normalizeViewerEmail = (email: string): string =>
  normalizeEmail(email);

type LinkAllowlistStatus = {
  allowlistActive: boolean;
  blocklistActive: boolean;
  isActive: boolean;
  normalizedEmail: string | null;
  emailAllowed: boolean | null;
  emailBlocked: boolean | null;
  emailPermitted: boolean | null;
};

export const isLinkAllowlistAccessDenied = (
  status: Pick<
    LinkAllowlistStatus,
    "isActive" | "emailAllowed" | "emailBlocked"
  >,
): boolean =>
  status.isActive &&
  (status.emailBlocked === true || status.emailAllowed === false);

export const fetchLinkAllowlistStatus = async (
  supabase: ServiceClient,
  linkId: string,
  email?: string | null,
): Promise<LinkAllowlistStatus> => {
  const normalizedEmail = email ? normalizeViewerEmail(email) : null;

  const [
    { data: allowlistRows, error: allowlistError },
    { data: blocklistRows, error: blocklistError },
    { data: allowedGroupRows, error: allowedGroupsError },
    { data: blockedGroupRows, error: blockedGroupsError },
    { data: linkRow, error: linkError },
  ] = await Promise.all([
    supabase
      .from("link_allowed_emails")
      .select("id")
      .eq("link_id", linkId)
      .limit(1),
    supabase
      .from("link_blocked_emails" as never)
      .select("id")
      .eq("link_id", linkId)
      .limit(1),
    supabase
      .from("link_allowed_groups" as never)
      .select("id")
      .eq("link_id", linkId)
      .limit(1),
    supabase
      .from("link_blocked_groups" as never)
      .select("id")
      .eq("link_id", linkId)
      .limit(1),
    supabase
      .from("links")
      .select("workspace_id")
      .eq("id", linkId)
      .maybeSingle(),
  ]);

  if (
    allowlistError ||
    blocklistError ||
    allowedGroupsError ||
    blockedGroupsError ||
    linkError
  ) {
    // Fail closed so we do not accidentally allow access.
    console.error("[link-email-rules] failed to resolve rules", {
      linkId,
      allowlistError,
      blocklistError,
      allowedGroupsError,
      blockedGroupsError,
      linkError,
    });
    return {
      allowlistActive: true,
      blocklistActive: true,
      isActive: true,
      normalizedEmail,
      emailAllowed: normalizedEmail ? false : null,
      emailBlocked: normalizedEmail ? true : null,
      emailPermitted: normalizedEmail ? false : null,
    };
  }

  const allowlistActive = (allowlistRows ?? []).length > 0;
  const blocklistActive = (blocklistRows ?? []).length > 0;
  const allowedGroupsActive = (allowedGroupRows ?? []).length > 0;
  const blockedGroupsActive = (blockedGroupRows ?? []).length > 0;
  const hasGroupRules = allowedGroupsActive || blockedGroupsActive;
  const effectiveAllowlistActive = allowlistActive || allowedGroupsActive;
  const effectiveBlocklistActive = blocklistActive || blockedGroupsActive;
  const effectiveIsActive =
    effectiveAllowlistActive || effectiveBlocklistActive;

  if (!effectiveIsActive) {
    return {
      allowlistActive: effectiveAllowlistActive,
      blocklistActive: effectiveBlocklistActive,
      isActive: effectiveIsActive,
      normalizedEmail,
      emailAllowed: normalizedEmail ? true : null,
      emailBlocked: normalizedEmail ? false : null,
      emailPermitted: normalizedEmail ? true : null,
    };
  }

  if (!normalizedEmail) {
    return {
      allowlistActive: effectiveAllowlistActive,
      blocklistActive: effectiveBlocklistActive,
      isActive: effectiveIsActive,
      normalizedEmail: null,
      emailAllowed: false,
      emailBlocked: null,
      emailPermitted: false,
    };
  }

  const [
    { data: allowedMembershipRows, error: allowedMembershipError },
    { data: blockedMembershipRows, error: blockedMembershipError },
  ] = await Promise.all([
    supabase
      .from("link_allowed_emails")
      .select("id")
      .eq("link_id", linkId)
      .eq("email", normalizedEmail)
      .limit(1),
    supabase
      .from("link_blocked_emails" as never)
      .select("id")
      .eq("link_id", linkId)
      .eq("email", normalizedEmail)
      .limit(1),
  ]);

  if (allowedMembershipError || blockedMembershipError) {
    console.error("[link-email-rules] failed to check direct memberships", {
      linkId,
      allowedMembershipError,
      blockedMembershipError,
    });
    return {
      allowlistActive: effectiveAllowlistActive,
      blocklistActive: effectiveBlocklistActive,
      isActive: effectiveIsActive,
      normalizedEmail,
      emailAllowed: false,
      emailBlocked: true,
      emailPermitted: false,
    };
  }

  let allowedViaGroup = false;
  let blockedViaGroup = false;

  const workspaceId = (linkRow as { workspace_id?: string | null } | null)
    ?.workspace_id;
  const shouldCheckGroups = hasGroupRules && Boolean(workspaceId);

  if (shouldCheckGroups) {
    const { data: groupMembershipRows, error: groupMembershipError } =
      await supabase
        .from("workspace_user_group_emails" as never)
        .select("group_id")
        .eq("workspace_id", workspaceId as string)
        .eq("email", normalizedEmail);

    if (groupMembershipError) {
      console.error("[link-email-rules] failed to check group memberships", {
        linkId,
        workspaceId,
        error: groupMembershipError,
      });
      return {
        allowlistActive: effectiveAllowlistActive,
        blocklistActive: effectiveBlocklistActive,
        isActive: effectiveIsActive,
        normalizedEmail,
        emailAllowed: false,
        emailBlocked: true,
        emailPermitted: false,
      };
    }

    const membershipGroupIds = Array.from(
      new Set(
        ((groupMembershipRows ?? []) as Array<{ group_id?: string | null }>)
          .map((row) => row.group_id ?? "")
          .filter((groupId) => !!groupId),
      ),
    );

    if (membershipGroupIds.length > 0) {
      const [
        { data: allowedViaGroupRows, error: allowedViaGroupError },
        { data: blockedViaGroupRows, error: blockedViaGroupError },
      ] = await Promise.all([
        allowedGroupsActive
          ? supabase
              .from("link_allowed_groups" as never)
              .select("id")
              .eq("link_id", linkId)
              .in("group_id", membershipGroupIds)
              .limit(1)
          : Promise.resolve({ data: [] as unknown[], error: null }),
        blockedGroupsActive
          ? supabase
              .from("link_blocked_groups" as never)
              .select("id")
              .eq("link_id", linkId)
              .in("group_id", membershipGroupIds)
              .limit(1)
          : Promise.resolve({ data: [] as unknown[], error: null }),
      ]);

      if (allowedViaGroupError || blockedViaGroupError) {
        console.error("[link-email-rules] failed to check group rules", {
          linkId,
          allowedViaGroupError,
          blockedViaGroupError,
        });
        return {
          allowlistActive: effectiveAllowlistActive,
          blocklistActive: effectiveBlocklistActive,
          isActive: effectiveIsActive,
          normalizedEmail,
          emailAllowed: false,
          emailBlocked: true,
          emailPermitted: false,
        };
      }

      allowedViaGroup = (allowedViaGroupRows ?? []).length > 0;
      blockedViaGroup = (blockedViaGroupRows ?? []).length > 0;
    }
  } else if (hasGroupRules) {
    // Fail closed if group rules exist but workspace id cannot be resolved.
    return {
      allowlistActive: effectiveAllowlistActive,
      blocklistActive: effectiveBlocklistActive,
      isActive: effectiveIsActive,
      normalizedEmail,
      emailAllowed: false,
      emailBlocked: true,
      emailPermitted: false,
    };
  }

  const allowedDirect = (allowedMembershipRows ?? []).length > 0;
  const blockedDirect = (blockedMembershipRows ?? []).length > 0;
  const emailAllowedByRule = allowedDirect || allowedViaGroup;
  const emailBlocked = blockedDirect || blockedViaGroup;
  const emailPermitted = emailBlocked
    ? false
    : effectiveAllowlistActive
      ? emailAllowedByRule
      : true;

  return {
    allowlistActive: effectiveAllowlistActive,
    blocklistActive: effectiveBlocklistActive,
    isActive: effectiveIsActive,
    normalizedEmail,
    emailAllowed: emailPermitted,
    emailBlocked,
    emailPermitted,
  };
};
