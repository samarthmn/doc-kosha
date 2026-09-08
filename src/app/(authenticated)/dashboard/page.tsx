import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Buildings, CreditCard } from "@phosphor-icons/react/ssr";
import {
  KPICardsWidget,
  MostActiveContentWidget,
  ViewsByCountryWidget,
  RecentDocumentsWidget,
  RecentDataRoomsWidget,
} from "@/components/dashboard/DashboardWidgets";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import CheckoutSuccessGate from "@/components/billing/CheckoutSuccessGate";
import { Button } from "@/components/ui/button";
import { sanitizeInternalReturnPath } from "@/lib/internalReturnPath";

export const metadata: Metadata = {
  title: "Dashboard",
  alternates: { canonical: "/dashboard" },
};

const DashboardPage: React.FC<PageProps<"/dashboard">> = async ({
  searchParams,
}) => {
  // Stripe returns here after checkout; delay entitlement redirects so we can sync
  const rawSearchParams = await searchParams;
  const billingSuccessRaw = rawSearchParams?.billing_success;
  const billingSuccessValue = Array.isArray(billingSuccessRaw)
    ? billingSuccessRaw[0]
    : billingSuccessRaw;
  const isBillingSuccess =
    billingSuccessValue === "1" || billingSuccessValue === "true";
  const redirectTargetRaw = rawSearchParams?.redirect;
  const redirectTargetValue = Array.isArray(redirectTargetRaw)
    ? redirectTargetRaw[0]
    : redirectTargetRaw;
  const redirectTarget =
    sanitizeInternalReturnPath(redirectTargetValue) ?? "/dashboard";

  // Server-side guard: require onboarding completion before accessing dashboard
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/sign-in?redirect=/dashboard");
  }

  // If not onboarded (no completed profile and no workspace membership), redirect to onboarding
  // Run both queries in parallel and handle errors explicitly
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

  const profileError = (profileRes as { error?: unknown } | null)?.error;
  const membershipError = (membershipRes as { error?: unknown } | null)?.error;
  if (profileError) {
    console.error("[dashboard] profiles select failed", {
      error: profileError,
      userId: user.id,
    });
    throw new Error("Failed to load profile");
  }
  if (membershipError) {
    console.error("[dashboard] workspace_members select failed", {
      error: membershipError,
      userId: user.id,
    });
    throw new Error("Failed to load workspace membership");
  }

  const profile = (
    profileRes as {
      data?: { primary_use_case?: string | null } | null;
    }
  )?.data;

  const membership = (
    membershipRes as {
      data?: Array<{ workspace_id: string }> | null;
    }
  )?.data;
  const hasCompletedProfile = Boolean(profile?.primary_use_case);
  const hasMembership = (membership?.length || 0) > 0;
  if (!hasCompletedProfile && !hasMembership) {
    redirect("/onboarding");
  }

  const workspaceId = membership?.[0]?.workspace_id;
  const { data: workspace, error: workspaceError } = workspaceId
    ? await supabase
        .from("workspaces")
        .select("created_by")
        .eq("id", workspaceId)
        .maybeSingle()
    : { data: null, error: null };
  if (workspaceError) {
    console.error("[dashboard] workspaces select failed", {
      error: workspaceError,
      userId: user.id,
      workspaceId,
    });
    throw new Error("Failed to load workspace");
  }

  const isOwner = Boolean(workspaceId && workspace?.created_by === user.id);
  const canManageSubscription = isOwner;

  if (!workspaceId) {
    return (
      <PageContainer maxWidth="6xl">
        <PageHeader title="Dashboard" className="mb-5" />
        <EmptyState
          icon={
            <Buildings className="h-6 w-6 text-muted-foreground" aria-hidden />
          }
          title="No workspace found"
          description="Create a workspace to view the dashboard."
        />
      </PageContainer>
    );
  }

  // Always sync after returning from Stripe Checkout (even if already entitled),
  // so upgrades/downgrades are reflected immediately across the app.
  if (isBillingSuccess) {
    return (
      <PageContainer maxWidth="6xl">
        <PageHeader title="Dashboard" className="mb-5" />
        <CheckoutSuccessGate
          workspaceId={workspaceId}
          redirectPath={redirectTarget}
        />
      </PageContainer>
    );
  }

  const { data: entitlement, error: entitlementError } = await supabase.rpc(
    "workspace_has_entitlement",
    { ws: workspaceId },
  );
  if (entitlementError) {
    console.error("[dashboard] entitlement check failed", entitlementError);
    throw new Error("Failed to verify subscription status");
  }
  const hasEntitlement = Boolean(entitlement);
  if (!hasEntitlement) {
    // If the user can't manage billing, keep them on the dashboard and explain what's needed.
    if (!canManageSubscription) {
      return (
        <PageContainer maxWidth="6xl">
          <PageHeader title="Dashboard" className="mb-5" />
          <EmptyState
            icon={
              <CreditCard
                className="h-6 w-6 text-muted-foreground"
                aria-hidden
              />
            }
            title="Workspace needs a plan"
            description="Your workspace owner needs to pick a plan to unlock DocKosha features for the team."
            actions={
              <>
                <Button asChild>
                  <a href="mailto:support@dockosha.com">Contact support</a>
                </Button>
                <Button asChild variant="ghost">
                  <Link href="/settings">Go to settings</Link>
                </Button>
              </>
            }
          />
        </PageContainer>
      );
    }

    const params = new URLSearchParams();
    params.set("tab", "subscription");
    params.set("planPicker", "1");
    params.set("redirect", "/dashboard");
    redirect(`/settings?${params.toString()}`);
  }

  return (
    <PageContainer maxWidth="6xl">
      <PageHeader title="Dashboard" className="mb-5" />

      <div className="space-y-5">
        <Suspense
          fallback={
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="h-28 animate-pulse border-border/70 bg-card/55" />
              <Card className="h-28 animate-pulse border-border/70 bg-card/55" />
              <Card className="h-28 animate-pulse border-border/70 bg-card/55" />
            </div>
          }
        >
          <KPICardsWidget workspaceId={workspaceId} />
        </Suspense>

        <div className="grid items-stretch gap-5 md:grid-cols-2">
          <Suspense
            fallback={
              <Card className="h-[288px] animate-pulse border-border/70 bg-card/55" />
            }
          >
            <MostActiveContentWidget workspaceId={workspaceId} />
          </Suspense>
          <Suspense
            fallback={
              <Card className="h-[288px] animate-pulse border-border/70 bg-card/55" />
            }
          >
            <ViewsByCountryWidget workspaceId={workspaceId} />
          </Suspense>
        </div>

        <div className="grid items-stretch gap-5 md:grid-cols-2">
          <Suspense
            fallback={
              <Card className="h-[248px] animate-pulse border-border/70 bg-card/55" />
            }
          >
            <RecentDocumentsWidget workspaceId={workspaceId} />
          </Suspense>
          <Suspense
            fallback={
              <Card className="h-[248px] animate-pulse border-border/70 bg-card/55" />
            }
          >
            <RecentDataRoomsWidget workspaceId={workspaceId} />
          </Suspense>
        </div>
      </div>
    </PageContainer>
  );
};

export default DashboardPage;
