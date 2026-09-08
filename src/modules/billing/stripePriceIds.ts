import { BillingInterval, PaidPlanId } from "./types";

export type StripeMode = "local" | "staging" | "production";

type PriceMap = Record<PaidPlanId, Record<BillingInterval, string>>;

// These are Stripe *Price IDs* (e.g. `price_1ABC...`) — not API keys.
// - `local`: your local/dev Stripe Prices (usually Stripe **Test mode**)
// - `staging`: your staging Stripe Prices (often Stripe **Test mode** in a separate account)
// - `production`: your production Stripe Prices (Stripe **Live mode**)
//
// Replace placeholder values with your real Stripe Price IDs before deploying.
const STRIPE_PRICE_IDS: Record<StripeMode, PriceMap> = {
  local: {
    essential: {
      month: "price_1StnyeEVxYZwOuOPwJeG6Ckt",
      year: "price_1StnzsEVxYZwOuOPuP6pzNmp",
    },
    plus: {
      month: "price_1StnzEEVxYZwOuOPw4foRrTX",
      year: "price_1Sto0CEVxYZwOuOPKLrdWmgK",
    },
    max: {
      month: "price_1StnzVEVxYZwOuOP6oVJLsla",
      year: "price_1Sto0ZEVxYZwOuOPuFEpT2eg",
    },
  },
  staging: {
    essential: {
      month: "price_1SlNYLIWMwURyhUekvMtukxF",
      year: "price_1SlNYpIWMwURyhUeWqR9jaMk",
    },
    plus: {
      month: "price_1SlNYYIWMwURyhUe5qGAE4OY",
      year: "price_1SlNZRIWMwURyhUePDM185MZ",
    },
    max: {
      month: "price_1Sl12QIWMwURyhUeglvaGKnn",
      year: "price_1Sl13lIWMwURyhUe0esrjXu6",
    },
  },
  production: {
    essential: {
      month: "price_1Sl148IWMwURyhUe1Mw9gRkv",
      year: "price_1Sl148IWMwURyhUeyfdVqU2C",
    },
    plus: {
      month: "price_1Sl14AIWMwURyhUe05p7pKGw",
      year: "price_1Sl14AIWMwURyhUebC5afFId",
    },
    max: {
      month: "price_1Sl14CIWMwURyhUebJ5k3XTb",
      year: "price_1Sl14CIWMwURyhUe92rKckSl",
    },
  },
} as const;

export const getStripeMode = (rawMode?: string | null): StripeMode => {
  const normalized = (rawMode ?? "").trim().toLowerCase();

  switch (normalized) {
    case "production":
    case "prod":
    case "live":
      return "production";
    case "staging":
    case "stage":
      return "staging";
    case "local":
    case "dev":
    case "development":
    case "test":
    default:
      return "local";
  }
};

export const getStripePriceId = (
  planId: PaidPlanId,
  interval: BillingInterval,
  mode: StripeMode,
): string => {
  const priceId = STRIPE_PRICE_IDS[mode]?.[planId]?.[interval];
  if (!priceId) {
    throw new Error(
      `Stripe price ID missing for plan=${planId}, interval=${interval}, mode=${mode}`,
    );
  }
  return priceId;
};

export const stripePriceIds = STRIPE_PRICE_IDS;

export const getPlanIntervalFromPriceId = (
  priceId: string,
  mode: StripeMode,
): { planId: PaidPlanId; interval: BillingInterval } | null => {
  const mapForMode = STRIPE_PRICE_IDS[mode];
  for (const plan of Object.keys(mapForMode) as PaidPlanId[]) {
    for (const interval of Object.keys(mapForMode[plan]) as BillingInterval[]) {
      if (mapForMode[plan][interval] === priceId) {
        return { planId: plan, interval };
      }
    }
  }
  return null;
};
