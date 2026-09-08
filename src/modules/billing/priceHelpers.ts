import { DisplayPrice } from "./displayPrices";
import { BillingInterval } from "./types";

export interface PriceViewModel {
  /** The primary large price to show (e.g. "$47") */
  amount: string;
  /** The currency code (e.g. "USD") */
  currency: string;
  /** The interval suffix (e.g. "/mo") */
  interval: string;

  /**
   * Original monthly price before discount
   * (used for monthly discounts or annual monthly-equivalent strike-throughs)
   */
  originalMonthlyEquivalent?: string;

  /**
   * Secondary text for annual billing (e.g. "Billed annually $566")
   */
  billedAnnuallyText?: string;

  /**
   * Original annual total before discount (e.g. "$708")
   */
  originalAnnualTotal?: string;

  /**
   * Discount label (e.g. "Save 20%")
   */
  discountLabel?: string;
}

const formatCurrency = (amount: number, currency = "usd"): string => {
  return Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    amount / 100,
  );
};

const formatPercent = (value: number): string => {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
};

const buildPromotionLabel = (
  price: DisplayPrice,
  interval: BillingInterval,
): string | undefined => {
  const promotion = price.promotion;
  if (!promotion) return undefined;
  if (promotion.badgeText) return promotion.badgeText;

  const valueLabel =
    typeof promotion.percentOff === "number"
      ? `${formatPercent(promotion.percentOff)}% off`
      : typeof promotion.amountOff === "number"
        ? `${formatCurrency(
            promotion.amountOff,
            promotion.currency ?? price.currency,
          )} off`
        : null;

  if (!valueLabel) return undefined;

  switch (promotion.duration) {
    case "once":
      return `${valueLabel} first payment`;
    case "forever":
      return `${valueLabel} forever`;
    case "repeating":
      return `${valueLabel} for ${
        promotion.durationInMonths === 1
          ? "1 month"
          : `${promotion.durationInMonths ?? 0} months`
      }`;
    default:
      return interval === "month" ? valueLabel : valueLabel;
  }
};

const applyDisplayDiscounts = (price: DisplayPrice): number => {
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

export const getPriceViewModel = (
  price: DisplayPrice,
  interval: BillingInterval,
): PriceViewModel => {
  const originalAmount = price.unitAmount;
  const finalAmount = applyDisplayDiscounts(price);
  const hasDiscount = finalAmount < originalAmount;
  const labels: string[] = [];

  if ((price.discount ?? 0) > 0 && interval === "year") {
    labels.push(`Save ${formatPercent(price.discount ?? 0)}% annually`);
  }

  const promotionLabel = buildPromotionLabel(price, interval);
  if (promotionLabel) {
    labels.push(promotionLabel);
  }

  if (interval === "month") {
    return {
      amount: formatCurrency(finalAmount, price.currency),
      currency: price.currency,
      interval: "/mo",
      originalMonthlyEquivalent: hasDiscount
        ? formatCurrency(originalAmount, price.currency)
        : undefined,
      discountLabel: labels.length > 0 ? labels.join(" · ") : undefined,
    };
  }

  const originalAnnual = originalAmount;
  const finalAnnual = finalAmount;
  const monthlyEquiv = finalAnnual / 12;
  const originalMonthlyEquiv = originalAnnual / 12;

  return {
    amount: formatCurrency(monthlyEquiv, price.currency),
    currency: price.currency,
    interval: "/mo",
    originalMonthlyEquivalent: hasDiscount
      ? formatCurrency(originalMonthlyEquiv, price.currency)
      : undefined,
    billedAnnuallyText: `Billed annually ${formatCurrency(finalAnnual, price.currency)}`,
    originalAnnualTotal: hasDiscount
      ? formatCurrency(originalAnnual, price.currency)
      : undefined,
    discountLabel: labels.length > 0 ? labels.join(" · ") : undefined,
  };
};
