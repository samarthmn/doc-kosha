import Stripe from "stripe";

import { DISPLAY_PRICES } from "../displayPrices";
import { getStripePriceId, StripeMode } from "../stripePriceIds";
import { BillingInterval, PaidPlanId } from "../types";

type TargetPriceConfig = {
  item:
    | { price: string; price_data?: never }
    | {
        price?: never;
        price_data: Stripe.SubscriptionUpdateParams.Item.PriceData;
      };
  metadataPriceId: string;
};

const getCurrentInterval = (
  subscription: Stripe.Subscription,
): Stripe.Price.Recurring.Interval | null => {
  const firstItem = subscription.items.data[0];
  return (firstItem?.price?.recurring?.interval ??
    firstItem?.plan?.interval ??
    null) as Stripe.Price.Recurring.Interval | null;
};

const buildTargetPriceConfig = async (args: {
  stripe: Stripe;
  mode: StripeMode;
  planId: PaidPlanId;
  billingInterval: BillingInterval;
}): Promise<TargetPriceConfig> => {
  const { stripe, mode, planId, billingInterval } = args;
  const priceId = getStripePriceId(planId, billingInterval, mode);
  const displayPrice = DISPLAY_PRICES[planId][billingInterval];
  const discountPercent =
    billingInterval === "year" ? (displayPrice.discount ?? 0) : 0;

  if (discountPercent <= 0) {
    return {
      item: { price: priceId },
      metadataPriceId: priceId,
    };
  }

  const basePrice = await stripe.prices.retrieve(priceId);
  const productId =
    typeof basePrice.product === "string"
      ? basePrice.product
      : basePrice.product?.id;

  if (!productId) {
    throw new Error(
      `Stripe price ${priceId} is missing a product for annual plan changes`,
    );
  }

  const discountedUnitAmount = Math.round(
    displayPrice.unitAmount * (1 - discountPercent / 100),
  );

  return {
    item: {
      price_data: {
        currency: basePrice.currency,
        product: productId,
        recurring: {
          interval: "year",
          ...(basePrice.recurring?.interval_count
            ? { interval_count: basePrice.recurring.interval_count }
            : {}),
        },
        unit_amount: discountedUnitAmount,
        ...(basePrice.tax_behavior && basePrice.tax_behavior !== "unspecified"
          ? { tax_behavior: basePrice.tax_behavior }
          : {}),
      },
    },
    metadataPriceId: priceId,
  };
};

export const updateStripeSubscriptionPlan = async (args: {
  stripe: Stripe;
  subscription: Stripe.Subscription;
  workspaceId: string;
  planId: PaidPlanId;
  billingInterval: BillingInterval;
  mode: StripeMode;
}): Promise<Stripe.Subscription> => {
  const { stripe, subscription, workspaceId, planId, billingInterval, mode } =
    args;

  const firstItem = subscription.items.data[0];
  if (!firstItem?.id) {
    throw new Error("Subscription has no updatable item");
  }

  const targetInterval =
    billingInterval === "year"
      ? ("year" satisfies Stripe.Price.Recurring.Interval)
      : ("month" satisfies Stripe.Price.Recurring.Interval);
  const currentInterval = getCurrentInterval(subscription);
  const isIntervalChange =
    Boolean(currentInterval) && currentInterval !== targetInterval;

  const targetPrice = await buildTargetPriceConfig({
    stripe,
    mode,
    planId,
    billingInterval,
  });

  const updateParams: Stripe.SubscriptionUpdateParams = {
    items: [
      {
        id: firstItem.id,
        ...targetPrice.item,
        quantity: firstItem.quantity ?? 1,
      },
    ],
    metadata: {
      workspace_id: workspaceId,
      plan_id: planId,
      billing_interval: billingInterval,
      price_id: targetPrice.metadataPriceId,
    },
    billing_cycle_anchor: isIntervalChange ? "now" : "unchanged",
    payment_behavior: "error_if_incomplete",
    proration_behavior: "always_invoice",
  };

  const trialEndMs =
    typeof subscription.trial_end === "number"
      ? subscription.trial_end * 1000
      : 0;
  const isTrialing =
    subscription.status === "trialing" && trialEndMs > Date.now();

  if (isTrialing) {
    if (isIntervalChange) {
      updateParams.trial_end = "now";
    } else {
      updateParams.billing_cycle_anchor = "unchanged";
      updateParams.proration_behavior = "none";
    }
  }

  return await stripe.subscriptions.update(subscription.id, updateParams);
};
