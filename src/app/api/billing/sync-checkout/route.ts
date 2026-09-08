import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { getStripeConfig } from "@/modules/billing/server/stripeClient";
import {
  buildWorkspaceSubscriptionPayload,
  upsertWorkspaceSubscription,
} from "@/modules/billing/server/subscriptionSync";
import { buildGoogleAdsPurchaseConversion } from "@/modules/billing/googleAdsPurchase";

const RequestSchema = z.object({
  workspaceId: z.string().uuid(),
  sessionId: z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) =>
        value.startsWith("cs_") && !value.includes("{") && !value.includes("}"),
      { message: "Invalid checkout session id" },
    ),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { workspaceId, sessionId } = parsed.data;

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
    let session: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>>;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription"],
      });
    } catch (err) {
      const isStripeMissing =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "resource_missing";
      if (isStripeMissing) {
        return NextResponse.json(
          { error: "Checkout session not found" },
          { status: 400 },
        );
      }
      throw err;
    }

    const sessionWorkspaceId = session.metadata?.workspace_id ?? null;
    if (sessionWorkspaceId && sessionWorkspaceId !== workspaceId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const subscriptionRef = session.subscription;
    if (!subscriptionRef) {
      return NextResponse.json(
        { error: "Checkout session is missing subscription" },
        { status: 400 },
      );
    }

    const subscription =
      typeof subscriptionRef === "string"
        ? await stripe.subscriptions.retrieve(subscriptionRef)
        : subscriptionRef;

    const subscriptionWorkspaceId = subscription.metadata?.workspace_id ?? null;
    if (
      subscriptionWorkspaceId &&
      subscriptionWorkspaceId !== workspaceId &&
      !sessionWorkspaceId
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload = buildWorkspaceSubscriptionPayload(
      workspaceId,
      subscription,
      mode,
    );
    const upserted = await upsertWorkspaceSubscription(payload);
    const googleAdsPurchase = buildGoogleAdsPurchaseConversion({
      id: session.id,
      mode: session.mode,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
    });

    return NextResponse.json({ subscription: upserted, googleAdsPurchase });
  } catch (err) {
    console.error("[billing/sync-checkout] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
