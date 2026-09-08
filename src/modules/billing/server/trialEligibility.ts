import Stripe from "stripe";
import { addDays } from "date-fns";

/**
 * DocKosha metadata keys stored on Stripe customers to track trial usage.
 * These persist even if our DB is wiped, preventing trial resets.
 */
export const DOCKOSHA_METADATA_KEYS = {
  TRIAL_STARTED_AT: "dockosha_trial_started_at",
  TRIAL_EXPIRES_AT: "dockosha_trial_expires_at",
  HAD_SUBSCRIPTION: "dockosha_had_subscription",
  STATUS: "dockosha_status",
} as const;

/** Trial duration in days */
export const TRIAL_DURATION_DAYS = 14;

type TrialEligibilityResult =
  | {
      eligible: true;
      /** Unix timestamp (seconds) when the trial started */
      trialStartUnix: number;
      /** Unix timestamp (seconds) when the trial should end */
      trialEndUnix: number;
      /** Whether this is resuming an existing trial (vs starting fresh) */
      isResume: boolean;
    }
  | {
      eligible: false;
      reason: "trial_expired" | "had_subscription" | "no_email";
    };

/**
 * Determine trial eligibility for a Stripe customer.
 *
 * Rules:
 * - If customer metadata shows trial already expired → ineligible
 * - If customer had a paid subscription before → ineligible
 * - If customer is within their trial window → eligible with remaining time
 * - If no trial history → eligible for full 14 days
 *
 * Fallback: If metadata is missing but customer has subscription history,
 * infer trial usage from subscription data.
 */
export const resolveTrialEligibility = async (
  stripe: Stripe,
  customerId: string,
): Promise<TrialEligibilityResult> => {
  const parseIsoToUnix = (value: string | undefined): number | null => {
    if (!value) return null;
    const millis = new Date(value).getTime();
    if (!Number.isFinite(millis)) return null;
    return Math.floor(millis / 1000);
  };

  const deriveTrialStartUnix = (trialEndUnix: number): number =>
    trialEndUnix - TRIAL_DURATION_DAYS * 24 * 60 * 60;

  let customer: Stripe.Customer | Stripe.DeletedCustomer;
  try {
    customer = await stripe.customers.retrieve(customerId);
  } catch (err) {
    console.warn("[billing] failed to retrieve customer", { customerId, err });
    return { eligible: false, reason: "no_email" };
  }

  if ("deleted" in customer && customer.deleted) {
    return { eligible: false, reason: "no_email" };
  }

  const metadata = customer.metadata || {};
  const now = Date.now();

  // Check if customer ever had a paid subscription
  const hadSubscription = metadata[DOCKOSHA_METADATA_KEYS.HAD_SUBSCRIPTION];
  if (hadSubscription === "true") {
    // Check if they still have trial time remaining from their original trial
    const trialExpiresAt = metadata[DOCKOSHA_METADATA_KEYS.TRIAL_EXPIRES_AT];
    if (trialExpiresAt) {
      const expiresAtMs = new Date(trialExpiresAt).getTime();
      if (!Number.isFinite(expiresAtMs)) {
        console.warn("[billing] invalid trial expiry timestamp on customer", {
          customerId,
          trialExpiresAt,
        });
      } else if (expiresAtMs > now) {
        const trialEndUnix = Math.floor(expiresAtMs / 1000);
        const trialStartUnix =
          parseIsoToUnix(metadata[DOCKOSHA_METADATA_KEYS.TRIAL_STARTED_AT]) ??
          deriveTrialStartUnix(trialEndUnix);
        // Still within trial window - allow resume
        return {
          eligible: true,
          trialStartUnix,
          trialEndUnix,
          isResume: true,
        };
      }
    }
    // Had subscription and trial expired
    return { eligible: false, reason: "had_subscription" };
  }

  // Check existing trial metadata
  const trialStartedAt = metadata[DOCKOSHA_METADATA_KEYS.TRIAL_STARTED_AT];
  const trialExpiresAt = metadata[DOCKOSHA_METADATA_KEYS.TRIAL_EXPIRES_AT];

  if (trialStartedAt && trialExpiresAt) {
    const expiresAtMs = new Date(trialExpiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) {
      console.warn("[billing] invalid trial expiry timestamp on customer", {
        customerId,
        trialExpiresAt,
      });
      return { eligible: false, reason: "trial_expired" };
    }

    if (expiresAtMs > now) {
      const trialEndUnix = Math.floor(expiresAtMs / 1000);
      const trialStartUnix =
        parseIsoToUnix(trialStartedAt) ?? deriveTrialStartUnix(trialEndUnix);
      // Still within trial window
      return {
        eligible: true,
        trialStartUnix,
        trialEndUnix,
        isResume: true,
      };
    } else {
      // Trial expired
      return { eligible: false, reason: "trial_expired" };
    }
  }

  // No metadata - check subscription history as fallback
  const subscriptionHistory = await getSubscriptionHistory(stripe, customerId);

  if (subscriptionHistory.hadTrialingSubscription) {
    // They had a trial before but metadata wasn't set
    if (subscriptionHistory.trialEndUnix) {
      const expiresAtMs = subscriptionHistory.trialEndUnix * 1000;
      if (expiresAtMs > now) {
        // Still within trial window
        const trialEndUnix = subscriptionHistory.trialEndUnix;
        return {
          eligible: true,
          trialStartUnix: deriveTrialStartUnix(trialEndUnix),
          trialEndUnix,
          isResume: true,
        };
      }
    }
    return { eligible: false, reason: "trial_expired" };
  }

  if (subscriptionHistory.hadPaidSubscription) {
    return { eligible: false, reason: "had_subscription" };
  }

  // No subscription history - eligible for full trial
  const trialEnd = addDays(new Date(), TRIAL_DURATION_DAYS);
  const trialStart = new Date();
  return {
    eligible: true,
    trialStartUnix: Math.floor(trialStart.getTime() / 1000),
    trialEndUnix: Math.floor(trialEnd.getTime() / 1000),
    isResume: false,
  };
};

type SubscriptionHistory = {
  hadTrialingSubscription: boolean;
  hadPaidSubscription: boolean;
  trialEndUnix: number | null;
};

/**
 * Check subscription history for a customer to infer trial usage.
 */
const getSubscriptionHistory = async (
  stripe: Stripe,
  customerId: string,
): Promise<SubscriptionHistory> => {
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });

    let hadTrialingSubscription = false;
    let hadPaidSubscription = false;
    let latestTrialEnd: number | null = null;

    for (const sub of subscriptions.data) {
      // Check if subscription ever had a trial
      if (sub.trial_start || sub.trial_end) {
        hadTrialingSubscription = true;
        if (
          sub.trial_end &&
          (!latestTrialEnd || sub.trial_end > latestTrialEnd)
        ) {
          latestTrialEnd = sub.trial_end;
        }
      }

      // Check if subscription was ever active (paid)
      if (
        sub.status === "active" ||
        sub.status === "past_due" ||
        sub.status === "canceled"
      ) {
        // If it went past trial to active billing, it's a paid subscription
        const trialEnd = sub.trial_end ?? 0;
        const currentPeriodStart =
          (sub as Stripe.Subscription & { current_period_start?: number })
            .current_period_start ?? 0;
        if (currentPeriodStart > trialEnd) {
          hadPaidSubscription = true;
        }
      }
    }

    return {
      hadTrialingSubscription,
      hadPaidSubscription,
      trialEndUnix: latestTrialEnd,
    };
  } catch (err) {
    console.warn("[billing] failed to fetch subscription history", err);
    return {
      hadTrialingSubscription: false,
      hadPaidSubscription: false,
      trialEndUnix: null,
    };
  }
};

/**
 * Update Stripe customer metadata with trial information.
 * Call this after a trial subscription is created.
 */
export const persistTrialMetadataToCustomer = async (
  stripe: Stripe,
  customerId: string,
  trialStartUnix: number,
  trialEndUnix: number,
): Promise<boolean> => {
  try {
    await stripe.customers.update(customerId, {
      metadata: {
        [DOCKOSHA_METADATA_KEYS.TRIAL_STARTED_AT]: new Date(
          trialStartUnix * 1000,
        ).toISOString(),
        [DOCKOSHA_METADATA_KEYS.TRIAL_EXPIRES_AT]: new Date(
          trialEndUnix * 1000,
        ).toISOString(),
      },
    });
    return true;
  } catch (err) {
    console.warn("[billing] failed to persist trial metadata", {
      customerId,
      err,
    });
    return false;
  }
};

/**
 * Mark customer as having had a subscription.
 * Call this when any subscription is created or becomes active.
 */
export const markCustomerHadSubscription = async (
  stripe: Stripe,
  customerId: string,
): Promise<void> => {
  try {
    await stripe.customers.update(customerId, {
      metadata: {
        [DOCKOSHA_METADATA_KEYS.HAD_SUBSCRIPTION]: "true",
      },
    });
  } catch (err) {
    console.warn("[billing] failed to mark customer had subscription", {
      customerId,
      err,
    });
  }
};

/**
 * Check if a customer has any active or trialing subscriptions.
 * Used to prevent double-billing.
 */
export const getActiveOrTrialingSubscription = async (
  stripe: Stripe,
  customerId: string,
): Promise<Stripe.Subscription | null> => {
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 50,
    });

    for (const sub of subscriptions.data) {
      if (sub.status === "active" || sub.status === "trialing") {
        return sub;
      }
    }

    return null;
  } catch (err) {
    console.warn("[billing] failed to check active subscriptions", {
      customerId,
      err,
    });
    // Don't treat API failures as "no subscription" — callers must handle this explicitly.
    throw err;
  }
};
