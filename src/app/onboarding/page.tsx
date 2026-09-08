import OnboardingClient from "@/components/pages/OnboardingClient";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { redirect } from "next/navigation";
import { appendLandingAttribution } from "@/lib/analytics/landingAttribution";
import { hasCompletedOnboardingProfile } from "@/modules/auth/onboardingProfile";
import { sanitizeInternalReturnPath } from "@/lib/internalReturnPath";

export const metadata: Metadata = {
  title: "Onboarding",
  alternates: { canonical: "/onboarding" },
  robots: { index: false },
};

const OnboardingPage: React.FC<PageProps<"/onboarding">> = async ({
  searchParams,
}) => {
  const params = await searchParams;
  const source = typeof params?.source === "string" ? params.source : undefined;
  // Server-side guard: skip onboarding only after the profile completion marker,
  // workspace membership, and entitlement all exist.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const qs = new URLSearchParams();
    qs.set("redirect", "/onboarding");
    appendLandingAttribution(qs, { source });
    redirect(`/auth/sign-in?${qs.toString()}`);
  }

  // Consider onboarding complete only if profile has primary_use_case set
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("primary_use_case")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Failed to check profile: ${profileError.message}`);
  }

  const hasCompletedProfile = hasCompletedOnboardingProfile(
    profile?.primary_use_case,
  );

  // If the user is already a member of any workspace, consider onboarding progress
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, user_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .order("workspace_id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(
      `Failed to check workspace membership: ${membershipError.message}`,
    );
  }

  const hasMembership = membership?.workspace_id;

  let hasEntitlement = false;
  if (hasMembership) {
    const { data: entitlement, error: entitlementError } = await supabase.rpc(
      "workspace_has_entitlement",
      { ws: membership.workspace_id },
    );
    if (entitlementError) {
      throw new Error(
        `Failed to check workspace entitlement: ${entitlementError.message}`,
      );
    }
    hasEntitlement = Boolean(entitlement);
  }

  const redirectValue = Array.isArray(params?.redirect)
    ? params.redirect[0]
    : params?.redirect;
  const safeRedirect = sanitizeInternalReturnPath(redirectValue);

  if (hasCompletedProfile && hasMembership && hasEntitlement) {
    redirect(safeRedirect ?? "/dashboard");
  }

  return <OnboardingClient />;
};

export default OnboardingPage;
