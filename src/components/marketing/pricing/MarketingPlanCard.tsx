import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PlanId, BillingInterval } from "@/modules/billing/types";
import { PLAN_CATALOG } from "@/modules/billing/plans";
import { getPlanLimitLabels } from "@/modules/billing/entitlements";
import { getFreePlanMarketingFacts } from "@/modules/billing/marketingFacts";
import { PriceViewModel } from "@/modules/billing/priceHelpers";
import { Check, Minus } from "@phosphor-icons/react/ssr";

interface MarketingPlanCardProps {
  planId: PlanId;
  billingInterval?: BillingInterval;
  priceModel: PriceViewModel;
  layout?: "standard" | "wide";
  ctaHref: string;
  ctaLabel?: string;
  isPopular?: boolean;
  index?: number;
}

const MarketingPlanCard: React.FC<MarketingPlanCardProps> = ({
  planId,
  priceModel,
  layout = "standard",
  ctaHref,
  ctaLabel,
  isPopular,
  index = 0,
}) => {
  const plan = PLAN_CATALOG[planId];
  const limits = getPlanLimitLabels(planId);
  const freePlanFacts = getFreePlanMarketingFacts();
  const animationDelay = `${index * 90}ms`;
  const isWide = layout === "wide";
  const freePlanHighlights: {
    value: string;
    label: string;
    kind: "included" | "limit";
  }[] = [
    { value: freePlanFacts.storage, label: "storage", kind: "included" },
    {
      value: freePlanFacts.bandwidthPerMonth,
      label: "bandwidth",
      kind: "included",
    },
    {
      value: `${freePlanFacts.members} member`,
      label: "workspace seats",
      kind: "included",
    },
    { value: "PDF-only", label: "uploads", kind: "included" },
    { value: "DocKosha branding", label: "required", kind: "limit" },
    { value: freePlanFacts.customDomains, label: "on Free", kind: "limit" },
    {
      value: freePlanFacts.previousVersions,
      label: "on Free",
      kind: "limit",
    },
  ];
  const planDescription =
    planId === "free"
      ? "For lightweight secure sharing with clear usage limits."
      : planId === "essential"
        ? "For teams moving beyond Free with broader sharing and storage needs."
        : planId === "plus"
          ? "For organizations running multiple active rooms with heavier traffic."
          : "For teams managing high document volume and broader external sharing.";

  return (
    <div className="animate-fade-in-up opacity-0" style={{ animationDelay }}>
      <Card
        className={cn(
          "relative flex h-full flex-col rounded-lg transition-colors duration-200",
          isWide && "bg-muted/15",
          isPopular
            ? "border-primary/55 bg-card [box-shadow:var(--dk-shadow-card)]"
            : "border-border bg-card/70 [box-shadow:var(--dk-shadow-card)] hover:border-primary/35",
        )}
      >
        {isPopular && (
          <div className="absolute top-0 right-0 left-0 flex -translate-y-1/2 justify-center">
            <span className="rounded-sm border border-primary/50 bg-background px-2.5 py-1 text-[10px] font-medium tracking-[0.12em] text-primary uppercase">
              Most Popular
            </span>
          </div>
        )}

        {isWide ? (
          <CardContent className="grid gap-6 p-6 sm:p-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,1.2fr)_minmax(180px,0.55fr)] lg:items-center">
            <div className="min-w-0 space-y-4 text-left">
              <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                Lightweight option
              </p>
              <div className="space-y-2">
                <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                  <CardTitle className="text-2xl font-medium tracking-[-0.02em] md:text-3xl">
                    {plan.name}
                  </CardTitle>
                  <div className="flex items-baseline gap-x-2">
                    <span className="text-4xl font-medium tracking-[-0.03em] tabular-nums">
                      {priceModel.amount}
                    </span>
                    <span className="text-sm font-medium text-muted-foreground">
                      {priceModel.interval}
                    </span>
                  </div>
                </div>
                <p className="max-w-xl text-sm leading-relaxed font-medium text-muted-foreground/80">
                  {planDescription}
                </p>
              </div>
            </div>

            <ul className="grid min-w-0 gap-2 sm:grid-cols-2">
              {freePlanHighlights.map((highlight) => (
                <li
                  key={`${highlight.value}-${highlight.label}`}
                  className="flex min-w-0 items-start gap-3 rounded-md border border-border/70 bg-background/35 px-3 py-2.5 text-left"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground">
                    {highlight.kind === "limit" ? (
                      <Minus aria-hidden className="h-3 w-3" weight="bold" />
                    ) : (
                      <Check aria-hidden className="h-3 w-3" weight="bold" />
                    )}
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

            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full transition-all duration-300 hover:border-primary/50 lg:max-w-[220px] lg:justify-self-end"
            >
              <Link href={ctaHref}>{ctaLabel || "Get started"}</Link>
            </Button>
          </CardContent>
        ) : (
          <>
            <CardHeader className="pt-8 pb-4 text-left">
              <CardTitle className="text-2xl font-medium tracking-[-0.02em] md:text-3xl">
                {plan.name}
              </CardTitle>
              <div className="min-h-[60px] max-w-[260px] text-sm font-medium text-muted-foreground/80">
                {planDescription}
              </div>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-8 pt-0 text-left">
              {/* Price */}
              <div className="flex flex-col items-start justify-center gap-2 py-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-medium tracking-[-0.03em] md:text-5xl">
                    {priceModel.amount}
                  </span>
                  <span className="text-lg font-medium text-muted-foreground">
                    {priceModel.interval}
                  </span>
                </div>
                {priceModel.originalMonthlyEquivalent && (
                  <span className="text-sm font-medium text-muted-foreground/60 line-through decoration-red-500/40 decoration-wavy decoration-1">
                    {priceModel.originalMonthlyEquivalent} {priceModel.interval}{" "}
                    usually
                  </span>
                )}
                {priceModel.billedAnnuallyText && (
                  <div className="rounded-sm border border-primary/25 bg-primary/5 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-primary uppercase">
                    {priceModel.billedAnnuallyText}
                  </div>
                )}
                {priceModel.discountLabel && (
                  <div className="rounded-sm border border-primary/25 bg-primary/5 px-3 py-1 text-[11px] font-medium tracking-wide text-primary">
                    {priceModel.discountLabel}
                  </div>
                )}
              </div>

              <div className="my-2 h-px w-full bg-gradient-to-r from-transparent via-border/60 to-transparent" />

              {/* Included usage */}
              <div className="space-y-4">
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase opacity-70">
                  Included Features
                </p>
                <ul className="grid gap-4 text-sm">
                  <li className="flex items-start gap-3 text-left">
                    <div
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                        isPopular
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted-foreground/20 text-muted-foreground",
                      )}
                    >
                      <Check aria-hidden className="h-3 w-3" weight="bold" />
                    </div>
                    <span className="leading-snug">
                      <strong className="font-semibold text-foreground">
                        {limits.storage}
                      </strong>{" "}
                      Total storage
                    </span>
                  </li>
                  {planId === "free" ? (
                    <>
                      <li className="flex items-start gap-3 text-left">
                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground">
                          <Check
                            aria-hidden
                            className="h-3 w-3"
                            weight="bold"
                          />
                        </div>
                        <span className="leading-snug">
                          <strong className="font-semibold text-foreground">
                            {freePlanFacts.bandwidthPerMonth}
                          </strong>{" "}
                          public bandwidth
                        </span>
                      </li>
                      <li className="flex items-start gap-3 text-left">
                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground">
                          <Check
                            aria-hidden
                            className="h-3 w-3"
                            weight="bold"
                          />
                        </div>
                        <span className="leading-snug">
                          <strong className="font-semibold text-foreground">
                            {freePlanFacts.members} workspace member
                          </strong>
                        </span>
                      </li>
                      <li className="flex items-start gap-3 text-left">
                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground">
                          <Check
                            aria-hidden
                            className="h-3 w-3"
                            weight="bold"
                          />
                        </div>
                        <span className="leading-snug">
                          {freePlanFacts.uploads}
                        </span>
                      </li>
                      <li className="flex items-start gap-3 text-left">
                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground">
                          <Minus
                            aria-hidden
                            className="h-3 w-3"
                            weight="bold"
                          />
                        </div>
                        <span className="leading-snug">
                          {freePlanFacts.branding}
                        </span>
                      </li>
                      <li className="flex items-start gap-3 text-left">
                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground">
                          <Minus
                            aria-hidden
                            className="h-3 w-3"
                            weight="bold"
                          />
                        </div>
                        <span className="leading-snug">
                          {freePlanFacts.customDomains}
                        </span>
                      </li>
                      <li className="flex items-start gap-3 text-left">
                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground">
                          <Minus
                            aria-hidden
                            className="h-3 w-3"
                            weight="bold"
                          />
                        </div>
                        <span className="leading-snug">
                          {freePlanFacts.previousVersions}
                        </span>
                      </li>
                    </>
                  ) : null}
                </ul>

                <div className="mt-4 border-t border-border/50 pt-4">
                  <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <span className="flex h-1.5 w-1.5 rounded-full bg-primary/70" />
                    {planId === "free"
                      ? "Includes core secure sharing"
                      : "Includes all core room controls"}
                  </p>
                </div>
              </div>

              <Button
                asChild
                size="lg"
                variant="outline"
                className={cn(
                  "mt-auto w-full transition-all duration-300",
                  isPopular
                    ? "border-primary/70 hover:bg-primary/10"
                    : "hover:border-primary/50",
                )}
              >
                <Link href={ctaHref}>{ctaLabel || "Get started"}</Link>
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
};

export default MarketingPlanCard;
