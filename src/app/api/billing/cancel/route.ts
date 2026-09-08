import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { getStripeConfig } from "@/modules/billing/server/stripeClient";
import {
  buildWorkspaceSubscriptionPayload,
  fetchWorkspaceSubscription,
  upsertWorkspaceSubscription,
} from "@/modules/billing/server/subscriptionSync";
import { sendSubscriptionCancelledLifecycleEmail } from "@/modules/lifecycle-email/server";

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

    const existing = await fetchWorkspaceSubscription(workspaceId);
    if (!existing?.provider_subscription_id) {
      return NextResponse.json(
        { error: "No active Stripe subscription found" },
        { status: 400 },
      );
    }

    const { stripe, mode } = getStripeConfig();

    const updated = await stripe.subscriptions.update(
      existing.provider_subscription_id,
      {
        cancel_at_period_end: true,
      },
    );

    const payload = buildWorkspaceSubscriptionPayload(
      workspaceId,
      updated,
      mode,
    );
    const upserted = await upsertWorkspaceSubscription(payload);

    void sendSubscriptionCancelledLifecycleEmail({
      workspaceId,
      subscriptionId: updated.id,
      currentPeriodEndsAt: upserted?.current_period_ends_at ?? null,
    }).catch((error) => {
      console.error("[billing/cancel] failed to send cancellation email", {
        workspaceId,
        error,
      });
    });

    return NextResponse.json({ subscription: upserted });
  } catch (err) {
    console.error("[billing/cancel] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
