import "server-only";

import Stripe from "stripe";
import { z } from "zod";

import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { Tables } from "@/types/generated/supabase";
import {
  DISPLAY_PRICES,
  type DisplayPrice,
  type DisplayPricePromotion,
  type DisplayPrices,
} from "../displayPrices";
import { StripeMode } from "../stripePriceIds";
import { BillingInterval, PaidPlanId } from "../types";

const numericFromSupabase = z.preprocess((value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}, z.number());

const BillingOfferRowSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    status: z.enum(["draft", "active", "archived"]),
    audience: z.enum(["all_signups"]),
    stripe_mode: z.enum(["local", "staging", "production"]),
    plan_id: z.enum(["essential", "plus", "max"]).nullable(),
    billing_interval: z.enum(["month", "year"]).nullable(),
    stripe_discount_source: z.enum(["coupon", "promotion_code"]),
    stripe_coupon_id: z.string().trim().min(1).nullable(),
    stripe_promotion_code_id: z.string().trim().min(1).nullable(),
    percent_off: numericFromSupabase.nullable(),
    amount_off: z.number().int().nullable(),
    currency: z.string().trim().min(3).max(3).nullable(),
    duration: z.enum(["once", "forever", "repeating"]),
    duration_in_months: z.number().int().nullable(),
    badge_text: z.string().nullable(),
    starts_at: z.string(),
    ends_at: z.string().nullable(),
    priority: z.number().int(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.duration === "repeating" && !value.duration_in_months) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["duration_in_months"],
        message: "Repeating offers require duration_in_months",
      });
    }
  });

type BillingOfferRow = z.infer<typeof BillingOfferRowSchema>;

const isOfferActiveAt = (offer: BillingOfferRow, now: Date): boolean => {
  const startsAt = Date.parse(offer.starts_at);
  if (!Number.isFinite(startsAt) || startsAt > now.getTime()) {
    return false;
  }

  if (!offer.ends_at) return true;

  const endsAt = Date.parse(offer.ends_at);
  return Number.isFinite(endsAt) && endsAt > now.getTime();
};

const offerSpecificity = (offer: BillingOfferRow): number => {
  let score = 0;
  if (offer.plan_id) score += 1;
  if (offer.billing_interval) score += 1;
  return score;
};

const matchesPlan = (offer: BillingOfferRow, planId: PaidPlanId): boolean => {
  return !offer.plan_id || offer.plan_id === planId;
};

const matchesInterval = (
  offer: BillingOfferRow,
  billingInterval: BillingInterval,
): boolean => {
  return !offer.billing_interval || offer.billing_interval === billingInterval;
};

const toDisplayPromotion = (
  offer: BillingOfferRow,
): DisplayPricePromotion | null => {
  if (
    typeof offer.percent_off !== "number" &&
    typeof offer.amount_off !== "number"
  ) {
    return null;
  }

  return {
    source: offer.stripe_discount_source,
    percentOff: offer.percent_off ?? null,
    amountOff: offer.amount_off ?? null,
    currency: offer.currency?.toLowerCase() ?? null,
    duration: offer.duration,
    durationInMonths: offer.duration_in_months ?? null,
    badgeText: offer.badge_text,
  };
};

export const buildStripeCheckoutDiscount = (
  offer: BillingOfferRow,
): Stripe.Checkout.SessionCreateParams.Discount => {
  if (offer.stripe_discount_source === "coupon" && offer.stripe_coupon_id) {
    return { coupon: offer.stripe_coupon_id };
  }

  if (
    offer.stripe_discount_source === "promotion_code" &&
    offer.stripe_promotion_code_id
  ) {
    return { promotion_code: offer.stripe_promotion_code_id };
  }

  throw new Error(
    `Billing offer ${offer.id} is missing its Stripe discount ID`,
  );
};

export const resolveBillingOffer = (args: {
  offers: BillingOfferRow[];
  planId: PaidPlanId;
  billingInterval: BillingInterval;
  now?: Date;
}): BillingOfferRow | null => {
  const now = args.now ?? new Date();

  const applicable = args.offers
    .filter((offer) => isOfferActiveAt(offer, now))
    .filter((offer) => matchesPlan(offer, args.planId))
    .filter((offer) => matchesInterval(offer, args.billingInterval))
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      const specificityDelta = offerSpecificity(right) - offerSpecificity(left);
      if (specificityDelta !== 0) {
        return specificityDelta;
      }

      return (
        Date.parse(right.starts_at || right.created_at) -
        Date.parse(left.starts_at || left.created_at)
      );
    });

  return applicable[0] ?? null;
};

export const listActiveBillingOffers = async (
  mode: StripeMode,
): Promise<BillingOfferRow[]> => {
  try {
    const admin = createSupabaseServiceClient();
    const { data, error } = await admin
      .from("billing_offers")
      .select("*")
      .eq("status", "active")
      .eq("stripe_mode", mode)
      .order("priority", { ascending: true })
      .order("starts_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[billing/offers] failed to load offers", error);
      return [];
    }

    return BillingOfferRowSchema.array().parse(
      (data ?? []) as Tables<"billing_offers">[],
    );
  } catch (error) {
    console.warn("[billing/offers] falling back to base prices", error);
    return [];
  }
};

const mergeDisplayPrice = (
  price: DisplayPrice,
  offer: BillingOfferRow | null,
): DisplayPrice => {
  return {
    ...price,
    promotion: offer ? toDisplayPromotion(offer) : null,
  };
};

export const getResolvedDisplayPrices = async (
  mode: StripeMode,
): Promise<DisplayPrices> => {
  const offers = await listActiveBillingOffers(mode);

  return {
    essential: {
      month: mergeDisplayPrice(
        DISPLAY_PRICES.essential.month,
        resolveBillingOffer({
          offers,
          planId: "essential",
          billingInterval: "month",
        }),
      ),
      year: mergeDisplayPrice(
        DISPLAY_PRICES.essential.year,
        resolveBillingOffer({
          offers,
          planId: "essential",
          billingInterval: "year",
        }),
      ),
    },
    plus: {
      month: mergeDisplayPrice(
        DISPLAY_PRICES.plus.month,
        resolveBillingOffer({
          offers,
          planId: "plus",
          billingInterval: "month",
        }),
      ),
      year: mergeDisplayPrice(
        DISPLAY_PRICES.plus.year,
        resolveBillingOffer({
          offers,
          planId: "plus",
          billingInterval: "year",
        }),
      ),
    },
    max: {
      month: mergeDisplayPrice(
        DISPLAY_PRICES.max.month,
        resolveBillingOffer({
          offers,
          planId: "max",
          billingInterval: "month",
        }),
      ),
      year: mergeDisplayPrice(
        DISPLAY_PRICES.max.year,
        resolveBillingOffer({
          offers,
          planId: "max",
          billingInterval: "year",
        }),
      ),
    },
  };
};
