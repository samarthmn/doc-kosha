import { sanitizeInternalReturnPath } from "@/lib/internalReturnPath";

export { sanitizeInternalReturnPath } from "@/lib/internalReturnPath";

export const SUBSCRIPTION_REQUEST_PATH_HEADER =
  "x-dockosha-authenticated-request-path";

const DEFAULT_RETURN_PATH = "/";
const DEFAULT_SUBSCRIPTION_RETURN_PATH = "/settings?tab=subscription";
const SUBSCRIPTION_SETTINGS_PATH = "/settings";
const CHECKOUT_CANCELED_PATH = "/billing/checkout/canceled";

export const resolveSubscriptionReturnPath = (
  requestPath: string | null | undefined,
): string =>
  sanitizeInternalReturnPath(requestPath) ?? DEFAULT_SUBSCRIPTION_RETURN_PATH;

export const isSubscriptionRecoveryPath = (
  requestPath: string | null | undefined,
): boolean => {
  const sanitized = sanitizeInternalReturnPath(requestPath);
  if (!sanitized) return false;
  const parsed = new URL(sanitized, "https://dockosha.invalid");

  if (
    parsed.pathname === SUBSCRIPTION_SETTINGS_PATH &&
    parsed.searchParams.get("tab") === "subscription"
  ) {
    return true;
  }

  if (parsed.pathname === CHECKOUT_CANCELED_PATH) {
    return true;
  }

  if (parsed.pathname !== "/dashboard") {
    return false;
  }

  const billingSuccess = parsed.searchParams.get("billing_success");
  return billingSuccess === "1" || billingSuccess === "true";
};

export const buildSubscriptionAccessRedirect = (
  requestPath: string | null | undefined,
): string => {
  const returnPath =
    sanitizeInternalReturnPath(requestPath) ?? DEFAULT_RETURN_PATH;
  const params = new URLSearchParams();
  params.set("tab", "subscription");
  params.set("planPicker", "1");
  params.set("redirect", returnPath);
  return `${SUBSCRIPTION_SETTINGS_PATH}?${params.toString()}`;
};
