import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addDays } from "date-fns";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import type { TablesInsert } from "@/types/generated/supabase";
import { syncWorkspaceDataRoomLimits } from "@/modules/billing/workspaceLimitEnforcer";
import { getStripeConfig } from "@/modules/billing/server/stripeClient";
import { getOrCreateStripeCustomerForWorkspace } from "@/modules/billing/server/subscriptionSync";
import {
  persistTrialMetadataToCustomer,
  resolveTrialEligibility,
} from "@/modules/billing/server/trialEligibility";
import { clientEnv } from "@/lib/env";
import { queueTrialLifecycleEmails } from "@/modules/lifecycle-email/server";
import { claimEmailDelivery, sendClaimedEmail } from "@/server/emailDeliveries";
import { buildTrialStartedEmail } from "@/server/emails/templates";
import { PLAN_LIMITS } from "@/modules/billing/plans";

const RequestSchema = z.object({
  workspaceId: z.string().uuid(),
  planId: z.enum(["free", "essential", "plus", "max"]),
  billingInterval: z.enum(["month", "year"]),
  startTrial: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { workspaceId, planId, billingInterval, startTrial } = parsed.data;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("created_by, name")
      .eq("id", workspaceId)
      .maybeSingle();
    if (workspaceError || !workspace || workspace.created_by !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const shouldStartTrial = Boolean(startTrial);

    const { data: entitlement, error: entitlementError } = await supabase.rpc(
      "workspace_has_entitlement",
      { ws: workspaceId },
    );
    if (entitlementError) {
      return NextResponse.json(
        { error: "Failed to verify workspace entitlement" },
        { status: 500 },
      );
    }
    if (entitlement) {
      return NextResponse.json(
        {
          error:
            "This workspace already has active access. Manage billing from the subscription page.",
        },
        { status: 409 },
      );
    }

    const admin = createSupabaseServiceClient();

    if (planId === "free") {
      if (shouldStartTrial) {
        return NextResponse.json(
          { error: "Trials are not available on the Free plan." },
          { status: 400 },
        );
      }

      const freeLimits = PLAN_LIMITS.free;
      const [
        storageResult,
        membersResult,
        activeInvitesResult,
        nonPdfDocumentsResult,
      ] = await Promise.all([
        admin
          .from("workspace_storage_current")
          .select("storage_used_bytes")
          .eq("workspace_id", workspaceId)
          .maybeSingle(),
        admin
          .from("workspace_members")
          .select("user_id", { head: true, count: "exact" })
          .eq("workspace_id", workspaceId),
        admin
          .from("workspace_invites")
          .select("id", { head: true, count: "exact" })
          .eq("workspace_id", workspaceId)
          .is("accepted_at", null)
          .is("revoked_at", null),
        admin
          .from("documents")
          .select("id", { head: true, count: "exact" })
          .eq("workspace_id", workspaceId)
          .neq("file_type", "pdf"),
      ]);

      if (
        storageResult.error ||
        membersResult.error ||
        activeInvitesResult.error ||
        nonPdfDocumentsResult.error
      ) {
        return NextResponse.json(
          { error: "Failed to verify Free plan eligibility" },
          { status: 500 },
        );
      }

      const storageUsedBytes = storageResult.data?.storage_used_bytes ?? 0;
      if (
        freeLimits.maxStorageBytes !== null &&
        storageUsedBytes > freeLimits.maxStorageBytes
      ) {
        return NextResponse.json(
          {
            error:
              "This workspace is over the Free plan storage limit. Delete files or choose a paid plan.",
            code: "FREE_PLAN_STORAGE_LIMIT_EXCEEDED",
          },
          { status: 409 },
        );
      }

      const freeMaxMembers = freeLimits.maxMembers ?? 1;
      if ((membersResult.count ?? 0) > freeMaxMembers) {
        return NextResponse.json(
          {
            error:
              "Free workspaces include one owner. Remove extra members or choose a paid plan.",
            code: "FREE_PLAN_MEMBER_LIMIT_EXCEEDED",
          },
          { status: 409 },
        );
      }

      if ((activeInvitesResult.count ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              "Free workspaces cannot have pending teammate invites. Revoke invites or choose a paid plan.",
            code: "FREE_PLAN_INVITE_LIMIT_EXCEEDED",
          },
          { status: 409 },
        );
      }

      if ((nonPdfDocumentsResult.count ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              "Free workspaces support PDF documents only. Remove non-PDF documents or choose a paid plan.",
            code: "FREE_PLAN_PDF_ONLY",
          },
          { status: 409 },
        );
      }

      const nowIso = new Date().toISOString();
      const payload: TablesInsert<"workspace_subscriptions"> = {
        workspace_id: workspaceId,
        plan_id: "free",
        billing_interval: "month",
        provider: "manual",
        provider_customer_id: null,
        provider_subscription_id: null,
        status: "active",
        trial_started_at: null,
        trial_ends_at: null,
        trial_used_at: null,
        current_period_started_at: nowIso,
        current_period_ends_at: null,
        updated_at: nowIso,
      };

      const { data, error } = await admin
        .from("workspace_subscriptions")
        .upsert(payload, { onConflict: "workspace_id" })
        .select("*")
        .maybeSingle();
      if (error) {
        return NextResponse.json(
          { error: "Failed to update subscription" },
          { status: 500 },
        );
      }

      await syncWorkspaceDataRoomLimits(workspaceId, "free");

      return NextResponse.json({ subscription: data });
    }

    if (!shouldStartTrial) {
      return NextResponse.json(
        {
          error:
            "Manual plan updates are disabled. Please use the Stripe checkout flow to change your subscription.",
        },
        { status: 400 },
      );
    }
    if (planId !== "essential") {
      return NextResponse.json(
        { error: "Trials are only available on the Essential plan." },
        { status: 400 },
      );
    }

    let trialStartedAt = new Date().toISOString();
    let trialEndsAt = addDays(new Date(trialStartedAt), 14).toISOString();
    let providerCustomerId: string | null = null;

    let stripeConfig: ReturnType<typeof getStripeConfig> | null = null;
    try {
      stripeConfig = getStripeConfig();
    } catch (err) {
      console.warn(
        "[subscription] stripe not configured; starting trial without customer metadata sync",
        err,
      );
    }

    if (stripeConfig) {
      const { stripe } = stripeConfig;
      const customerId = await getOrCreateStripeCustomerForWorkspace(
        workspaceId,
        stripe,
        workspace.name,
        user.email,
      );
      providerCustomerId = customerId;

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

      trialStartedAt = new Date(
        eligibility.trialStartUnix * 1000,
      ).toISOString();
      trialEndsAt = new Date(eligibility.trialEndUnix * 1000).toISOString();

      const persisted = await persistTrialMetadataToCustomer(
        stripe,
        customerId,
        eligibility.trialStartUnix,
        eligibility.trialEndUnix,
      );
      if (!persisted) {
        return NextResponse.json(
          {
            error:
              "Unable to start your trial right now. Please try again in a moment.",
          },
          { status: 502 },
        );
      }
    }

    const payload: TablesInsert<"workspace_subscriptions"> = {
      workspace_id: workspaceId,
      plan_id: planId,
      billing_interval: billingInterval,
      provider: "stripe",
      provider_customer_id: providerCustomerId,
      provider_subscription_id: null,
      status: "trialing",
      trial_started_at: trialStartedAt,
      trial_ends_at: trialEndsAt,
      trial_used_at: trialStartedAt,
      current_period_started_at: null,
      current_period_ends_at: null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await admin
      .from("workspace_subscriptions")
      .upsert(payload, { onConflict: "workspace_id" })
      .select("*")
      .maybeSingle();
    if (error) {
      return NextResponse.json(
        { error: "Failed to update subscription" },
        { status: 500 },
      );
    }

    await syncWorkspaceDataRoomLimits(workspaceId, planId);

    try {
      // Queue persistence must finish while this request is alive. The hosted
      // runtime may stop executing bare promises after the response is sent.
      await queueTrialLifecycleEmails({
        workspaceId,
        userId: user.id,
        trialStartedAt,
        trialEndsAt,
      });
    } catch (queueError) {
      // The subscription is already durable at this point. Keep it usable and
      // let the lifecycle worker's due-job backfill repair a missed enqueue.
      console.error("[subscription] failed to queue trial lifecycle emails", {
        workspaceId,
        userId: user.id,
        error: queueError,
      });
    }

    if (user.email) {
      const claim = await claimEmailDelivery({
        template: "trial-started",
        toEmail: user.email,
        userId: user.id,
        workspaceId,
        dedupeKey: `trial-started:${workspaceId}:${trialStartedAt}`,
      });

      if (claim.claimed) {
        const email = buildTrialStartedEmail({
          workspaceName: workspace.name ?? "Workspace",
          trialEndsAt,
          settingsUrl: `${clientEnv.NEXT_PUBLIC_APP_URL}/settings?tab=subscription`,
        });
        // Trial activation should not block on SMTP latency; the delivery row
        // preserves send state for later inspection/retry if mailing fails.
        void sendClaimedEmail({
          id: claim.id,
          claimToken: claim.token,
          toEmail: user.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        })
          .then((sent) => {
            if (!sent) {
              console.warn(
                "[subscription] failed to send trial-started email",
                {
                  workspaceId,
                  userId: user.id,
                  deliveryId: claim.id,
                },
              );
            }
          })
          .catch((error) => {
            console.error("[subscription] trial-started email send rejected", {
              workspaceId,
              userId: user.id,
              deliveryId: claim.id,
              error,
            });
          });
      }
    }

    return NextResponse.json({ subscription: data });
  } catch (err) {
    console.error("[subscription] unexpected error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
