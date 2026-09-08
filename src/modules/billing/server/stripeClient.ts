import Stripe from "stripe";

import { serverEnv } from "@/lib/env";
import { StripeMode, getStripeMode } from "../stripePriceIds";

const STRIPE_API_VERSION = "2025-11-17.clover" as Stripe.LatestApiVersion;

let stripeSingleton: Stripe | null = null;

type StripeConfig = {
  stripe: Stripe;
  mode: StripeMode;
  webhookSecret?: string | null;
};

export const getStripeConfig = (): StripeConfig => {
  const secretKey = serverEnv.STRIPE_SECRET_KEY;
  const mode = getStripeMode(serverEnv.STRIPE_MODE);
  const webhookSecret = serverEnv.STRIPE_WEBHOOK_SECRET;

  if (!secretKey) {
    throw new Error("Stripe secret key is not configured");
  }

  if (!stripeSingleton) {
    stripeSingleton = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
  }

  return {
    stripe: stripeSingleton,
    mode,
    webhookSecret,
  };
};

export const requireWebhookSecret = (): string => {
  const { webhookSecret } = getStripeConfig();
  if (!webhookSecret) {
    throw new Error("Stripe webhook secret is not configured");
  }
  return webhookSecret;
};
