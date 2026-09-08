import Stripe from "stripe";

import { stripePriceIds, StripeMode } from "../stripePriceIds";

const PORTAL_CONFIG_METADATA_KEY = "dockosha_portal_config";
const PORTAL_CONFIG_METADATA_VALUE = "subscription_update";
const BILLING_MANAGEMENT_METADATA_VALUE = "billing_management";

const getPriceIdsForMode = (mode: StripeMode): string[] => {
  const pricesForMode = stripePriceIds[mode];
  return Object.values(pricesForMode).flatMap((intervalMap) =>
    Object.values(intervalMap),
  );
};

const buildSubscriptionUpdateProducts = async (
  stripe: Stripe,
  priceIds: string[],
): Promise<
  Stripe.BillingPortal.ConfigurationCreateParams.Features.SubscriptionUpdate.Product[]
> => {
  const uniquePriceIds = Array.from(new Set(priceIds)).filter(Boolean);
  const priceResults = await Promise.all(
    uniquePriceIds.map(async (priceId) => {
      try {
        return await stripe.prices.retrieve(priceId);
      } catch (err) {
        console.warn("[billing/portal-config] failed to retrieve price", {
          priceId,
          err,
        });
        return null;
      }
    }),
  );

  const productMap = new Map<string, Set<string>>();
  for (const price of priceResults) {
    if (!price) continue;
    const productId =
      typeof price.product === "string" ? price.product : price.product?.id;
    if (!productId) {
      console.warn("[billing/portal-config] price missing product id", {
        priceId: price.id,
      });
      continue;
    }
    const existing = productMap.get(productId) ?? new Set<string>();
    existing.add(price.id);
    productMap.set(productId, existing);
  }

  return Array.from(productMap.entries()).map(([productId, prices]) => ({
    product: productId,
    prices: Array.from(prices),
  }));
};

export const ensureSubscriptionUpdatePortalConfiguration = async (
  stripe: Stripe,
  mode: StripeMode,
): Promise<string | null> => {
  try {
    const existingConfigs = await stripe.billingPortal.configurations.list({
      active: true,
      limit: 100,
    });
    const matching = existingConfigs.data.find(
      (config) =>
        config.metadata?.[PORTAL_CONFIG_METADATA_KEY] ===
          PORTAL_CONFIG_METADATA_VALUE &&
        config.metadata?.mode === mode &&
        config.features?.subscription_update?.enabled &&
        config.features?.payment_method_update?.enabled,
    );

    if (matching) {
      return matching.id;
    }
  } catch (err) {
    console.warn("[billing/portal-config] failed to list portal configs", {
      err,
    });
  }

  const priceIds = getPriceIdsForMode(mode);
  let products: Stripe.BillingPortal.ConfigurationCreateParams.Features.SubscriptionUpdate.Product[] =
    [];
  try {
    products = await buildSubscriptionUpdateProducts(stripe, priceIds);
  } catch (err) {
    console.warn("[billing/portal-config] failed to build products list", {
      err,
    });
  }

  const subscriptionUpdate: Stripe.BillingPortal.ConfigurationCreateParams.Features.SubscriptionUpdate =
    {
      enabled: true,
      default_allowed_updates: ["price"],
      proration_behavior: "create_prorations",
      ...(products.length > 0 ? { products } : {}),
    };

  try {
    const configuration = await stripe.billingPortal.configurations.create({
      name: `DocKosha Subscription Updates (${mode})`,
      metadata: {
        [PORTAL_CONFIG_METADATA_KEY]: PORTAL_CONFIG_METADATA_VALUE,
        mode,
      },
      features: {
        // Stripe requires payment method updates to be enabled in order to enable
        // subscription updates in the portal.
        payment_method_update: { enabled: true },
        subscription_update: subscriptionUpdate,
      },
    });

    console.info("[billing/portal-config] created subscription update config", {
      configId: configuration.id,
      mode,
    });

    return configuration.id;
  } catch (err) {
    console.error("[billing/portal-config] failed to create portal config", {
      mode,
      err,
    });
    return null;
  }
};

export const ensureBillingManagementPortalConfiguration = async (
  stripe: Stripe,
  mode: StripeMode,
): Promise<string | null> => {
  try {
    const existingConfigs = await stripe.billingPortal.configurations.list({
      active: true,
      limit: 100,
    });
    const matching = existingConfigs.data.find(
      (config) =>
        config.metadata?.[PORTAL_CONFIG_METADATA_KEY] ===
          BILLING_MANAGEMENT_METADATA_VALUE &&
        config.metadata?.mode === mode &&
        config.features?.invoice_history?.enabled &&
        config.features?.payment_method_update?.enabled,
    );

    if (matching) {
      return matching.id;
    }
  } catch (err) {
    console.warn("[billing/portal-config] failed to list portal configs", {
      err,
    });
  }

  try {
    const configuration = await stripe.billingPortal.configurations.create({
      name: `DocKosha Billing Management (${mode})`,
      metadata: {
        [PORTAL_CONFIG_METADATA_KEY]: BILLING_MANAGEMENT_METADATA_VALUE,
        mode,
      },
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
      },
    });

    console.info("[billing/portal-config] created billing management config", {
      configId: configuration.id,
      mode,
    });

    return configuration.id;
  } catch (err) {
    console.error(
      "[billing/portal-config] failed to create billing management config",
      {
        mode,
        err,
      },
    );
    return null;
  }
};
