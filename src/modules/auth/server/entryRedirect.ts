import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { appendLandingAttribution } from "@/lib/analytics/landingAttribution";
import type { Database } from "@/types/generated/supabase";
import { resolveAuthReturnPath } from "@/modules/auth/returnPath";

type EntryRedirectParams = {
  supabase: SupabaseClient<Database>;
  userId: string;
  redirect?: string | string[] | null;
  inviteId?: string | string[] | null;
  source?: string | string[] | null;
};

const getFirstString = (
  value?: string | string[] | null,
): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
};

export const getSignedInUserEntryPath = async ({
  supabase,
  userId,
  redirect,
  inviteId,
  source,
}: EntryRedirectParams): Promise<string> => {
  const safeRedirectPath = resolveAuthReturnPath(getFirstString(redirect));
  const safeInviteId = getFirstString(inviteId);

  if (safeInviteId) {
    const params = new URLSearchParams();
    params.set("redirect", safeRedirectPath);
    params.set("invite", safeInviteId);
    appendLandingAttribution(params, {
      source: getFirstString(source),
    });
    return `/auth/callback?${params.toString()}`;
  }

  const [profileRes, membershipRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("primary_use_case")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .order("workspace_id", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (profileRes.error) {
    throw new Error(`Failed to load profile: ${profileRes.error.message}`);
  }

  if (membershipRes.error) {
    throw new Error(
      `Failed to load workspace membership: ${membershipRes.error.message}`,
    );
  }

  const hasCompletedProfile = Boolean(profileRes.data?.primary_use_case);
  const hasMembership = Boolean(membershipRes.data?.workspace_id);

  if (hasCompletedProfile && hasMembership) {
    return safeRedirectPath === "/onboarding" ? "/dashboard" : safeRedirectPath;
  }

  const params = new URLSearchParams();
  params.set("redirect", safeRedirectPath);
  appendLandingAttribution(params, {
    source: getFirstString(source),
  });

  return `/onboarding?${params.toString()}`;
};
