import { Tables } from "@/types/generated/supabase";
import {
  BillingInterval,
  PlanId,
  SubscriptionProvider,
  WorkspaceSubscriptionLike,
} from "./types";
import { normalizeStatus } from "./entitlements";

export const mapWorkspaceSubscriptionRow = (
  row: Tables<"workspace_subscriptions"> | null | undefined,
): WorkspaceSubscriptionLike | null => {
  if (!row) return null;
  return {
    workspaceId: row.workspace_id,
    planId: row.plan_id as PlanId,
    billingInterval: row.billing_interval as BillingInterval,
    status: normalizeStatus(row.status),
    provider: (row.provider ?? "stripe") as SubscriptionProvider,
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
    trialUsedAt: row.trial_used_at,
    currentPeriodStartedAt: row.current_period_started_at,
    currentPeriodEndsAt: row.current_period_ends_at,
    cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
    providerCustomerId: row.provider_customer_id,
    providerSubscriptionId: row.provider_subscription_id,
    updatedAt: row.updated_at,
  };
};
