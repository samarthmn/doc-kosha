import Stripe from "stripe";

const AUTOMATIC_TAX_ERROR_CODES: ReadonlySet<string> = new Set([
  "customer_tax_location_invalid",
  "invalid_tax_location",
]);

const AUTOMATIC_TAX_ERROR_PARAMS: ReadonlySet<string> = new Set([
  "automatic_tax",
  "automatic_tax[enabled]",
]);

type TaxSettingsStatus = Pick<Stripe.Tax.Settings, "status">;
type LoadTaxSettings = () => Promise<TaxSettingsStatus>;

export const shouldRetryCheckoutWithoutAutomaticTax = async (
  err: unknown,
  loadTaxSettings: LoadTaxSettings,
): Promise<boolean> => {
  if (!(err instanceof Stripe.errors.StripeInvalidRequestError)) {
    return false;
  }

  if (
    (typeof err.code === "string" && AUTOMATIC_TAX_ERROR_CODES.has(err.code)) ||
    (typeof err.param === "string" && AUTOMATIC_TAX_ERROR_PARAMS.has(err.param))
  ) {
    return true;
  }

  if (typeof err.code === "string" || typeof err.param === "string") {
    return false;
  }

  try {
    const settings = await loadTaxSettings();
    return settings.status === "pending";
  } catch {
    return false;
  }
};
