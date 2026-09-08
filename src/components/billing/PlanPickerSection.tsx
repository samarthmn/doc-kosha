"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, SpinnerGap } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { BillingIntervalToggle } from "@/components/billing/BillingIntervalToggle";
import { PlanCard } from "@/components/billing/PlanCard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/lib/toast";
import { trackLinkedInWorkspacePlanSelection } from "@/lib/analytics/linkedin";
import { trackProductEvent } from "@/lib/analytics/productEvents";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { mapWorkspaceSubscriptionRow } from "@/modules/billing/subscriptionMapper";
import { hasEntitlementNow } from "@/modules/billing/entitlements";
import {
  type DisplayPrices,
  getSharedDiscountPercent,
} from "@/modules/billing/displayPrices";
import {
  BillingInterval,
  PlanId,
  WorkspaceSubscriptionLike,
  isPaidPlanId,
} from "@/modules/billing/types";
import {
  getPriceViewModel,
  PriceViewModel,
} from "@/modules/billing/priceHelpers";
import { Tables } from "@/types/generated/supabase";
import { OnboardingStepHeader } from "@/components/onboarding/OnboardingStepHeader";
import {
  buildLandingAttributionProperties,
  type LandingAttribution,
} from "@/lib/analytics/landingAttribution";

type PlanPickerContext = "onboarding" | "settings";

interface PlanPickerSectionProps {
  workspaceId: string;
  workspaceName?: string | null;
  redirectPath: string;
  context: PlanPickerContext;
  subscription?: WorkspaceSubscriptionLike | null;
  attribution?: LandingAttribution;
  onTrialStarted?: () => void;
  onBack?: () => void;
  className?: string;
}

const PLAN_ORDER: PlanId[] = ["free", "essential", "plus", "max"];
const PAID_PLAN_ORDER: PlanId[] = ["essential", "plus", "max"];
const FREE_PLAN_ID: PlanId = "free";

const trackOnboardingPlanSelectionSignal = (
  context: PlanPickerContext,
): void => {
  if (context !== "onboarding") return;
  trackLinkedInWorkspacePlanSelection();
};

const getPlanRank = (planId: PlanId | null): number | null => {
  if (!planId) return null;
  const idx = PLAN_ORDER.indexOf(planId);
  return idx >= 0 ? idx : null;
};

const getPriceModel = (
  prices: DisplayPrices | null,
  planId: PlanId,
  interval: BillingInterval,
): PriceViewModel => {
  if (planId === "free") {
    return {
      amount: "$0",
      currency: "USD",
      interval: "/mo",
    };
  }

  if (!isPaidPlanId(planId)) {
    return {
      amount: "—",
      currency: "",
      interval: "/mo",
    };
  }

  const price = prices?.[planId]?.[interval];
  if (!price?.unitAmount) {
    return {
      amount: "—",
      currency: "",
      // Plans are displayed as a monthly equivalent (even for annual billing).
      interval: "/mo",
    };
  }
  return getPriceViewModel(price, interval);
};

export const PlanPickerSection: React.FC<PlanPickerSectionProps> = ({
  workspaceId,
  workspaceName: _workspaceName,
  redirectPath,
  context,
  subscription,
  attribution,
  onTrialStarted,
  onBack,
  className,
}) => {
  const router = useRouter();
  const currentWorkspaceSubscription = useGlobalStore(
    (s) => s.currentWorkspaceSubscription,
  );
  const setCurrentWorkspaceSubscription = useGlobalStore(
    (s) => s.setCurrentWorkspaceSubscription,
  );
  const setCheckoutPending = useGlobalStore((s) => s.setCheckoutPending);

  const activeSubscription = subscription ?? currentWorkspaceSubscription;
  const currentPlanId = activeSubscription?.planId ?? null;
  const currentBillingInterval = activeSubscription?.billingInterval ?? null;
  const isEntitled = useMemo(
    () => hasEntitlementNow(activeSubscription),
    [activeSubscription],
  );

  const [billingInterval, setBillingInterval] = useState<BillingInterval>(
    currentBillingInterval ?? "month",
  );
  const [planPrices, setPlanPrices] = useState<DisplayPrices | null>(null);
  const [isLoadingPrices, setIsLoadingPrices] = useState(true);
  const [savingPlanId, setSavingPlanId] = useState<PlanId | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (currentBillingInterval) {
      setBillingInterval(currentBillingInterval);
    }
  }, [currentBillingInterval]);

  useEffect(() => {
    let active = true;
    const fetchPrices = async () => {
      setIsLoadingPrices(true);
      try {
        const res = await fetch("/api/billing/prices");
        if (!res.ok) {
          throw new Error("Failed to load plan pricing.");
        }
        const payload = (await res.json()) as { prices?: DisplayPrices };
        if (active) {
          setPlanPrices(payload.prices ?? null);
        }
      } catch (err) {
        console.warn("[plan-picker] failed to load prices", err);
        if (active) {
          setErrorMessage("Unable to load pricing right now. Please refresh.");
        }
      } finally {
        if (active) {
          setIsLoadingPrices(false);
        }
      }
    };

    void fetchPrices();
    return () => {
      active = false;
    };
  }, []);

  const startTrialWithoutCheckout = async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/settings/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          planId: "essential",
          billingInterval,
          startTrial: true,
        }),
      });
      const payload = (await res.json().catch(() => null)) as {
        subscription?: Tables<"workspace_subscriptions"> | null;
        error?: string;
      } | null;

      if (!res.ok) {
        const message =
          payload?.error ||
          "Unable to start your trial. Please try again in a moment.";
        setErrorMessage(message);
        showError(message);
        return false;
      }

      const nextSubscription = mapWorkspaceSubscriptionRow(
        payload?.subscription ?? null,
      );
      if (nextSubscription) {
        setCurrentWorkspaceSubscription(nextSubscription);
      }

      const trialMessage = "Your 14-day free trial is now active.";
      setSuccessMessage(trialMessage);
      showSuccess(trialMessage);
      trackOnboardingPlanSelectionSignal(context);
      trackProductEvent("trial_started", {
        workspace_id: workspaceId,
        plan_id: "essential",
        billing_interval: billingInterval,
        context,
        ...buildLandingAttributionProperties(attribution ?? {}),
      });

      if (context === "onboarding") {
        router.replace(redirectPath);
      } else {
        onTrialStarted?.();
      }
      return true;
    } catch (err) {
      console.error("[plan-picker] failed to start trial", err);
      const message = "Unable to start your trial. Please try again.";
      setErrorMessage(message);
      showError(message);
      return false;
    }
  };

  const startFreePlan = async (): Promise<boolean> => {
    if (isEntitled) {
      const message =
        "This workspace already has active access. Manage billing from the subscription page.";
      setErrorMessage(message);
      showError(message);
      return false;
    }

    try {
      const res = await fetch("/api/settings/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          planId: "free",
          billingInterval: "month",
          startTrial: false,
        }),
      });
      const payload = (await res.json().catch(() => null)) as {
        subscription?: Tables<"workspace_subscriptions"> | null;
        error?: string;
      } | null;

      if (!res.ok) {
        const message =
          payload?.error ||
          "Unable to start the Free plan. Please try again in a moment.";
        setErrorMessage(message);
        showError(message);
        return false;
      }

      const nextSubscription = mapWorkspaceSubscriptionRow(
        payload?.subscription ?? null,
      );
      if (nextSubscription) {
        setCurrentWorkspaceSubscription(nextSubscription);
      }

      const message = "Your Free workspace is ready.";
      setSuccessMessage(message);
      showSuccess(message);
      trackProductEvent("free_plan_started", {
        workspace_id: workspaceId,
        plan_id: "free",
        billing_interval: "month",
        context,
        ...buildLandingAttributionProperties(attribution ?? {}),
      });

      if (context === "onboarding") {
        router.replace(redirectPath);
      } else {
        onTrialStarted?.();
      }
      return true;
    } catch (err) {
      console.error("[plan-picker] failed to start free plan", err);
      const message = "Unable to start the Free plan. Please try again.";
      setErrorMessage(message);
      showError(message);
      return false;
    }
  };

  const startCheckoutSession = async (planId: PlanId): Promise<void> => {
    if (!isPaidPlanId(planId)) {
      await startFreePlan();
      return;
    }

    setCheckoutPending(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          planId,
          billingInterval,
          startTrial: false,
          returnPath: redirectPath,
        }),
        signal: controller.signal,
      });

      const payload = (await res.json().catch(() => null)) as {
        url?: string;
        error?: string;
        message?: string;
        subscriptionRestored?: boolean;
        subscriptionUpdated?: boolean;
        subscription?: Tables<"workspace_subscriptions"> | null;
      } | null;

      if (!res.ok) {
        setCheckoutPending(false);
        const message =
          payload?.error ||
          "Unable to start checkout. Please try again in a moment.";
        setErrorMessage(message);
        showError(message);
        return;
      }

      if (payload?.subscriptionRestored || payload?.subscriptionUpdated) {
        const nextSubscription = mapWorkspaceSubscriptionRow(
          payload.subscription ?? null,
        );
        if (nextSubscription) {
          setCurrentWorkspaceSubscription(nextSubscription);
        }
        const message =
          payload.message ?? "Your existing subscription was restored.";
        setSuccessMessage(message);
        showSuccess(message);
        trackOnboardingPlanSelectionSignal(context);
        setCheckoutPending(false);
        if (context === "onboarding") {
          router.replace(redirectPath);
        } else {
          onTrialStarted?.();
        }
        return;
      }

      if (!payload?.url) {
        setCheckoutPending(false);
        const message =
          payload?.error ||
          "Unable to start checkout. Please try again in a moment.";
        setErrorMessage(message);
        showError(message);
        return;
      }

      trackOnboardingPlanSelectionSignal(context);
      trackProductEvent("checkout_started", {
        workspace_id: workspaceId,
        plan_id: planId,
        billing_interval: billingInterval,
        context,
        ...buildLandingAttributionProperties(attribution ?? {}),
      });
      window.location.href = payload.url;
    } catch (err) {
      setCheckoutPending(false);
      const isAbort =
        typeof err === "object" &&
        err !== null &&
        "name" in err &&
        (err as { name?: string }).name === "AbortError";
      const message = isAbort
        ? "Checkout is taking longer than expected. Please try again."
        : "Unable to start checkout. Please try again in a moment.";
      setErrorMessage(message);
      showError(message);
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const handlePlanSelection = async (
    planId: PlanId,
    startTrial: boolean,
  ): Promise<void> => {
    if (!workspaceId || savingPlanId) return;

    setSavingPlanId(planId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (startTrial) {
        await startTrialWithoutCheckout();
        return;
      }
      if (planId === "free") {
        await startFreePlan();
        return;
      }
      await startCheckoutSession(planId);
    } finally {
      setSavingPlanId(null);
    }
  };

  const renderPlanCard = (
    planId: PlanId,
    layout: "standard" | "wide" = "standard",
  ): React.ReactElement => {
    const isSamePlan = planId === currentPlanId;
    const currentRank = getPlanRank(currentPlanId);
    const targetRank = getPlanRank(planId);
    const changeDirection =
      currentRank === null || targetRank === null || isSamePlan
        ? null
        : targetRank < currentRank
          ? "downgrade"
          : "upgrade";
    const isCurrent =
      Boolean(isSamePlan) &&
      Boolean(currentBillingInterval) &&
      billingInterval === currentBillingInterval;
    const disabledReason =
      planId === "free" && isEntitled && currentPlanId !== "free"
        ? "Available after paid access ends"
        : null;

    return (
      <PlanCard
        key={planId}
        planId={planId}
        billingInterval={billingInterval}
        priceModel={getPriceModel(planPrices, planId, billingInterval)}
        layout={layout}
        isSamePlan={isSamePlan}
        isCurrent={isCurrent}
        isEntitled={isEntitled}
        changeDirection={changeDirection}
        isLoading={savingPlanId === planId}
        disabledReason={disabledReason}
        onSelect={handlePlanSelection}
      />
    );
  };

  const isSettingsContext = context === "settings";

  return (
    <div
      className={cn(isSettingsContext ? "space-y-5" : "space-y-8", className)}
    >
      {context === "onboarding" ? (
        <OnboardingStepHeader
          title="Choose your plan"
          description="Select the perfect plan to get started."
          leading={
            onBack ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-muted-foreground hover:text-foreground"
                onClick={onBack}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </Button>
            ) : null
          }
          trailing={
            <BillingIntervalToggle
              interval={billingInterval}
              onChange={setBillingInterval}
              monthlyDiscountPercent={
                planPrices
                  ? getSharedDiscountPercent(planPrices, "month")
                  : undefined
              }
              annualDiscountPercent={
                planPrices
                  ? getSharedDiscountPercent(planPrices, "year")
                  : undefined
              }
            />
          }
        />
      ) : (
        <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="dk-nocturne-kicker">Available plans</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Compare billing intervals and workspace limits.
            </p>
          </div>
          <BillingIntervalToggle
            interval={billingInterval}
            onChange={setBillingInterval}
            monthlyDiscountPercent={
              planPrices
                ? getSharedDiscountPercent(planPrices, "month")
                : undefined
            }
            annualDiscountPercent={
              planPrices
                ? getSharedDiscountPercent(planPrices, "year")
                : undefined
            }
          />
        </div>
      )}

      {isLoadingPrices ? (
        <div className={cn(isSettingsContext ? "space-y-4" : "space-y-6")}>
          <div
            className={cn(
              "grid md:grid-cols-3",
              isSettingsContext ? "gap-4 xl:gap-5" : "gap-6",
            )}
          >
            {PAID_PLAN_ORDER.map((planId) => (
              <Skeleton
                key={planId}
                className={cn(
                  isSettingsContext ? "h-[460px]" : "h-[500px]",
                  "rounded-lg",
                )}
              />
            ))}
          </div>
          <Skeleton className="h-[260px] rounded-lg" />
        </div>
      ) : (
        <div className={cn(isSettingsContext ? "space-y-4" : "space-y-6")}>
          <div
            className={cn(
              "grid md:grid-cols-3",
              isSettingsContext ? "gap-4 xl:gap-5" : "gap-6",
            )}
          >
            {PAID_PLAN_ORDER.map((planId) => renderPlanCard(planId))}
          </div>
          {renderPlanCard(FREE_PLAN_ID, "wide")}
        </div>
      )}

      {savingPlanId ? (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <SpinnerGap className="h-4 w-4 animate-spin" aria-hidden="true" />
          Updating your plan selection…
        </div>
      ) : null}

      {errorMessage ? (
        <div
          className="mx-auto max-w-md rounded border border-destructive/30 bg-destructive/5 px-4 py-3 text-center text-sm text-destructive"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div
          className="mx-auto max-w-md rounded border border-primary/25 bg-primary/[0.05] px-4 py-3 text-center text-sm text-primary"
          role="status"
        >
          {successMessage}
        </div>
      ) : null}
    </div>
  );
};
