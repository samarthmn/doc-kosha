import AuthenticatedLayout from "@/components/layouts/AuthenticatedLayout";
import { HelpWidget } from "@/components/help/HelpWidget";
import { clientEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import {
  buildSubscriptionAccessRedirect,
  isSubscriptionRecoveryPath,
  SUBSCRIPTION_REQUEST_PATH_HEADER,
} from "@/modules/billing/subscriptionAccess";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import React from "react";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function AuthenticatedRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cookieStore, requestHeaders] = await Promise.all([
    cookies(),
    headers(),
  ]);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  // Check onboarding status to sync with client store
  const [profileRes, membershipRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("primary_use_case")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .order("workspace_id", { ascending: true })
      .limit(1),
  ]);

  if (profileRes.error) {
    throw new Error(
      `Failed to verify onboarding profile: ${profileRes.error.message}`,
    );
  }
  if (membershipRes.error) {
    throw new Error(
      `Failed to verify workspace membership: ${membershipRes.error.message}`,
    );
  }

  const hasCompletedProfile = Boolean(profileRes.data?.primary_use_case);
  const workspaceId = membershipRes.data?.[0]?.workspace_id ?? null;
  const hasMembership = workspaceId !== null;
  const isOnboarded = hasCompletedProfile && hasMembership;
  const requestPath = requestHeaders.get(SUBSCRIPTION_REQUEST_PATH_HEADER);

  if (isOnboarded && workspaceId && !isSubscriptionRecoveryPath(requestPath)) {
    const { data: entitlement, error: entitlementError } = await supabase.rpc(
      "workspace_has_entitlement",
      { ws: workspaceId },
    );
    if (entitlementError) {
      throw new Error(
        `Failed to verify subscription status: ${entitlementError.message}`,
      );
    }
    if (!entitlement) {
      redirect(buildSubscriptionAccessRedirect(requestPath));
    }
  }

  const showHelpWidget =
    clientEnv.NEXT_PUBLIC_ENABLE_PRODUCT_GUIDES ||
    (process.env.PLAYWRIGHT === "true" &&
      cookieStore.get("dk_e2e_enable_product_guides")?.value === "true");

  return (
    <>
      <AuthenticatedLayout
        updateOnboardedStatusAsTrue={isOnboarded}
        workspaceId={workspaceId}
      >
        {children}
      </AuthenticatedLayout>
      {showHelpWidget ? <HelpWidget /> : null}
    </>
  );
}
