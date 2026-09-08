import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { getStripeConfig } from "@/modules/billing/server/stripeClient";
import {
  buildWorkspaceSubscriptionPayload,
  fetchWorkspaceSubscription,
  upsertWorkspaceSubscription,
} from "@/modules/billing/server/subscriptionSync";
import { updateStripeSubscriptionPlan } from "@/modules/billing/server/planChange";
import { BillingInterval, PaidPlanId } from "@/modules/billing/types";

const BLOCKED_STATUSES: Stripe.Subscription.Status[] = [
  "incomplete",
  "incomplete_expired",
  "canceled",
];

const RequestSchema = z.object({
  workspaceId: z.string().uuid(),
  planId: z.enum(["essential", "plus", "max"]),
  billingInterval: z.enum(["month", "year"]),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { workspaceId, planId, billingInterval } = parsed.data;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("created_by")
      .eq("id", workspaceId)
      .maybeSingle();

    if (workspaceError || !workspace || workspace.created_by !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await fetchWorkspaceSubscription(workspaceId);
    if (!existing?.provider_subscription_id) {
      return NextResponse.json(
        { error: "No active Stripe subscription found" },
        { status: 400 },
      );
    }

    const { stripe, mode } = getStripeConfig();
    const currentSub = await stripe.subscriptions.retrieve(
      existing.provider_subscription_id,
    );
    if (BLOCKED_STATUSES.includes(currentSub.status)) {
      return NextResponse.json(
        {
          error:
            "This subscription can’t be updated because the previous checkout session was never completed. Please start a new checkout.",
          blocked: true,
          blockedAction: "checkout",
        },
        { status: 400 },
      );
    }
    const trialEndMs =
      typeof currentSub.trial_end === "number"
        ? currentSub.trial_end * 1000
        : 0;
    const isTrialing =
      currentSub.status === "trialing" && trialEndMs > Date.now();
    const isPaidPlan = planId === "plus" || planId === "max";
    if (isTrialing && isPaidPlan) {
      return NextResponse.json(
        {
          error:
            "Your trial ends immediately when upgrading to this plan. Continue to checkout to add a payment method and confirm the plan change.",
          blocked: true,
          blockedAction: "checkout",
        },
        { status: 400 },
      );
    }

    let updated: Stripe.Subscription;
    try {
      updated = await updateStripeSubscriptionPlan({
        stripe,
        subscription: currentSub,
        workspaceId,
        planId: planId as PaidPlanId,
        billingInterval: billingInterval as BillingInterval,
        mode,
      });
    } catch (err) {
      if (
        err instanceof Stripe.errors.StripeInvalidRequestError &&
        err.code === "resource_missing"
      ) {
        return NextResponse.json(
          {
            error:
              "Stripe needs a saved payment method before switching billing intervals. Please continue in checkout to add one.",
            blocked: true,
            blockedAction: "portal_or_checkout",
          },
          { status: 400 },
        );
      }
      throw err;
    }

    const payload = buildWorkspaceSubscriptionPayload(
      workspaceId,
      updated,
      mode,
    );
    const upserted = await upsertWorkspaceSubscription(payload);

    return NextResponse.json({ subscription: upserted });
  } catch (err) {
    console.error("[billing/change-plan] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
