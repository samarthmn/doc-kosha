import { z } from "zod";

export const GoogleAdsPurchaseConversionSchema = z.object({
  value: z.number().finite().positive(),
  currency: z.literal("USD"),
  transactionId: z.string().trim().min(1),
});

export type GoogleAdsPurchaseConversion = z.infer<
  typeof GoogleAdsPurchaseConversionSchema
>;

type CheckoutPurchaseSource = {
  id: string;
  mode: string | null;
  paymentStatus: string;
  amountTotal: number | null;
  currency: string | null;
};

export const buildGoogleAdsPurchaseConversion = (
  source: CheckoutPurchaseSource,
): GoogleAdsPurchaseConversion | null => {
  if (source.mode !== "subscription") return null;
  if (source.paymentStatus !== "paid") return null;
  if (source.currency?.toLowerCase() !== "usd") return null;
  if (!source.amountTotal || source.amountTotal <= 0) return null;

  return GoogleAdsPurchaseConversionSchema.parse({
    value: source.amountTotal / 100,
    currency: "USD",
    transactionId: source.id,
  });
};
