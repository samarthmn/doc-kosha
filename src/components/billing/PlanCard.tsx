import React from "react";
import { ArrowRight, Check, Sparkle, SpinnerGap } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PLAN_CATALOG } from "@/modules/billing/plans";
import {
  getPlanDescription,
  getPlanLimitLabels,
} from "@/modules/billing/entitlements";
import { BillingInterval, PlanId } from "@/modules/billing/types";
import { PriceViewModel } from "@/modules/billing/priceHelpers";

interface PlanCardProps {
  planId: PlanId;
  billingInterval: BillingInterval;
  priceModel: PriceViewModel;
  layout?: "standard" | "wide";
  isSamePlan: boolean;
  isCurrent: boolean;
  isEntitled: boolean;
  changeDirection?: "upgrade" | "downgrade" | null;
  isLoading?: boolean;
  disabledReason?: string | null;
  onSelect?: (planId: PlanId, startTrial: boolean) => void;
  className?: string;
}

export const PlanCard: React.FC<PlanCardProps> = ({
  planId,
  billingInterval,
  priceModel,
  layout = "standard",
  isSamePlan,
  isCurrent,
  isEntitled,
  changeDirection = null,
  isLoading,
  disabledReason = null,
  onSelect,
  className,
}) => {
  const plan = PLAN_CATALOG[planId];
  const limits = getPlanLimitLabels(planId);

  const isTrialAvailable = plan.hasTrial;
  const showTrialMessaging = isTrialAvailable && !isEntitled && !isSamePlan;
  const isFreePlan = planId === "free";

  // Highlight "Essential" as recommended for new users, unless they are already on a paid plan
  const isRecommended = planId === "essential" && !isEntitled && !isSamePlan;
  const isIntervalSwitch = isSamePlan && !isCurrent;
  const isWide = layout === "wide";
  const showCurrentStatus = isCurrent && isEntitled && !isIntervalSwitch;
  const freePlanHighlights = [
    { value: limits.storage, label: "storage" },
    { value: limits.bandwidth, label: "public bandwidth" },
    { value: "PDF-only", label: "uploads" },
    { value: "DocKosha", label: "branding required" },
  ];

  const ctaLabel = disabledReason
    ? disabledReason
    : isCurrent && isEntitled
      ? "Active Plan"
      : isIntervalSwitch
        ? `Switch to ${billingInterval === "month" ? "Monthly" : "Annual"}`
        : showTrialMessaging
          ? "Start 14-day trial"
          : isFreePlan
            ? "Start Free"
            : isCurrent
              ? "Reactivate"
              : changeDirection === "downgrade"
                ? "Downgrade"
                : "Upgrade";

  const cardClassName = cn(
    "group relative flex h-full flex-col overflow-hidden rounded-lg border transition-[border-color,background-color] motion-reduce:transition-none",
    "bg-card/45",
    !isCurrent && !isRecommended && "hover:border-primary/30 hover:bg-card/70",
    isCurrent ? "border-primary bg-primary/[0.045]" : "border-border/70",
    isRecommended && !isCurrent ? "border-primary/45 bg-primary/[0.035]" : "",
    isWide && "bg-muted/[0.1]",
    isLoading && "pointer-events-none opacity-80 grayscale",
    className,
  );

  const actionButton = (
    <Button
      className={cn(
        "group w-full rounded py-5 font-medium transition-colors motion-reduce:transition-none",
        isRecommended && !isCurrent
          ? "border-primary bg-primary/10 text-primary hover:bg-primary/15"
          : "",
        isCurrent
          ? "border border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/40"
          : "bg-transparent text-primary hover:bg-primary/10",
        !isRecommended && !isCurrent ? "border-primary" : "",
      )}
      variant={isRecommended && !isCurrent ? "default" : "ghost"}
      size="lg"
      disabled={
        Boolean(disabledReason) ||
        isLoading ||
        (isCurrent && isEntitled && !isIntervalSwitch)
      }
      onClick={() => onSelect?.(planId, Boolean(showTrialMessaging))}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <SpinnerGap className="h-4 w-4 animate-spin" aria-hidden="true" />
          Processing
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {ctaLabel}{" "}
          {isRecommended && !isCurrent && (
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
              aria-hidden="true"
            />
          )}
        </span>
      )}
    </Button>
  );

  if (isWide) {
    return (
      <div className={cardClassName}>
        <div className="grid flex-1 gap-6 p-6 sm:p-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,1.2fr)_minmax(180px,0.55fr)] lg:items-center">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                Lightweight option
              </p>
              {showCurrentStatus ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
                  <Check className="h-3 w-3" weight="bold" aria-hidden="true" />
                  Current
                </span>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                <h3
                  className={cn(
                    "text-2xl font-bold tracking-tight sm:text-3xl",
                    isCurrent ? "text-primary" : "text-foreground",
                  )}
                >
                  {plan.name}
                </h3>
                <div className="flex items-baseline gap-x-2">
                  <span className="text-4xl font-extrabold tracking-tight tabular-nums">
                    {priceModel.amount}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">
                    {priceModel.currency} {priceModel.interval}
                  </span>
                </div>
              </div>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                {getPlanDescription(planId)}
              </p>
            </div>
          </div>

          <ul className="grid min-w-0 gap-2 sm:grid-cols-2">
            {freePlanHighlights.map((highlight) => (
              <li
                key={`${highlight.value}-${highlight.label}`}
                className="flex min-w-0 items-start gap-3 rounded border border-border/60 bg-background/25 px-3 py-2.5"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Check className="h-3 w-3" weight="bold" aria-hidden="true" />
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block text-sm font-semibold break-words">
                    {highlight.value}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {highlight.label}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div className="w-full lg:max-w-[220px] lg:justify-self-end">
            {showCurrentStatus ? (
              <div className="rounded border border-border/60 bg-background/25 px-4 py-3">
                <p className="text-sm font-semibold">Current plan</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Upgrade anytime for teams, branding, and full uploads.
                </p>
              </div>
            ) : (
              <>
                {actionButton}
                {showTrialMessaging ? (
                  <p className="mt-3 text-center text-[10px] tracking-widest text-muted-foreground uppercase opacity-70">
                    No credit card required
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cardClassName}>
      {/* Current Plan Badge */}
      {isCurrent && (
        <div className="absolute top-4 right-4">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.06] px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-primary uppercase">
            <Check size={11} weight="bold" aria-hidden="true" />
            Current
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col p-6 sm:p-8">
        {/* Recommended Badge (in-flow to avoid overlap in tighter layouts) */}
        {isRecommended ? (
          <div className="mb-4 flex justify-center sm:justify-start">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-1 text-[11px] font-medium tracking-wide text-primary uppercase">
              <Sparkle className="h-3 w-3" aria-hidden="true" />
              Recommended
            </div>
          </div>
        ) : null}

        {/* Header */}
        <div className="mb-6 space-y-2">
          <h3
            className={cn(
              "text-xl font-bold tracking-tight",
              isRecommended || isCurrent ? "text-primary" : "text-foreground",
            )}
          >
            {plan.name}
          </h3>
          <p className="min-h-[40px] text-sm leading-relaxed text-muted-foreground">
            {getPlanDescription(planId)}
          </p>
        </div>

        {/* Price */}
        <div className="mb-6 flex items-baseline gap-1">
          <span className="text-4xl font-medium tracking-tight sm:text-5xl">
            {priceModel.amount}
          </span>
          <div className="ml-1 flex flex-col items-start leading-none">
            <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {priceModel.currency}
            </span>
            <span className="text-sm text-muted-foreground">
              /{billingInterval === "month" ? "mo" : "mo"}
            </span>
          </div>
        </div>

        {priceModel.originalMonthlyEquivalent && (
          <div className="mb-3 text-sm text-muted-foreground/70">
            <span className="line-through">
              {priceModel.originalMonthlyEquivalent}
            </span>{" "}
            {priceModel.interval}
          </div>
        )}

        {priceModel.discountLabel && (
          <div className="mb-3 inline-flex self-start rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-amber-700 dark:text-amber-300">
            {priceModel.discountLabel}
          </div>
        )}

        {/* Annually billed text */}
        {priceModel.billedAnnuallyText && (
          <div className="mb-6 inline-block self-start rounded-md bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground/80">
            {priceModel.billedAnnuallyText}
          </div>
        )}

        {/* Features */}
        <div className="flex-1 space-y-5">
          <div className="h-px w-full bg-border/50" />

          <ul className="space-y-4">
            <li className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  isRecommended || isCurrent
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Check className="h-3 w-3" weight="bold" aria-hidden="true" />
              </div>
              <span className="text-sm font-medium">
                <span className="font-bold text-foreground">
                  {limits.storage}
                </span>{" "}
                total storage
              </span>
            </li>

            <li className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  isRecommended || isCurrent
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Check className="h-3 w-3" aria-hidden="true" />
              </div>
              <span className="text-sm text-muted-foreground/90">
                {isFreePlan ? "PDF uploads only" : "All core features included"}
              </span>
            </li>

            <li className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  isRecommended || isCurrent
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Check className="h-3 w-3" aria-hidden="true" />
              </div>
              <span className="text-sm text-muted-foreground/90">
                {isFreePlan
                  ? "Powered by DocKosha branding"
                  : "Priority Support"}
              </span>
            </li>
          </ul>
        </div>

        {/* CTA */}
        <div className="mt-8 pt-4">
          {actionButton}

          {showTrialMessaging && (
            <p className="mt-3 text-center text-[10px] tracking-widest text-muted-foreground uppercase opacity-70">
              No credit card required
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
