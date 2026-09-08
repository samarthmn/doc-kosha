import {
  isAuthSessionMissingError,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

import type { Database, Tables } from "@/types/generated/supabase";
import type {
  WorkspaceSubscriptionLike,
  PlanId,
  BillingInterval,
  SubscriptionProvider,
} from "@/modules/billing/types";

type InitialFetchParams = {
  supabase: SupabaseClient<Database>;
};

type InitialFetchResult = {
  authUser: User | null;
  isAuthenticated: boolean;
  profile: Tables<"profiles"> | null;
  workspaces: Tables<"workspaces">[];
  currentWorkspaceId: string | null;
  isUserOnboarded: boolean;
  workspaceSubscription: WorkspaceSubscriptionLike | null;
};

export const initialFetch = async ({
  supabase,
}: InitialFetchParams): Promise<InitialFetchResult> => {
  const { data, error } = await supabase.auth.getUser();

  if (isAuthSessionMissingError(error)) {
    return {
      authUser: null,
      isAuthenticated: false,
      profile: null,
      workspaces: [],
      currentWorkspaceId: null,
      isUserOnboarded: false,
      workspaceSubscription: null,
    };
  }

  if (error) {
    throw new Error(`Failed to fetch user: ${error.message}`);
  }
  const authUser = data.user;

  if (!authUser) {
    return {
      authUser: null,
      isAuthenticated: false,
      profile: null,
      workspaces: [],
      currentWorkspaceId: null,
      isUserOnboarded: false,
      workspaceSubscription: null,
    };
  }

  const [
    { data: profile, error: profileError },
    { data: memberRows, error: workspaceError },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", authUser.id).maybeSingle(),
    supabase
      .from("workspace_members")
      .select("workspace_id, created_at, workspace:workspaces(*)")
      .eq("user_id", authUser.id)
      .order("created_at", { ascending: true })
      .order("workspace_id", { ascending: true }),
  ]);

  if (profileError) {
    throw new Error(`Failed to fetch profile: ${profileError.message}`);
  }

  if (workspaceError) {
    throw new Error(`Failed to fetch workspaces: ${workspaceError.message}`);
  }

  const profileExists = Boolean(profile?.primary_use_case);

  const workspaces = (memberRows ?? [])
    .map((m: { workspace?: Tables<"workspaces"> | null }) => m.workspace)
    .filter(Boolean) as Tables<"workspaces">[];

  const currentWorkspaceId =
    (workspaces?.length ?? 0) > 0 ? workspaces[0]!.id : null;

  let workspaceSubscription: WorkspaceSubscriptionLike | null = null;
  if (currentWorkspaceId) {
    const { data: subscriptionRow } = await supabase
      .from("workspace_subscriptions")
      .select("*")
      .eq("workspace_id", currentWorkspaceId)
      .maybeSingle();
    if (subscriptionRow) {
      workspaceSubscription = {
        workspaceId: subscriptionRow.workspace_id,
        planId: subscriptionRow.plan_id as PlanId,
        billingInterval: subscriptionRow.billing_interval as BillingInterval,
        status: subscriptionRow.status,
        provider: subscriptionRow.provider as SubscriptionProvider,
        trialStartedAt: subscriptionRow.trial_started_at,
        trialEndsAt: subscriptionRow.trial_ends_at,
        trialUsedAt: subscriptionRow.trial_used_at,
        currentPeriodStartedAt: subscriptionRow.current_period_started_at,
        currentPeriodEndsAt: subscriptionRow.current_period_ends_at,
        cancelAtPeriodEnd: subscriptionRow.cancel_at_period_end ?? false,
        providerCustomerId: subscriptionRow.provider_customer_id,
        providerSubscriptionId: subscriptionRow.provider_subscription_id,
        updatedAt: subscriptionRow.updated_at,
      };
    }
  }

  const hasWorkspace = currentWorkspaceId !== null;
  return {
    authUser,
    isAuthenticated: true,
    profile: (profile as Tables<"profiles">) ?? null,
    workspaces,
    currentWorkspaceId,
    isUserOnboarded: profileExists && hasWorkspace,
    workspaceSubscription,
  };
};
