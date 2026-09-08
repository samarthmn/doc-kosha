import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type Stripe from "stripe";

import { clientEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { ensureBillingManagementPortalConfiguration as ensureBillingManagementPortalConfigurationMaybe } from "@/modules/billing/server/portalConfig";
import { getStripeConfig } from "@/modules/billing/server/stripeClient";
import { fetchWorkspaceSubscription } from "@/modules/billing/server/subscriptionSync";
import { StripeMode } from "@/modules/billing/stripePriceIds";
import { sanitizeInternalReturnPath } from "@/lib/internalReturnPath";

const PORTAL_CONFIG_METADATA_KEY = "dockosha_portal_config";
const BILLING_MANAGEMENT_METADATA_VALUE = "billing_management";

const RequestSchema = z.object({
  workspaceId: z.string().uuid(),
  returnPath: z.string().optional(),
});

const sanitizeReturnPath = (raw?: string | null): string => {
  return sanitizeInternalReturnPath(raw) ?? "/settings?tab=subscription";
};

const ensureBillingManagementPortalConfigurationSafe = async (
  stripe: Stripe,
  mode: StripeMode,
): Promise<string | null> => {
  if (typeof ensureBillingManagementPortalConfigurationMaybe === "function") {
    return await ensureBillingManagementPortalConfigurationMaybe(stripe, mode);
  }

  // Defensive fallback for Turbopack HMR quirks (new named exports not picked up until restart).
  console.warn(
    "[billing/portal] portalConfig.ensureBillingManagementPortalConfiguration is not a function; falling back to local implementation",
  );

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
    return matching?.id ?? null;
  } catch (err) {
    console.warn(
      "[billing/portal] failed to list Stripe portal configs in fallback",
      {
        err,
        mode,
      },
    );
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
    return configuration.id;
  } catch (err) {
    console.error(
      "[billing/portal] failed to create Stripe portal config in fallback",
      {
        err,
        mode,
      },
    );
    return null;
  }
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { workspaceId, returnPath } = parsed.data;

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
    const existing = await fetchWorkspaceSubscription(workspaceId);
    let customerId = existing?.provider_customer_id ?? null;

    // Best-effort recovery: some legacy subscription rows may be missing provider_customer_id.
    // If we have a subscription ID, resolve the customer from Stripe and persist it.
    if (!customerId && existing?.provider_subscription_id) {
      try {
        const subscription = await stripe.subscriptions.retrieve(
          existing.provider_subscription_id,
        );
        customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : (subscription.customer?.id ?? null);

        if (customerId) {
          const admin = createSupabaseServiceClient();
          const { error } = await admin
            .from("workspace_subscriptions")
            .update({ provider_customer_id: customerId })
            .eq("workspace_id", workspaceId);
          if (error) {
            console.warn(
              "[billing/portal] failed to persist resolved Stripe customer id",
              {
                workspaceId,
                customerId,
                subscriptionId: existing.provider_subscription_id,
                error,
              },
            );
          }
        }
      } catch (err) {
        console.warn(
          "[billing/portal] failed to resolve Stripe customer id from subscription",
          {
            workspaceId,
            subscriptionId: existing.provider_subscription_id,
            err,
          },
        );
      }
    }

    if (!customerId) {
      return NextResponse.json(
        { error: "Stripe customer not found for this workspace." },
        { status: 400 },
      );
    }

    const safeReturnPath = sanitizeReturnPath(returnPath);
    const configurationId =
      await ensureBillingManagementPortalConfigurationSafe(stripe, mode);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${clientEnv.NEXT_PUBLIC_APP_URL}${safeReturnPath}`,
      ...(configurationId ? { configuration: configurationId } : {}),
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Unable to start Stripe billing portal." },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing/portal] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
