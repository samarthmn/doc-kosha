import {
  canRemoveBranding,
  canUseCustomDomains,
} from "@/modules/billing/entitlements";
import type { WorkspaceSubscriptionLike } from "@/modules/billing/types";

export const canUseCustomDomain = (
  subscription?: WorkspaceSubscriptionLike | null,
  now?: Date,
): boolean =>
  canUseCustomDomains(subscription, now) ||
  canRemoveBranding(subscription, now);
