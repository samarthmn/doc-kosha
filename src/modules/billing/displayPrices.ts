import { BillingInterval, PaidPlanId } from "./types";

export type DisplayPricePromotion = {
  source: "coupon" | "promotion_code";
  percentOff?: number | null;
  amountOff?: number | null;
  currency?: string | null;
  duration: "once" | "forever" | "repeating";
  durationInMonths?: number | null;
  badgeText?: string | null;
};

export type DisplayPrice = {
  unitAmount: number;
  currency: string;
  discount?: number;
  promotion?: DisplayPricePromotion | null;
};

export type DisplayPrices = Record<
  PaidPlanId,
  Record<BillingInterval, DisplayPrice>
>;

const getDiscountedAmount = (price: DisplayPrice): number => {
  const baseDiscountPercent = price.discount ?? 0;
  const amountAfterBase =
    baseDiscountPercent > 0
      ? Math.round(price.unitAmount * (1 - baseDiscountPercent / 100))
      : price.unitAmount;

  const promotion = price.promotion;
  if (!promotion) return amountAfterBase;

  if (typeof promotion.percentOff === "number" && promotion.percentOff > 0) {
    return Math.max(
      0,
      Math.round(amountAfterBase * (1 - promotion.percentOff / 100)),
    );
  }

  if (typeof promotion.amountOff === "number" && promotion.amountOff > 0) {
    return Math.max(0, amountAfterBase - promotion.amountOff);
  }

  return amountAfterBase;
};

// NOTE: These are the **display** prices used in the UI and marketing pages.
// Keep in sync with the pricing screenshots/spec.
export const DISPLAY_PRICES: DisplayPrices = {
  essential: {
    month: { unitAmount: 4900, currency: "usd" },
    year: { unitAmount: 58800, currency: "usd", discount: 30 },
  },
  plus: {
    month: { unitAmount: 19900, currency: "usd" },
    year: { unitAmount: 238800, currency: "usd", discount: 30 },
  },
  max: {
    month: { unitAmount: 77900, currency: "usd" },
    year: { unitAmount: 934800, currency: "usd", discount: 30 },
  },
};

export const getSharedDiscountPercent = (
  prices: DisplayPrices,
  interval: BillingInterval,
): number | undefined => {
  const percentages = (Object.keys(prices) as PaidPlanId[]).map((planId) => {
    const price = prices[planId][interval];
    const discountedAmount = getDiscountedAmount(price);
    if (discountedAmount >= price.unitAmount) {
      return null;
    }

    const effectivePercent =
      ((price.unitAmount - discountedAmount) / price.unitAmount) * 100;
    return Number(effectivePercent.toFixed(2));
  });

  const [first] = percentages;
  if (typeof first !== "number" || first <= 0) return undefined;

  return percentages.every((value) => value === first) ? first : undefined;
};
