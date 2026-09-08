import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import {
  getStripeConfig,
  requireWebhookSecret,
} from "@/modules/billing/server/stripeClient";
import { processStripeWebhookEvent } from "@/modules/billing/server/webhook";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = Buffer.from(await req.arrayBuffer());

  // Signature/config failures are non-retryable request rejections (400).
  let event: Stripe.Event;
  try {
    const { stripe } = getStripeConfig();
    const secret = requireWebhookSecret();
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    console.error("[stripe/webhook] signature verification error", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Processing failures are server faults (500) so Stripe retries them
  // and they do not show up in the dashboard as signature errors.
  try {
    await processStripeWebhookEvent(event);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe/webhook] processing error", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
