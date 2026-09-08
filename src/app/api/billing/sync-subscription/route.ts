import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { getStripeConfig } from "@/modules/billing/server/stripeClient";
import {
  buildWorkspaceSubscriptionPayload,
  fetchWorkspaceSubscription,
  getOrCreateStripeCustomerForWorkspace,
  upsertWorkspaceSubscription,
} from "@/modules/billing/server/subscriptionSync";
import { getActiveOrTrialingSubscription } from "@/modules/billing/server/trialEligibility";
import Stripe from "stripe";

const RequestSchema = z.object({
  workspaceId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { workspaceId } = parsed.data;

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

    const { stripe, mode } = getStripeConfig();

    // Prefer the subscription ID we already know for this workspace.
    const existing = await fetchWorkspaceSubscription(workspaceId);

    let subscription: Stripe.Subscription | null = null;

    if (existing?.provider_subscription_id) {
      try {
        subscription = await stripe.subscriptions.retrieve(
          existing.provider_subscription_id,
        );
      } catch (stripeErr: unknown) {
        // Subscription may have been deleted in Stripe; fall back to customer lookup
        console.warn(
          "[billing/sync-subscription] Stale subscription ID, attempting customer lookup",
          stripeErr,
        );
      }
    }

    if (!subscription) {
      if (!user.email) {
        throw new Error("User email is required for billing sync");
      }
      const customerId = await getOrCreateStripeCustomerForWorkspace(
        workspaceId,
        stripe,
        null,
        user.email,
      );
      subscription = await getActiveOrTrialingSubscription(stripe, customerId);
    }

    if (!subscription) {
      return NextResponse.json(
        { error: "No active Stripe subscription found" },
        { status: 404 },
      );
    }

    const payload = buildWorkspaceSubscriptionPayload(
      workspaceId,
      subscription,
      mode,
    );
    const upserted = await upsertWorkspaceSubscription(payload);

    return NextResponse.json({ subscription: upserted });
  } catch (err) {
    console.error("[billing/sync-subscription] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
