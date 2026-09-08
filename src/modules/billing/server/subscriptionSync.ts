import Stripe from "stripe";

import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import type { TablesInsert, TablesUpdate } from "@/types/generated/supabase";
import {
  BillingInterval,
  PaidPlanId,
  PlanId,
  SubscriptionStatus,
} from "../types";
import { StripeMode, getPlanIntervalFromPriceId } from "../stripePriceIds";
import { syncWorkspaceDataRoomLimits } from "../workspaceLimitEnforcer";

const toIso = (unixSeconds?: number | null) =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;

const mapStatus = (
  status: Stripe.Subscription.Status,
  cancelAtPeriodEnd: boolean,
): SubscriptionStatus => {
  if (cancelAtPeriodEnd && status === "active") return "active";
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "past_due";
    default:
      return "none";
  }
};

const resolvePlanAndInterval = (
  subscription: Stripe.Subscription,
  mode: StripeMode,
): { planId: PaidPlanId; interval: BillingInterval } => {
  const firstItem = subscription.items.data[0];
  const priceId = firstItem?.price?.id || subscription.metadata?.price_id;
  const metaPlan = subscription.metadata?.plan_id as PaidPlanId | undefined;
  const metaInterval = subscription.metadata?.billing_interval as
    BillingInterval | undefined;

  if (priceId) {
    const mapped = getPlanIntervalFromPriceId(priceId, mode);
    if (mapped) return mapped;
  }

  if (metaPlan && metaInterval) {
    return { planId: metaPlan, interval: metaInterval };
  }

  throw new Error("Unable to resolve plan/interval from Stripe subscription");
};

export const buildWorkspaceSubscriptionPayload = (
  workspaceId: string,
  subscription: Stripe.Subscription,
  mode: StripeMode,
): TablesInsert<"workspace_subscriptions"> => {
  const { planId, interval } = resolvePlanAndInterval(subscription, mode);

  const trialStartedAt = toIso(subscription.trial_start);
  const trialEndsAt = toIso(subscription.trial_end);
  const nowIso = new Date().toISOString();

  const currentPeriodStart =
    (
      subscription as Stripe.Subscription & {
        current_period_start?: number;
      }
    ).current_period_start ?? null;
  const currentPeriodEnd =
    (
      subscription as Stripe.Subscription & {
        current_period_end?: number;
      }
    ).current_period_end ?? null;

  return {
    workspace_id: workspaceId,
    plan_id: planId,
    billing_interval: interval,
    provider: "stripe",
    provider_customer_id:
      typeof subscription.customer === "string"
        ? subscription.customer
        : (subscription.customer?.id ?? null),
    provider_subscription_id: subscription.id,
    status: mapStatus(subscription.status, subscription.cancel_at_period_end),
    trial_started_at: trialStartedAt,
    trial_ends_at: trialEndsAt,
    trial_used_at: trialStartedAt ?? null,
    current_period_started_at: toIso(currentPeriodStart),
    current_period_ends_at: toIso(currentPeriodEnd),
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    updated_at: nowIso,
  };
};

export const upsertWorkspaceSubscription = async (
  payload:
    | TablesInsert<"workspace_subscriptions">
    | TablesUpdate<"workspace_subscriptions">,
) => {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin
    .from("workspace_subscriptions")
    .upsert(payload as TablesInsert<"workspace_subscriptions">, {
      onConflict: "workspace_id",
    })
    .select("*")
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (data?.workspace_id && data?.plan_id) {
    await syncWorkspaceDataRoomLimits(
      data.workspace_id,
      data.plan_id as PlanId,
    );
  }
  return data;
};

/**
 * Check if a Stripe customer object represents a deleted customer.
 * Stripe returns `{deleted: true, id: '...'}` for deleted customers.
 */
const isDeletedCustomer = (
  customer: Stripe.Customer | Stripe.DeletedCustomer,
): customer is Stripe.DeletedCustomer => {
  return "deleted" in customer && customer.deleted === true;
};

/**
 * Search for an existing Stripe customer by email (case-insensitive).
 * Returns the first matching non-deleted customer, or null if none found.
 */
export const findStripeCustomerByEmail = async (
  stripe: Stripe,
  email: string,
): Promise<Stripe.Customer | null> => {
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail) return null;

  // Stripe search query uses single-quoted values; escape backslashes and quotes
  // to keep the generated query syntactically valid.
  const escapedEmail = normalizedEmail
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  // Stripe search can be eventually consistent right after customer creation.
  // We retry briefly and also fall back to the list API (email filter) to avoid
  // accidentally creating duplicate customers for the same email.
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      // Stripe search is case-insensitive for email
      const result = await stripe.customers.search({
        query: `email:'${escapedEmail}'`,
        limit: 10,
      });

      for (const customer of result.data) {
        if (isDeletedCustomer(customer)) {
          continue;
        }
        const validCustomer = await validateStripeCustomer(stripe, customer.id);
        if (validCustomer) {
          return customer;
        }
      }
    } catch (err) {
      console.warn("[billing] stripe customer search failed", {
        email: normalizedEmail,
        attempt,
        err,
      });
    }

    // Fallback: list API supports a case-sensitive email filter.
    // We store emails normalized (lowercase), so this should be reliable.
    try {
      const listResult = await stripe.customers.list({
        email: normalizedEmail,
        limit: 10,
      });
      for (const customer of listResult.data) {
        if (!isDeletedCustomer(customer)) {
          return customer;
        }
      }
    } catch (err) {
      console.warn("[billing] stripe customer list-by-email failed", {
        email: normalizedEmail,
        attempt,
        err,
      });
    }

    if (attempt < maxAttempts) {
      const backoffMs = 150 * 2 ** (attempt - 1);
      await sleep(backoffMs);
    }
  }

  return null;
};

/**
 * Validate that a Stripe customer ID is still valid (not deleted).
 * Returns the customer object if valid, null otherwise.
 */
const validateStripeCustomer = async (
  stripe: Stripe,
  customerId: string,
): Promise<Stripe.Customer | null> => {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (isDeletedCustomer(customer)) {
      return null;
    }
    return customer;
  } catch {
    // Resource missing or other error means customer is invalid
    return null;
  }
};

export const getOrCreateStripeCustomerForWorkspace = async (
  workspaceId: string,
  stripe: Stripe,
  workspaceName?: string | null,
  customerEmail?: string | null,
): Promise<string> => {
  const admin = createSupabaseServiceClient();
  const normalizedEmail = customerEmail?.toLowerCase().trim() ?? null;

  // 1. Check if we have an existing customer ID in the DB
  const { data: existing } = await admin
    .from("workspace_subscriptions")
    .select("provider_customer_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  // 2. If we have a stored customer ID, validate it's still valid in Stripe
  if (existing?.provider_customer_id) {
    const validCustomer = await validateStripeCustomer(
      stripe,
      existing.provider_customer_id,
    );

    if (validCustomer) {
      // Update customer attributes if needed
      const attributes: Stripe.CustomerUpdateParams = {};
      if (normalizedEmail && validCustomer.email !== normalizedEmail) {
        attributes.email = normalizedEmail;
      }
      if (workspaceName && validCustomer.name !== workspaceName) {
        attributes.name = workspaceName;
      }

      if (Object.keys(attributes).length > 0) {
        try {
          await stripe.customers.update(validCustomer.id, attributes);
        } catch (err) {
          console.warn(
            "[billing] failed to update customer attributes",
            validCustomer.id,
            err,
          );
        }
      }

      return validCustomer.id;
    }

    console.warn(
      "[billing] stored customer ID is invalid/deleted, searching by email",
      { customerId: existing.provider_customer_id, workspaceId },
    );
  }

  // 3. No valid stored customer - search by email to find canonical customer
  if (normalizedEmail) {
    const existingByEmail = await findStripeCustomerByEmail(
      stripe,
      normalizedEmail,
    );

    if (existingByEmail) {
      // Update the workspace metadata on this customer
      try {
        await stripe.customers.update(existingByEmail.id, {
          name: workspaceName ?? existingByEmail.name ?? undefined,
          metadata: {
            ...existingByEmail.metadata,
            workspace_id: workspaceId,
          },
        });
      } catch (err) {
        console.warn(
          "[billing] failed to update existing customer metadata",
          existingByEmail.id,
          err,
        );
      }

      // Persist the customer ID to our DB
      await persistCustomerIdToWorkspace(
        admin,
        workspaceId,
        existingByEmail.id,
      );

      return existingByEmail.id;
    }
  }

  // 4. No existing customer found - create a new one
  console.info("[billing] creating new Stripe customer", {
    email: normalizedEmail,
    workspaceId,
  });

  const customer = await stripe.customers.create({
    name: workspaceName ?? undefined,
    email: normalizedEmail ?? undefined,
    metadata: { workspace_id: workspaceId },
  });

  await persistCustomerIdToWorkspace(admin, workspaceId, customer.id);

  return customer.id;
};

/**
 * Helper to persist the Stripe customer ID to the workspace subscription record.
 */
const persistCustomerIdToWorkspace = async (
  admin: ReturnType<typeof createSupabaseServiceClient>,
  workspaceId: string,
  customerId: string,
): Promise<void> => {
  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  const maxAttempts = 3;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { error } = await admin
      .from("workspace_subscriptions")
      .update({ provider_customer_id: customerId })
      .eq("workspace_id", workspaceId);

    if (!error) {
      return;
    }

    lastError = error;
    console.warn(
      "[billing] failed to update subscription record with customer id",
      { workspaceId, customerId, attempt, error },
    );

    if (attempt < maxAttempts) {
      const backoffMs = 150 * 2 ** (attempt - 1);
      await sleep(backoffMs);
    }
  }

  console.error("[billing] unable to persist customer id after retries", {
    workspaceId,
    customerId,
    err: lastError,
  });

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to persist Stripe customer id to workspace");
};

export const fetchWorkspaceSubscription = async (
  workspaceId: string,
): Promise<TablesInsert<"workspace_subscriptions"> | null> => {
  const admin = createSupabaseServiceClient();
  const { data } = await admin
    .from("workspace_subscriptions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return (data as TablesInsert<"workspace_subscriptions"> | null) ?? null;
};

export const findWorkspaceIdByCustomerId = async (
  customerId: string,
): Promise<string | null> => {
  const admin = createSupabaseServiceClient();
  const { data } = await admin
    .from("workspace_subscriptions")
    .select("workspace_id")
    .eq("provider_customer_id", customerId)
    .maybeSingle();
  return data?.workspace_id ?? null;
};
