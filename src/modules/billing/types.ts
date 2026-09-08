export const PAID_PLAN_IDS = ["essential", "plus", "max"] as const;
export const PLAN_IDS = ["free", ...PAID_PLAN_IDS] as const;

export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];
export type PlanId = (typeof PLAN_IDS)[number];

export const isPaidPlanId = (planId: PlanId): planId is PaidPlanId =>
  (PAID_PLAN_IDS as readonly PlanId[]).includes(planId);

export type BillingInterval = "month" | "year";

export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired"
  | "incomplete";

export type SubscriptionProvider = "manual" | "stripe";

export type WorkspaceSubscriptionLike = {
  workspaceId: string;
  planId: PlanId;
  billingInterval: BillingInterval;
  status: SubscriptionStatus;
  provider: SubscriptionProvider;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  trialUsedAt?: string | null;
  currentPeriodStartedAt?: string | null;
  currentPeriodEndsAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  updatedAt?: string | null;
};

export type PlanLimits = {
  maxDataRooms: number | null;
  maxStorageBytes: number | null;
  maxBandwidthBytes: number | null;
  maxMembers: number | null;
  allowedDocumentExtensions: readonly string[] | null;
  maxPreviousVersions: number | null;
  canUseCustomDomains: boolean;
  canRemoveBranding: boolean;
};

export type PlanDefinition = {
  id: PlanId;
  name: string;
  description: string;
  limits: PlanLimits;
  hasTrial: boolean;
};
