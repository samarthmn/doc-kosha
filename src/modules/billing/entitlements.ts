import { PlanId, SubscriptionStatus, WorkspaceSubscriptionLike } from "./types";
import { PLAN_CATALOG, PLAN_LIMITS } from "./plans";
import { formatBytes } from "@/lib/format";

const parseDate = (value?: string | null) => (value ? new Date(value) : null);

const isTrialActive = (
  subscription: WorkspaceSubscriptionLike | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (!subscription) return false;
  if (subscription.status !== "trialing") return false;
  const trialEnds = parseDate(subscription.trialEndsAt);
  if (!trialEnds) return false;
  return trialEnds.getTime() > now.getTime();
};

const isPeriodActive = (
  subscription: WorkspaceSubscriptionLike | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (!subscription) return false;
  if (subscription.status !== "active") return false;
  const periodEnds = parseDate(subscription.currentPeriodEndsAt);
  if (!periodEnds) return true;
  return periodEnds.getTime() > now.getTime();
};

export const hasEntitlementNow = (
  subscription: WorkspaceSubscriptionLike | null | undefined,
  now: Date = new Date(),
): boolean => {
  return isTrialActive(subscription, now) || isPeriodActive(subscription, now);
};

export const canUseCustomDomains = (
  subscription: WorkspaceSubscriptionLike | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (!subscription) return false;
  if (!hasEntitlementNow(subscription, now)) return false;
  return PLAN_LIMITS[subscription.planId]?.canUseCustomDomains ?? false;
};

export const canRemoveBranding = (
  subscription: WorkspaceSubscriptionLike | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (!subscription) return false;
  if (!hasEntitlementNow(subscription, now)) return false;
  return PLAN_LIMITS[subscription.planId]?.canRemoveBranding ?? false;
};

const formatLimit = (value: number | null): string =>
  value === null ? "Unlimited" : value.toString();

export const formatStorage = (bytes: number | null): string => {
  if (bytes === null) return "Unlimited";
  return formatBytes(bytes);
};

export const getPlanLimitLabels = (planId: PlanId) => {
  const limits = PLAN_LIMITS[planId];
  return {
    dataRooms: formatLimit(limits.maxDataRooms),
    storage: formatStorage(limits.maxStorageBytes),
    bandwidth: formatStorage(limits.maxBandwidthBytes),
    members: formatLimit(limits.maxMembers),
  };
};

export const getPlanDescription = (planId: PlanId): string =>
  PLAN_CATALOG[planId].description;

export const normalizeStatus = (
  status: string | null | undefined,
): SubscriptionStatus => {
  const allowed: SubscriptionStatus[] = [
    "none",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "expired",
    "incomplete",
  ];
  const lower = (status || "").toLowerCase() as SubscriptionStatus;
  return allowed.includes(lower) ? lower : "none";
};
