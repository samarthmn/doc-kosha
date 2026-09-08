import Stripe from "stripe";

import { getStripeConfig } from "./stripeClient";
import {
  buildWorkspaceSubscriptionPayload,
  findWorkspaceIdByCustomerId,
  upsertWorkspaceSubscription,
} from "./subscriptionSync";
import {
  persistTrialMetadataToCustomer,
  markCustomerHadSubscription,
  TRIAL_DURATION_DAYS,
} from "./trialEligibility";
import { StripeMode } from "../stripePriceIds";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { addDays } from "date-fns";
import { PlanId } from "../types";
import { PLAN_CATALOG } from "../plans";
import { clientEnv } from "@/lib/env";
import {
  getPlanRank,
  sendPaymentFailedLifecycleEmail,
  sendPlanDowngradedLifecycleEmail,
} from "@/modules/lifecycle-email/server";
import { claimEmailDelivery, sendClaimedEmail } from "@/server/emailDeliveries";
import { buildSubscriptionActivatedEmail } from "@/server/emails/templates";
import { processLogger } from "@/server/processLogger";

const resolveWorkspaceId = async (
  subscription: Stripe.Subscription,
): Promise<string | null> => {
  const metaWorkspace = subscription.metadata?.workspace_id;
  if (metaWorkspace) return metaWorkspace;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;
  if (customerId) {
    return findWorkspaceIdByCustomerId(customerId);
  }
  return null;
};

type WorkspaceSummary = {
  id: string;
  name: string | null;
  created_by: string;
};

const getWorkspaceSummary = async (
  workspaceId: string,
): Promise<WorkspaceSummary | null> => {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin
    .from("workspaces")
    .select("id, name, created_by")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
};

/**
 * Extract customer ID from a subscription.
 */
const getCustomerId = (subscription: Stripe.Subscription): string | null => {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : (subscription.customer?.id ?? null);
};

/**
 * Persist trial and subscription markers to Stripe customer metadata.
 * This ensures trial eligibility survives DB resets.
 */
const persistBillingMetadataToCustomer = async (
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<void> => {
  const customerId = getCustomerId(subscription);
  if (!customerId) return;

  // Mark that this customer has had a subscription (best-effort; helper logs on failure)
  await markCustomerHadSubscription(stripe, customerId);

  // If subscription has trial info, persist it. If this fails, we treat it as a hard
  // failure to avoid allowing trial abuse when DB state is wiped.
  if (subscription.trial_start) {
    const trialStartUnix = subscription.trial_start;
    // Use trial_end if available, otherwise calculate from trial_start
    const trialEndUnix =
      subscription.trial_end ??
      Math.floor(
        addDays(
          new Date(trialStartUnix * 1000),
          TRIAL_DURATION_DAYS,
        ).getTime() / 1000,
      );

    const persisted = await persistTrialMetadataToCustomer(
      stripe,
      customerId,
      trialStartUnix,
      trialEndUnix,
    );

    if (!persisted) {
      console.error("[stripe-webhook] failed to persist trial metadata", {
        customerId,
        subscriptionId: subscription.id,
      });
      throw new Error("Failed to persist trial metadata to Stripe customer");
    }
  }
};

const formatPlanLabel = (
  planId: PlanId,
  interval: "month" | "year",
): string => {
  const planName = PLAN_CATALOG[planId]?.name ?? "DocKosha";
  const intervalLabel = interval === "year" ? "Annual" : "Monthly";
  return `${planName} (${intervalLabel})`;
};

const maybeSendSubscriptionActivatedEmail = async (args: {
  workspaceId: string;
  workspaceName: string;
  ownerUserId: string;
  planId: PlanId;
  billingInterval: "month" | "year";
  providerSubscriptionId: string | null;
}): Promise<void> => {
  const admin = createSupabaseServiceClient();
  const {
    data: { user },
    error: userError,
  } = await admin.auth.admin.getUserById(args.ownerUserId);

  if (userError || !user?.email) {
    return;
  }

  const claim = await claimEmailDelivery({
    template: "subscription-activated",
    toEmail: user.email,
    userId: args.ownerUserId,
    workspaceId: args.workspaceId,
    dedupeKey: `subscription-activated:${args.workspaceId}:${args.providerSubscriptionId ?? "none"}:${args.planId}:${args.billingInterval}`,
  });

  if (!claim.claimed) {
    return;
  }

  const email = buildSubscriptionActivatedEmail({
    workspaceName: args.workspaceName,
    planLabel: formatPlanLabel(args.planId, args.billingInterval),
    settingsUrl: `${clientEnv.NEXT_PUBLIC_APP_URL}/settings?tab=subscription`,
  });

  try {
    await sendClaimedEmail({
      id: claim.id,
      claimToken: claim.token,
      toEmail: user.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  } catch (error) {
    processLogger.error(
      "[stripe-webhook] failed to send subscription-activated email",
      {
        workspaceId: args.workspaceId,
        userId: args.ownerUserId,
        deliveryId: claim.id,
        error,
      },
    );
  }
};

const handleSubscriptionLike = async (
  subscription: Stripe.Subscription,
  mode: StripeMode,
  stripe: Stripe,
) => {
  // Always persist billing metadata to customer (even if workspace doesn't exist)
  // This ensures trial tracking survives workspace deletion
  await persistBillingMetadataToCustomer(stripe, subscription);

  const workspaceId = await resolveWorkspaceId(subscription);
  if (!workspaceId) {
    console.warn(
      "[stripe-webhook] missing workspace_id for subscription",
      subscription.id,
    );
    return;
  }

  const workspace = await getWorkspaceSummary(workspaceId);
  if (!workspace) {
    console.info(
      "[stripe-webhook] workspace no longer exists, skipping subscription upsert",
      { workspaceId, subscriptionId: subscription.id },
    );
    return;
  }

  const admin = createSupabaseServiceClient();
  const { data: previousSubscription } = await admin
    .from("workspace_subscriptions")
    .select("status, plan_id, billing_interval, provider_subscription_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const payload = buildWorkspaceSubscriptionPayload(
    workspaceId,
    subscription,
    mode,
  );
  await upsertWorkspaceSubscription(payload);

  if (
    payload.status === "active" &&
    previousSubscription?.status !== "active" &&
    payload.plan_id &&
    payload.billing_interval
  ) {
    await maybeSendSubscriptionActivatedEmail({
      workspaceId,
      workspaceName: workspace.name ?? "Workspace",
      ownerUserId: workspace.created_by,
      planId: payload.plan_id as PlanId,
      billingInterval: payload.billing_interval as "month" | "year",
      providerSubscriptionId: payload.provider_subscription_id ?? null,
    });
  }

  if (
    previousSubscription?.plan_id &&
    payload.plan_id &&
    getPlanRank(previousSubscription.plan_id) > getPlanRank(payload.plan_id)
  ) {
    await sendPlanDowngradedLifecycleEmail({
      workspaceId,
      previousPlanLabel: formatPlanLabel(
        previousSubscription.plan_id as PlanId,
        (previousSubscription.billing_interval ?? "month") as "month" | "year",
      ),
      nextPlanLabel: formatPlanLabel(
        payload.plan_id as PlanId,
        (payload.billing_interval ?? "month") as "month" | "year",
      ),
      providerSubscriptionId:
        payload.provider_subscription_id ??
        previousSubscription.provider_subscription_id ??
        null,
      dedupeSuffix: payload.updated_at ?? new Date().toISOString(),
    });
  }
};

export const processStripeWebhookEvent = async (event: Stripe.Event) => {
  const { stripe, mode } = getStripeConfig();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription) {
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
        const subscription = await stripe.subscriptions.retrieve(subId);
        await handleSubscriptionLike(subscription, mode, stripe);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionLike(subscription, mode, stripe);
      break;
    }
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = (invoice as unknown as { subscription?: string })
        .subscription;
      if (subscriptionId) {
        const subscription =
          await stripe.subscriptions.retrieve(subscriptionId);
        const workspaceId = await resolveWorkspaceId(subscription);
        await handleSubscriptionLike(subscription, mode, stripe);
        if (event.type === "invoice.payment_failed" && workspaceId) {
          await sendPaymentFailedLifecycleEmail({
            workspaceId,
            invoiceId: invoice.id,
          });
        }
      }
      break;
    }
    default:
      // ignore other events
      break;
  }
};
