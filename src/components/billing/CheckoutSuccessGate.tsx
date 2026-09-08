"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleNotch } from "@phosphor-icons/react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { showInfo } from "@/lib/toast";
import { mapWorkspaceSubscriptionRow } from "@/modules/billing/subscriptionMapper";
import { hasEntitlementNow } from "@/modules/billing/entitlements";
import { BillingInterval, PlanId } from "@/modules/billing/types";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import type { Tables } from "@/types/generated/supabase";
import {
  retryGoogleAdsPurchaseTracking,
  trackGoogleAdsPurchase,
} from "@/lib/analytics/googleAds";
import { GoogleAdsPurchaseConversionSchema } from "@/modules/billing/googleAdsPurchase";
import { z } from "zod";

type CheckoutSuccessGateProps = {
  workspaceId: string;
  redirectPath?: string;
};

const DEFAULT_REDIRECT_PATH = "/dashboard";
const POLL_DELAY_MS = 1500;
const POLL_ATTEMPTS = 12;
const GOOGLE_ADS_RETRY_DELAY_MS = 250;
const GOOGLE_ADS_TRACKING_ATTEMPTS = 10;
const CheckoutSyncResponseSchema = z
  .object({
    googleAdsPurchase: GoogleAdsPurchaseConversionSchema.nullable().optional(),
  })
  .passthrough();

const CheckoutSuccessGate: React.FC<CheckoutSuccessGateProps> = ({
  workspaceId,
  redirectPath = DEFAULT_REDIRECT_PATH,
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<string>(
    "This can take a few seconds. Please don’t close this tab.",
  );
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const setCurrentWorkspaceSubscription = useGlobalStore(
    (s) => s.setCurrentWorkspaceSubscription,
  );

  useEffect(() => {
    let cancelled = false;
    const googleAdsTrackingController = new AbortController();
    const checkoutSessionId = searchParams?.get("session_id") ?? null;
    const expectedPlanRaw = searchParams?.get("expected_plan_id") ?? null;
    const expectedIntervalRaw =
      searchParams?.get("expected_billing_interval") ?? null;

    const expectedPlanId: PlanId | null =
      expectedPlanRaw === "essential" ||
      expectedPlanRaw === "plus" ||
      expectedPlanRaw === "max"
        ? expectedPlanRaw
        : null;

    const expectedBillingInterval: BillingInterval | null =
      expectedIntervalRaw === "month" || expectedIntervalRaw === "year"
        ? expectedIntervalRaw
        : null;

    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
      });

    const matchesExpected = (
      next: ReturnType<typeof mapWorkspaceSubscriptionRow> | null,
    ): boolean => {
      if (!next) return false;
      if (expectedPlanId && next.planId !== expectedPlanId) return false;
      if (
        expectedBillingInterval &&
        next.billingInterval !== expectedBillingInterval
      ) {
        return false;
      }
      return true;
    };

    const refreshSubscription = async (): Promise<boolean> => {
      try {
        const { data, error } = await supabase
          .from("workspace_subscriptions")
          .select("*")
          .eq("workspace_id", workspaceId)
          .maybeSingle();
        if (error || !data) return false;

        const mapped = mapWorkspaceSubscriptionRow(
          data as Tables<"workspace_subscriptions">,
        );
        if (mapped) {
          setCurrentWorkspaceSubscription(mapped);
          if (!hasEntitlementNow(mapped)) return false;
          return expectedPlanId || expectedBillingInterval
            ? matchesExpected(mapped)
            : true;
        }
        return false;
      } catch {
        return false;
      }
    };

    const syncFromCheckoutSession = async (): Promise<void> => {
      if (!checkoutSessionId) return;
      setMessage("Confirming your subscription with Stripe…");
      try {
        const response = await fetch("/api/billing/sync-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, sessionId: checkoutSessionId }),
        });
        if (!response.ok) return;

        const payload = CheckoutSyncResponseSchema.safeParse(
          await response.json().catch(() => null),
        );
        if (payload.success && payload.data.googleAdsPurchase) {
          await retryGoogleAdsPurchaseTracking(payload.data.googleAdsPurchase, {
            signal: googleAdsTrackingController.signal,
            maxAttempts: GOOGLE_ADS_TRACKING_ATTEMPTS,
            retryDelayMs: GOOGLE_ADS_RETRY_DELAY_MS,
            track: trackGoogleAdsPurchase,
          });
        }
      } catch {
        // fall back to polling
      }
    };

    const run = async () => {
      if (!workspaceId) return;

      await syncFromCheckoutSession();
      if (cancelled) return;
      setMessage("Activating your workspace…");

      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        if (cancelled) return;
        const entitled = await refreshSubscription();
        if (entitled) {
          router.replace(redirectPath);
          return;
        }
        await delay(POLL_DELAY_MS);
      }

      if (cancelled) return;
      // Confirmation timed out — tell the user what happened instead of
      // silently dropping them on the plan picker as if payment failed.
      showInfo(
        "Payment received — we're still confirming your subscription with Stripe. This can take a minute; your plan will activate automatically.",
        { autoClose: false },
      );
      const params = new URLSearchParams();
      params.set("tab", "subscription");
      router.replace(`/settings?${params.toString()}`);
    };

    void run();

    return () => {
      cancelled = true;
      googleAdsTrackingController.abort();
    };
  }, [
    redirectPath,
    router,
    searchParams,
    setCurrentWorkspaceSubscription,
    supabase,
    workspaceId,
  ]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <CircleNotch className="h-5 w-5 animate-spin" aria-hidden />
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">
          Finalizing your subscription…
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
};

export default CheckoutSuccessGate;
