import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";

import { clientEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { getStripeConfig } from "@/modules/billing/server/stripeClient";
import {
  getOrCreateStripeCustomerForWorkspace,
  buildWorkspaceSubscriptionPayload,
  upsertWorkspaceSubscription,
} from "@/modules/billing/server/subscriptionSync";
import { updateStripeSubscriptionPlan } from "@/modules/billing/server/planChange";
import {
  resolveTrialEligibility,
  getActiveOrTrialingSubscription,
} from "@/modules/billing/server/trialEligibility";
import { ensureSubscriptionUpdatePortalConfiguration } from "@/modules/billing/server/portalConfig";
import { shouldRetryCheckoutWithoutAutomaticTax } from "@/modules/billing/server/automaticTax";
import {
  buildStripeCheckoutDiscount,
  listActiveBillingOffers,
  resolveBillingOffer,
} from "@/modules/billing/server/offers";
import { DISPLAY_PRICES } from "@/modules/billing/displayPrices";
import { PLAN_CATALOG } from "@/modules/billing/plans";
import { getStripePriceId } from "@/modules/billing/stripePriceIds";
import { BillingInterval, PaidPlanId } from "@/modules/billing/types";
import { sanitizeInternalReturnPath } from "@/lib/internalReturnPath";

const getOfferStripeReference = (offer: {
  stripe_discount_source: "coupon" | "promotion_code";
  stripe_coupon_id: string | null;
  stripe_promotion_code_id: string | null;
}): string | null => {
  if (offer.stripe_discount_source === "coupon") {
    return offer.stripe_coupon_id;
  }

  return offer.stripe_promotion_code_id;
};

const RequestSchema = z.object({
  workspaceId: z.string().uuid(),
  planId: z.enum(["essential", "plus", "max"]),
  billingInterval: z.enum(["month", "year"]),
  startTrial: z.boolean().optional(),
  returnPath: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { workspaceId, planId, billingInterval, startTrial, returnPath } =
      parsed.data;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!user.email) {
      return NextResponse.json(
        { error: "User email is required for billing" },
        { status: 400 },
      );
    }

    const { data: workspaceOwner, error: workspaceOwnerError } = await supabase
      .from("workspaces")
      .select("created_by")
      .eq("id", workspaceId)
      .maybeSingle();

    if (
      workspaceOwnerError ||
      !workspaceOwner ||
      workspaceOwner.created_by !== user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { stripe, mode } = getStripeConfig();
    const resolvedPlanId = planId as PaidPlanId;
    const resolvedInterval = billingInterval as BillingInterval;
    const priceId = getStripePriceId(resolvedPlanId, resolvedInterval, mode);
    const safeReturnPath =
      sanitizeInternalReturnPath(returnPath) ?? "/settings?tab=subscription";

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", workspaceId)
      .maybeSingle();

    const customerId = await getOrCreateStripeCustomerForWorkspace(
      workspaceId,
      stripe,
      workspace?.name,
      user.email,
    );

    // Check for existing active/trialing subscription to prevent double-billing
    const existingSubscription = await getActiveOrTrialingSubscription(
      stripe,
      customerId,
    );

    if (existingSubscription) {
      // If they already have an active subscription, sync it to this workspace
      // instead of creating a duplicate
      const subscriptionId = existingSubscription.id;

      let payload: ReturnType<typeof buildWorkspaceSubscriptionPayload>;
      try {
        payload = buildWorkspaceSubscriptionPayload(
          workspaceId,
          existingSubscription,
          mode,
        );
      } catch (err) {
        console.error(
          "[billing/checkout] failed to build payload for existing subscription",
          { customerId, subscriptionId, workspaceId, err },
        );
        return NextResponse.json(
          {
            subscriptionRestored: false,
            error:
              "We found an existing subscription, but couldn't restore it to this workspace. Please try again.",
            customerId,
            subscriptionId,
          },
          { status: 502 },
        );
      }

      // Verify the existing subscription matches the requested plan/interval.
      // If it doesn't, don't silently restore the old plan.
      if (
        payload.plan_id !== resolvedPlanId ||
        payload.billing_interval !== resolvedInterval
      ) {
        if (existingSubscription.status === "active") {
          try {
            const updatedSubscription = await updateStripeSubscriptionPlan({
              stripe,
              subscription: existingSubscription,
              workspaceId,
              planId: resolvedPlanId,
              billingInterval: resolvedInterval,
              mode,
            });

            const updatedPayload = buildWorkspaceSubscriptionPayload(
              workspaceId,
              updatedSubscription,
              mode,
            );
            const updatedRecord =
              await upsertWorkspaceSubscription(updatedPayload);

            if (!updatedRecord) {
              console.error(
                "[billing/checkout] upsert returned null for updated subscription",
                { customerId, subscriptionId, workspaceId },
              );
              throw new Error("Upsert returned null");
            }

            return NextResponse.json({
              subscriptionUpdated: true,
              message:
                resolvedInterval === "year"
                  ? "Your subscription has been updated and annual pricing has been applied."
                  : "Your subscription has been updated.",
              subscription: updatedRecord,
              customerId,
              subscriptionId,
            });
          } catch (err) {
            console.warn(
              "[billing/checkout] direct subscription update failed, falling back to portal",
              {
                customerId,
                subscriptionId,
                workspaceId,
                planId: resolvedPlanId,
                billingInterval: resolvedInterval,
                err,
              },
            );
          }
        }

        // Ensure the subscription is attributed to the requested workspace going forward.
        // This makes sure subsequent updates/webhooks sync to the correct workspace.
        try {
          const existingMeta = existingSubscription.metadata ?? {};
          if (existingMeta.workspace_id !== workspaceId) {
            await stripe.subscriptions.update(subscriptionId, {
              metadata: {
                ...existingMeta,
                workspace_id: workspaceId,
              },
            });
          }
        } catch (err) {
          console.warn(
            "[billing/checkout] failed to update subscription metadata before plan change redirect",
            { customerId, subscriptionId, workspaceId, err },
          );
        }

        // Redirect the user into Stripe to change the existing subscription plan.
        // Stripe Checkout cannot update an existing subscription, so we deep-link
        // the Customer Portal into a subscription update confirmation flow.
        // This behaves like a "checkout" for upgrades (shows proration, collects payment if needed, handles SCA).
        const portalReturnUrl = new URL(
          safeReturnPath,
          clientEnv.NEXT_PUBLIC_APP_URL,
        );
        portalReturnUrl.searchParams.set("billing_portal_return", "1");
        portalReturnUrl.searchParams.set("expected_plan_id", resolvedPlanId);
        portalReturnUrl.searchParams.set(
          "expected_billing_interval",
          resolvedInterval,
        );

        // After completion, redirect back to the plan page so we can sync and
        // immediately reflect the updated subscription in the UI.
        const portalAfterCompletionUrl = new URL(
          safeReturnPath,
          clientEnv.NEXT_PUBLIC_APP_URL,
        );
        portalAfterCompletionUrl.searchParams.set(
          "billing_portal_success",
          "1",
        );
        portalAfterCompletionUrl.searchParams.set(
          "expected_plan_id",
          resolvedPlanId,
        );
        portalAfterCompletionUrl.searchParams.set(
          "expected_billing_interval",
          resolvedInterval,
        );

        const portalConfigurationId =
          await ensureSubscriptionUpdatePortalConfiguration(stripe, mode);

        // Stripe's subscription_update_confirm flow requires exactly one item and the item id.
        // If the subscription has multiple items or is missing the item id, fall back to
        // the generic subscription_update flow (lets user pick from portal-configured options).
        const subscriptionItems = existingSubscription.items?.data ?? [];
        const firstItem = subscriptionItems[0];
        const canUseUpdateConfirmFlow =
          subscriptionItems.length === 1 && Boolean(firstItem?.id);

        let portalSession: Stripe.BillingPortal.Session;
        const portalSessionBase: Stripe.BillingPortal.SessionCreateParams = {
          customer: customerId,
          return_url: portalReturnUrl.toString(),
          ...(portalConfigurationId
            ? { configuration: portalConfigurationId }
            : {}),
        };

        if (canUseUpdateConfirmFlow) {
          // Use the direct confirmation flow (pre-selects the new plan, shows proration)
          portalSession = await stripe.billingPortal.sessions.create({
            ...portalSessionBase,
            flow_data: {
              type: "subscription_update_confirm",
              after_completion: {
                type: "redirect",
                redirect: { return_url: portalAfterCompletionUrl.toString() },
              },
              subscription_update_confirm: {
                subscription: subscriptionId,
                items: [{ id: firstItem.id, price: priceId, quantity: 1 }],
              },
            },
          } as Stripe.BillingPortal.SessionCreateParams);
        } else {
          // Fall back to generic subscription_update flow (user picks plan in portal)
          console.warn(
            "[billing/checkout] subscription has multiple items or missing item id, using subscription_update flow",
            {
              customerId,
              subscriptionId,
              itemCount: subscriptionItems.length,
              hasItemId: Boolean(firstItem?.id),
            },
          );
          portalSession = await stripe.billingPortal.sessions.create({
            ...portalSessionBase,
            flow_data: {
              type: "subscription_update",
              after_completion: {
                type: "redirect",
                redirect: { return_url: portalAfterCompletionUrl.toString() },
              },
              subscription_update: {
                subscription: subscriptionId,
              },
            },
          } as Stripe.BillingPortal.SessionCreateParams);
        }

        if (!portalSession.url) {
          return NextResponse.json(
            {
              subscriptionRestored: false,
              planMismatch: true,
              error:
                "An active subscription already exists for this email, but we couldn't open the billing portal to change plans. Please try again.",
              customerId,
              subscriptionId,
              existing: {
                planId: payload.plan_id,
                billingInterval: payload.billing_interval,
              },
              requested: {
                planId: resolvedPlanId,
                billingInterval: resolvedInterval,
              },
              action: "billing_portal",
            },
            { status: 500 },
          );
        }

        return NextResponse.json({
          url: portalSession.url,
          subscriptionRestored: false,
          subscriptionUpdated: false,
          planMismatch: true,
          message:
            "You already have an active subscription for this email. Continue to Stripe to confirm your plan change.",
          customerId,
          subscriptionId,
          existing: {
            planId: payload.plan_id,
            billingInterval: payload.billing_interval,
          },
          requested: {
            planId: resolvedPlanId,
            billingInterval: resolvedInterval,
          },
          action: "subscription_update_confirm",
        });
      }

      console.info(
        "[billing/checkout] found existing subscription, syncing to workspace",
        {
          customerId,
          subscriptionId,
          workspaceId,
          planId: payload.plan_id,
          billingInterval: payload.billing_interval,
        },
      );

      let restored = null as Awaited<
        ReturnType<typeof upsertWorkspaceSubscription>
      > | null;
      try {
        restored = await upsertWorkspaceSubscription(payload);
      } catch (err) {
        console.error(
          "[billing/checkout] failed to upsert restored subscription",
          {
            customerId,
            subscriptionId,
            workspaceId,
            err,
          },
        );
        return NextResponse.json(
          {
            subscriptionRestored: false,
            error:
              "We found an existing subscription, but couldn't restore it to this workspace. Please try again.",
            customerId,
            subscriptionId,
          },
          { status: 500 },
        );
      }

      if (!restored) {
        console.error(
          "[billing/checkout] upsert returned null for restored subscription",
          { customerId, subscriptionId, workspaceId },
        );
        return NextResponse.json(
          {
            subscriptionRestored: false,
            error:
              "We found an existing subscription, but couldn't restore it to this workspace. Please try again.",
            customerId,
            subscriptionId,
          },
          { status: 500 },
        );
      }

      return NextResponse.json({
        subscriptionRestored: true,
        message:
          "Your existing subscription has been restored to this workspace.",
        subscription: restored,
        customerId,
        subscriptionId,
      });
    }

    const activeOffer = resolveBillingOffer({
      offers: await listActiveBillingOffers(mode),
      planId: resolvedPlanId,
      billingInterval: resolvedInterval,
    });

    const metadata = {
      workspace_id: workspaceId,
      plan_id: planId,
      billing_interval: billingInterval,
      price_id: priceId,
      ...(activeOffer ? { billing_offer_id: activeOffer.id } : {}),
    };

    // Determine trial eligibility
    const wantsTrial = planId === "essential" && Boolean(startTrial);
    let trialEndUnix: number | undefined;

    if (wantsTrial) {
      const eligibility = await resolveTrialEligibility(stripe, customerId);

      if (!eligibility.eligible) {
        const errorMessages: Record<typeof eligibility.reason, string> = {
          trial_expired:
            "Your free trial has already been used. Please select a paid plan to continue.",
          had_subscription:
            "You've previously had a subscription with this email. Free trials are only available for new accounts.",
          no_email:
            "Unable to verify trial eligibility. Please ensure your account has a valid email.",
        };

        return NextResponse.json(
          {
            error: errorMessages[eligibility.reason],
            trialIneligible: true,
            reason: eligibility.reason,
          },
          { status: 409 },
        );
      }

      trialEndUnix = eligibility.trialEndUnix;
      console.info("[billing/checkout] trial eligibility resolved", {
        customerId,
        trialEndUnix,
        isResume: eligibility.isResume,
      });
    }

    const displayPrice = DISPLAY_PRICES[resolvedPlanId][resolvedInterval];
    const discountPercent = displayPrice.discount ?? 0;
    const useAnnualDiscount =
      resolvedInterval === "year" && discountPercent > 0;
    const annualDiscountMessage = useAnnualDiscount
      ? `Annual billing already includes ${discountPercent}% off compared to monthly billing.`
      : null;

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
      useAnnualDiscount
        ? [
            {
              price_data: {
                ...(await (async () => {
                  const basePrice = await stripe.prices.retrieve(priceId);
                  const productId =
                    typeof basePrice.product === "string"
                      ? basePrice.product
                      : basePrice.product?.id;

                  return {
                    currency: displayPrice.currency,
                    unit_amount: Math.round(
                      displayPrice.unitAmount * (1 - discountPercent / 100),
                    ),
                    recurring: { interval: "year" as const },
                    ...(basePrice.tax_behavior &&
                    basePrice.tax_behavior !== "unspecified"
                      ? { tax_behavior: basePrice.tax_behavior }
                      : {}),
                    ...(productId
                      ? { product: productId }
                      : {
                          product_data: {
                            name: PLAN_CATALOG[resolvedPlanId].name,
                          },
                        }),
                  };
                })()),
              },
              quantity: 1,
            },
          ]
        : [{ price: priceId, quantity: 1 }];

    // Validate origin against whitelist - never trust client headers for redirects
    const requestOrigin = req.headers.get("origin");
    const allowedOrigins = [
      clientEnv.NEXT_PUBLIC_APP_URL,
      // Add other allowed origins if needed (e.g., preview deployments)
    ].filter(Boolean);

    const origin =
      requestOrigin && allowedOrigins.includes(requestOrigin)
        ? requestOrigin
        : clientEnv.NEXT_PUBLIC_APP_URL;

    // Important: Stripe only substitutes the checkout session placeholder when it
    // appears literally as `{CHECKOUT_SESSION_ID}` in the URL. Using URLSearchParams
    // would percent-encode braces (`%7B...%7D`) and Stripe won't replace it.
    const successBaseUrl = new URL("/dashboard", origin);
    const successParams = new URLSearchParams();
    successParams.set("billing_success", "1");
    // Used client-side to wait for the exact plan/interval before redirecting.
    successParams.set("expected_plan_id", resolvedPlanId);
    successParams.set("expected_billing_interval", resolvedInterval);
    successParams.set("redirect", safeReturnPath);
    const successUrl = `${successBaseUrl.toString()}?session_id={CHECKOUT_SESSION_ID}&${successParams.toString()}`;

    const cancelUrl = new URL("/billing/checkout/canceled", origin);
    cancelUrl.searchParams.set("state", "cancelled");

    // Build subscription_data with trial_end (exact timestamp) instead of trial_period_days
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData =
      {
        metadata,
      };

    if (trialEndUnix) {
      subscriptionData.trial_end = trialEndUnix;
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      customer: customerId,
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
      automatic_tax: {
        enabled: true,
      },
      billing_address_collection: "auto",
      custom_text: annualDiscountMessage
        ? {
            submit: {
              message: annualDiscountMessage,
            },
          }
        : undefined,
      customer_update: {
        address: "auto",
        name: "auto",
      },
      discounts: activeOffer
        ? [buildStripeCheckoutDiscount(activeOffer)]
        : undefined,
      subscription_data: subscriptionData,
      metadata,
      line_items: lineItems,
      payment_method_collection: trialEndUnix ? "if_required" : undefined,
      tax_id_collection: {
        enabled: true,
      },
      ...(!activeOffer ? { allow_promotion_codes: true } : {}),
    };

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(sessionParams);
    } catch (err) {
      const shouldRetryWithoutAutomaticTax =
        await shouldRetryCheckoutWithoutAutomaticTax(err, async () => {
          return await stripe.tax.settings.retrieve();
        });

      if (shouldRetryWithoutAutomaticTax) {
        console.warn(
          "[billing/checkout] automatic tax unavailable; retrying without automatic tax",
          { workspaceId, customerId, planId: resolvedPlanId, billingInterval },
        );
        session = await stripe.checkout.sessions.create({
          ...sessionParams,
          automatic_tax: undefined,
        });
      } else if (
        activeOffer &&
        err instanceof Stripe.errors.StripeInvalidRequestError &&
        err.code === "resource_missing"
      ) {
        const configuredId = getOfferStripeReference(activeOffer);

        console.error(
          "[billing/checkout] active billing offer references missing Stripe discount",
          {
            offerId: activeOffer.id,
            offerName: activeOffer.name,
            mode,
            source: activeOffer.stripe_discount_source,
            configuredId,
          },
        );
        return NextResponse.json(
          {
            error:
              "The current promotion could not be applied. Please try again or contact support.",
            offerInvalid: true,
            billingOfferId: activeOffer.id,
          },
          { status: 400 },
        );
      } else {
        throw err;
      }
    }

    if (!session.url) {
      return NextResponse.json(
        { error: "Failed to create checkout session" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing/checkout] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
