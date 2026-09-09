import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { fadeIn } from "@/lib/motion";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { PLAN_CATALOG } from "@/modules/billing/plans";
import {
  BillingInterval,
  PlanId,
  WorkspaceSubscriptionLike,
} from "@/modules/billing/types";
import {
  getPlanLimitLabels,
  hasEntitlementNow,
} from "@/modules/billing/entitlements";
import { UsageStats } from "@/components/billing/UsageStats";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";
import { Skeleton } from "@/components/ui/skeleton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { mapWorkspaceSubscriptionRow } from "@/modules/billing/subscriptionMapper";
import { resolveSubscriptionReturnPath } from "@/modules/billing/subscriptionAccess";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { loadDocumentVersioningSettings } from "@/modules/document-versioning/client";
import { showError, showSuccess } from "@/lib/toast";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { PlanPickerSection } from "@/components/billing/PlanPickerSection";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tables } from "@/types/generated/supabase";
import { CreditCard, Receipt, SealCheck } from "@phosphor-icons/react";

type UsageResponse = {
  documentsCount: number;
  storageUsedBytes: number;
  dataRoomsCount: number;
  bandwidthUsedBytes: number;
};

const DEFAULT_USAGE: UsageResponse = {
  documentsCount: 0,
  storageUsedBytes: 0,
  dataRoomsCount: 0,
  bandwidthUsedBytes: 0,
};

const DEFAULT_SETTINGS_RETURN_PATH = "/settings?tab=subscription";

const DocumentVersioningSettings = React.lazy(loadDocumentVersioningSettings);

const RetentionSettingsSkeleton: React.FC = () => (
  <SettingsSection
    kicker="Retention policy"
    title="Document Versioning"
    description="Configure how many previous versions to retain per document."
  >
    <div className="dk-nocturne-surface space-y-3 rounded-lg bg-card/45 p-4 sm:p-5">
      <Skeleton className="h-5 w-48 rounded" />
      <Skeleton className="h-10 w-32 rounded" />
      <Skeleton className="h-4 w-full max-w-md rounded" />
    </div>
  </SettingsSection>
);

const SubscriptionUsage: React.FC = () => {
  const currentWorkspaceId = useGlobalStore((s) => s.currentWorkspaceId);
  const workspaces = useGlobalStore((s) => s.workspaces);
  const currentWorkspaceSubscription = useGlobalStore(
    (s) => s.currentWorkspaceSubscription,
  );
  const setCurrentWorkspaceSubscription = useGlobalStore(
    (s) => s.setCurrentWorkspaceSubscription,
  );

  const [hydratedSubscription, setHydratedSubscription] =
    useState<WorkspaceSubscriptionLike | null>(
      currentWorkspaceSubscription ?? null,
    );
  const [usage, setUsage] = useState<UsageResponse>(DEFAULT_USAGE);
  const [isLoadingUsage, setIsLoadingUsage] = useState(true);
  const [usageError, setUsageError] = useState(false);
  const [isOpeningInvoices, setIsOpeningInvoices] = useState(false);
  const [isPlanPickerOpen, setIsPlanPickerOpen] = useState(false);
  const [isFinalizingPortalReturn, setIsFinalizingPortalReturn] =
    useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? "";
  const subscriptionReturnPath = resolveSubscriptionReturnPath(
    searchParams?.get("redirect"),
  );

  const activeWorkspaceId = currentWorkspaceId ?? workspaces[0]?.id ?? null;

  const { role: workspaceRole, isLoading: isWorkspaceRoleLoading } =
    useWorkspaceRole(activeWorkspaceId);
  const canManageBilling = workspaceRole === "owner";

  const currentWorkspace = useMemo(() => {
    if (!currentWorkspaceId) {
      return workspaces[0] ?? null;
    }
    return (
      workspaces.find((workspace) => workspace.id === currentWorkspaceId) ??
      null
    );
  }, [currentWorkspaceId, workspaces]);

  const subscription = hydratedSubscription ?? currentWorkspaceSubscription;
  const currentPlanId: PlanId = subscription?.planId ?? "free";
  const planDefinition = PLAN_CATALOG[currentPlanId];
  const limitLabels = getPlanLimitLabels(currentPlanId);
  const billingIntervalLabel =
    subscription?.billingInterval === "year"
      ? "Billed annually"
      : "Billed monthly";
  const hasStripeSubscription =
    Boolean(subscription?.providerSubscriptionId) &&
    subscription?.provider === "stripe";
  const isEntitled = hasEntitlementNow(subscription);

  const renewalLabel = useMemo(() => {
    if (!subscription) return "No renewal scheduled";
    if (subscription.trialEndsAt) {
      const trialEndsAt = new Date(subscription.trialEndsAt);
      if (!Number.isFinite(trialEndsAt.getTime())) {
        return "Trial period information unavailable";
      }
      const formattedDate = trialEndsAt.toLocaleDateString();
      if (trialEndsAt.getTime() <= Date.now()) {
        return `Trial ended ${formattedDate}`;
      }
      return `Trial ends ${formattedDate}`;
    }
    if (subscription.currentPeriodEndsAt) {
      return `Renews ${new Date(
        subscription.currentPeriodEndsAt,
      ).toLocaleDateString()}`;
    }
    return "Renews automatically each billing cycle";
  }, [subscription]);

  const canOpenInvoices =
    subscription?.provider === "stripe" &&
    Boolean(
      subscription?.providerCustomerId || subscription?.providerSubscriptionId,
    );
  const isLikelyPaidStripeWorkspace =
    subscription?.provider === "stripe" &&
    (subscription.status === "active" || subscription.status === "past_due");
  const viewInvoicesDisabled =
    !activeWorkspaceId ||
    !(canOpenInvoices || isLikelyPaidStripeWorkspace) ||
    isOpeningInvoices;

  const shouldAutoOpenPlanPicker = searchParams?.get("planPicker") === "1";

  useEffect(() => {
    setHydratedSubscription(currentWorkspaceSubscription ?? null);
  }, [currentWorkspaceSubscription]);

  useEffect(() => {
    const fetchSubscription = async () => {
      if (!activeWorkspaceId) return;
      try {
        const { data, error } = await supabase
          .from("workspace_subscriptions")
          .select("*")
          .eq("workspace_id", activeWorkspaceId)
          .maybeSingle();
        if (error || !data) return;
        const mapped = mapWorkspaceSubscriptionRow(data);
        setHydratedSubscription(mapped);
      } catch (err) {
        console.warn("[settings] failed to refresh subscription info", err);
      }
    };
    void fetchSubscription();
  }, [activeWorkspaceId, supabase]);

  const fetchUsage = useCallback(async () => {
    if (!activeWorkspaceId) {
      setIsLoadingUsage(false);
      return;
    }
    setIsLoadingUsage(true);
    setUsageError(false);
    try {
      const res = await fetch("/api/settings/subscription-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: activeWorkspaceId }),
      });
      if (!res.ok) {
        console.error("Failed to load usage", res.status);
        setUsageError(true);
        return;
      }
      const payload = (await res.json()) as UsageResponse;
      setUsage(payload);
    } catch (err) {
      console.error("Failed to load usage", err);
      setUsageError(true);
    } finally {
      setIsLoadingUsage(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    void fetchUsage();
  }, [fetchUsage]);

  useEffect(() => {
    if (!shouldAutoOpenPlanPicker || !canManageBilling) return;
    setIsPlanPickerOpen(true);
  }, [canManageBilling, shouldAutoOpenPlanPicker]);

  useEffect(() => {
    let cancelled = false;

    const portalSuccess = searchParams?.get("billing_portal_success") === "1";
    const portalReturn = searchParams?.get("billing_portal_return") === "1";
    if (!portalSuccess && !portalReturn) return;
    if (!activeWorkspaceId) return;

    const expectedPlanRaw = searchParams?.get("expected_plan_id");
    const expectedBillingIntervalRaw = searchParams?.get(
      "expected_billing_interval",
    );

    const expectedPlanId: PlanId | null =
      expectedPlanRaw === "essential" ||
      expectedPlanRaw === "plus" ||
      expectedPlanRaw === "max"
        ? expectedPlanRaw
        : null;

    const expectedBillingInterval: BillingInterval | null =
      expectedBillingIntervalRaw === "month" ||
      expectedBillingIntervalRaw === "year"
        ? expectedBillingIntervalRaw
        : null;

    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
      });

    const matchesExpected = (
      next: WorkspaceSubscriptionLike | null,
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

    const syncOnce = async (): Promise<WorkspaceSubscriptionLike | null> => {
      try {
        const res = await fetch("/api/billing/sync-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: activeWorkspaceId }),
        });
        const payload = (await res.json().catch(() => null)) as {
          subscription?: Tables<"workspace_subscriptions"> | null;
          error?: string;
        } | null;

        if (!res.ok) {
          throw new Error(
            payload?.error ||
              "Unable to sync subscription. Please refresh and try again.",
          );
        }

        const mapped = mapWorkspaceSubscriptionRow(
          payload?.subscription ?? null,
        );
        if (mapped) {
          setHydratedSubscription(mapped);
          setCurrentWorkspaceSubscription(mapped);
        }
        return mapped;
      } catch (err) {
        console.warn("[settings] failed to sync subscription", err);
        return null;
      }
    };

    const run = async () => {
      setIsFinalizingPortalReturn(true);
      let synced = false;

      for (let attempt = 0; attempt < 8; attempt += 1) {
        if (cancelled) return;
        const next = await syncOnce();
        if (next && matchesExpected(next)) {
          synced = true;
          break;
        }
        await delay(1200);
      }

      if (cancelled) return;

      if (synced) {
        showSuccess("Billing update confirmed.");
      } else {
        showError(
          "We could not confirm the billing update yet. Please refresh in a few seconds.",
        );
      }

      const nextParams = new URLSearchParams(searchParams?.toString() ?? "");
      nextParams.delete("billing_portal_success");
      nextParams.delete("billing_portal_return");
      nextParams.delete("expected_plan_id");
      nextParams.delete("expected_billing_interval");
      const nextQuery = nextParams.toString();
      if (pathname) {
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
      }
      setIsFinalizingPortalReturn(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    activeWorkspaceId,
    pathname,
    router,
    searchParams,
    searchParamsString,
    setCurrentWorkspaceSubscription,
  ]);

  const handlePlanPickerOpenChange = (open: boolean): void => {
    setIsPlanPickerOpen(open);
    if (open || !shouldAutoOpenPlanPicker || !pathname) return;

    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("planPicker");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  const handleCancelAtPeriodEnd = async (): Promise<void> => {
    if (!activeWorkspaceId) {
      showError("Workspace context missing. Please refresh and try again.");
      return;
    }
    if (!hasStripeSubscription || isCancelling) return;

    setIsCancelling(true);
    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: activeWorkspaceId }),
      });
      const payload = (await res.json().catch(() => null)) as {
        subscription?: Tables<"workspace_subscriptions"> | null;
        error?: string;
      } | null;

      if (!res.ok) {
        const message =
          payload?.error || "Unable to cancel your plan right now.";
        showError(message);
        return;
      }

      const mapped = mapWorkspaceSubscriptionRow(payload?.subscription ?? null);
      if (mapped) {
        setHydratedSubscription(mapped);
        setCurrentWorkspaceSubscription(mapped);
      }

      const endDate = mapped?.currentPeriodEndsAt
        ? new Date(mapped.currentPeriodEndsAt).toLocaleDateString()
        : null;
      showSuccess(
        endDate
          ? `Cancellation scheduled. Access stays active until ${endDate}.`
          : "Cancellation scheduled for the end of your billing period.",
      );
      setIsCancelDialogOpen(false);
    } catch (err) {
      console.error("[settings] failed to cancel subscription", err);
      showError("Unable to cancel plan. Please try again.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleViewInvoices = async (): Promise<void> => {
    if (!canManageBilling) return;
    if (!activeWorkspaceId) {
      showError("Workspace context missing. Please refresh and try again.");
      return;
    }
    if (!canOpenInvoices && !isLikelyPaidStripeWorkspace) return;
    if (isOpeningInvoices) return;

    const escapeHtml = (value: string) =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

    setIsOpeningInvoices(true);
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setIsOpeningInvoices(false);
      showError(
        "Pop-up blocked. Please allow pop-ups for DocKosha to view invoices.",
      );
      return;
    }

    try {
      popup.opener = null;
    } catch {
      // best-effort only
    }

    try {
      popup.document.open();
      popup.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Opening invoices…</title>
    <style>
      :root { color-scheme: light dark; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; margin: 0; padding: 48px 16px; }
      .wrap { max-width: 560px; margin: 0 auto; }
      .card { border: 1px solid rgba(128,128,128,.25); border-radius: 16px; padding: 20px; }
      .title { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
      .desc { opacity: .8; margin: 0; line-height: 1.4; }
      .spinner { width: 18px; height: 18px; border-radius: 999px; border: 2px solid rgba(128,128,128,.35); border-top-color: rgba(128,128,128,.9); display: inline-block; animation: spin .9s linear infinite; vertical-align: -3px; margin-right: 10px; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .row { display: flex; align-items: center; gap: 10px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="row">
          <span class="spinner" aria-hidden="true"></span>
          <h1 class="title">Opening invoices…</h1>
        </div>
        <p class="desc">Redirecting you to Stripe Billing Portal to view and download invoices.</p>
      </div>
    </div>
  </body>
</html>`);
      popup.document.close();
    } catch {
      // best-effort only
    }

    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: activeWorkspaceId,
          returnPath: DEFAULT_SETTINGS_RETURN_PATH,
        }),
      });
      const payload = (await res.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;

      if (!res.ok || !payload?.url) {
        const message =
          payload?.error ??
          "Unable to open invoices right now. Please try again in a moment.";
        showError(message);
        try {
          popup.document.body.innerHTML = `<div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding: 32px 16px;"><div style="max-width: 560px; margin: 0 auto;"><h1 style="font-size:18px; margin:0 0 8px;">Unable to open invoices</h1><p style="opacity:.8; margin:0 0 12px; line-height:1.4;">${escapeHtml(message)}</p><p style="opacity:.8; margin:0;">Return to <a href="/settings?tab=subscription">Settings</a> and try again.</p></div></div>`;
        } catch {
          // best-effort only
        }
        return;
      }

      popup.location.replace(payload.url);
    } catch (err) {
      console.error("[settings] failed to open invoices", err);
      showError("Unable to open invoices right now. Please try again.");
      try {
        popup.document.body.innerHTML = `<div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding: 32px 16px;"><div style="max-width: 560px; margin: 0 auto;"><h1 style="font-size:18px; margin:0 0 8px;">Unable to open invoices</h1><p style="opacity:.8; margin:0 0 12px; line-height:1.4;">Please try again in a moment.</p><p style="opacity:.8; margin:0;">Return to <a href="/settings?tab=subscription">Settings</a> and try again.</p></div></div>`;
      } catch {
        // best-effort only
      }
    } finally {
      setIsOpeningInvoices(false);
    }
  };

  return (
    <>
      <SettingsSection
        kicker="Workspace billing"
        title="Subscription & Usage"
        description="Monitor your workspace storage usage."
      >
        {isFinalizingPortalReturn ? (
          <div className="flex items-center gap-2 rounded border border-primary/20 bg-primary/[0.04] px-4 py-2 text-sm text-muted-foreground">
            <SealCheck size={16} className="text-primary" aria-hidden="true" />
            Confirming billing updates…
          </div>
        ) : null}

        <div className="dk-nocturne-surface overflow-hidden rounded-lg bg-card/45">
          <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded border border-primary/20 bg-primary/[0.06] text-primary">
                <CreditCard size={17} aria-hidden="true" />
              </span>
              <div>
                <p className="dk-nocturne-kicker">Billing status</p>
                <p className="text-sm text-muted-foreground">
                  Current subscription and renewal details
                </p>
              </div>
            </div>
            {isWorkspaceRoleLoading ? (
              <Skeleton className="h-9 w-28" />
            ) : canManageBilling ? (
              <Button
                variant="secondary"
                onClick={() => setIsPlanPickerOpen(true)}
                disabled={!activeWorkspaceId}
              >
                Manage plan
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Only workspace owners can manage billing.
              </p>
            )}
          </div>
          <div className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-xs tracking-wide text-muted-foreground uppercase">
                  Current plan
                </p>
                <p className="text-2xl font-medium tracking-tight">
                  {planDefinition.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {billingIntervalLabel} · Status:{" "}
                  {(subscription?.status || "not_active")
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase())}
                </p>
                <div className="text-xs text-muted-foreground">
                  {renewalLabel}
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                {canManageBilling ? (
                  <Button
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={() => setIsPlanPickerOpen(true)}
                    disabled={!activeWorkspaceId}
                  >
                    Change plan
                  </Button>
                ) : null}

                {hasStripeSubscription && canManageBilling ? (
                  <AlertDialog
                    open={isCancelDialogOpen}
                    onOpenChange={setIsCancelDialogOpen}
                  >
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="w-full sm:w-auto">
                        Cancel at period end
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Cancel subscription?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This schedules cancellation at the end of your current
                          billing period. You will keep access until then.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isCancelling}>
                          Keep plan
                        </AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          disabled={isCancelling}
                          onClick={() => void handleCancelAtPeriodEnd()}
                        >
                          {isCancelling
                            ? "Scheduling…"
                            : "Cancel at period end"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="rounded-full border border-border/60 bg-muted/25 px-3 py-1 text-foreground/80">
                Storage: {limitLabels.storage}
              </span>
              <span
                className={`rounded-full px-3 py-1 ${
                  isEntitled
                    ? "border border-primary/25 bg-primary/[0.06] text-primary"
                    : "border border-destructive/25 bg-destructive/[0.05] text-destructive"
                }`}
              >
                {isEntitled ? "Access active" : "Access paused"}
              </span>
            </div>
          </div>
        </div>

        {canManageBilling ? (
          <div className="dk-nocturne-surface overflow-hidden rounded-lg bg-card/45">
            <div className="flex items-start gap-3 border-b border-border/60 px-4 py-4 sm:px-5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded border border-primary/20 bg-primary/[0.06] text-primary">
                <Receipt size={17} aria-hidden="true" />
              </span>
              <div>
                <p className="dk-nocturne-kicker">Billing records</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Stripe-hosted invoice history
                </p>
              </div>
            </div>
            <div className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-medium">Invoices</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    View and download invoices from Stripe.
                  </p>
                  {!canOpenInvoices && !isLikelyPaidStripeWorkspace ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Invoices are available after upgrading to a paid plan.
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="secondary"
                  className="w-full sm:w-auto"
                  disabled={viewInvoicesDisabled}
                  onClick={() => void handleViewInvoices()}
                >
                  {isOpeningInvoices ? "Opening…" : "View invoices"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <Dialog
          open={isPlanPickerOpen}
          onOpenChange={handlePlanPickerOpenChange}
        >
          <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0">
            <DialogHeader className="mb-0 shrink-0 border-b border-border/70 px-6 py-4">
              <DialogTitle>Manage Plan</DialogTitle>
              <DialogDescription>
                Switch plans and billing interval without leaving settings.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">
              {activeWorkspaceId ? (
                <PlanPickerSection
                  workspaceId={activeWorkspaceId}
                  workspaceName={currentWorkspace?.name ?? null}
                  redirectPath={subscriptionReturnPath}
                  context="settings"
                  subscription={subscription}
                  onTrialStarted={() => {
                    setIsPlanPickerOpen(false);
                    router.replace(subscriptionReturnPath);
                  }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Workspace context missing. Refresh and try again.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </SettingsSection>

      <SettingsSection kicker="Resource meter" title="Usage Overview">
        <div className="dk-nocturne-surface rounded-lg bg-card/45 p-4 sm:p-5">
          {isLoadingUsage ? (
            <div className="space-y-3">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </div>
          ) : usageError ? (
            <InlineError
              title="Unable to load usage"
              description="We couldn't load your workspace usage. Please try again."
              onRetry={() => void fetchUsage()}
            />
          ) : (
            <motion.div {...fadeIn}>
              <UsageStats currentPlanId={currentPlanId} usage={usage} />
            </motion.div>
          )}
        </div>
      </SettingsSection>

      <React.Suspense fallback={<RetentionSettingsSkeleton />}>
        <DocumentVersioningSettings />
      </React.Suspense>

      <SettingsSection
        kicker="Capabilities"
        title="Document processing"
        description="DocYantra 0.0.26 supports PDF merge, watermarking, CSV/Office/Markdown conversion, page counting, redaction, and health checks within its validated envelope."
      >
        <p className="text-sm text-muted-foreground">
          The full comparison lives in the{" "}
          <a
            className="underline underline-offset-4"
            href="https://docs.dockosha.com/docs/reference/capability-matrix"
            target="_blank"
            rel="noreferrer"
          >
            capability matrix
          </a>
          .
        </p>
      </SettingsSection>
    </>
  );
};

export default SubscriptionUsage;
