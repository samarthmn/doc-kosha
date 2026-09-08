"use client";

import React, { useMemo, useState } from "react";
import { BillingIntervalToggle } from "@/components/billing/BillingIntervalToggle";
import MarketingPlanCard from "@/components/marketing/pricing/MarketingPlanCard";
import PricingCommonFeatures from "@/components/marketing/pricing/PricingCommonFeatures";
import PricingDetailedFeatures from "@/components/marketing/pricing/PricingDetailedFeatures";
import PricingWhyChoose from "@/components/marketing/pricing/PricingWhyChoose";
import PricingEngineKeys from "@/components/marketing/pricing/PricingEngineKeys";
import PricingCTABanner from "@/components/marketing/pricing/PricingCTABanner";
import {
  type DisplayPrices,
  getSharedDiscountPercent,
} from "@/modules/billing/displayPrices";
import { BillingInterval, PlanId, isPaidPlanId } from "@/modules/billing/types";
import { getPriceViewModel } from "@/modules/billing/priceHelpers";
import MarketingSection from "@/components/marketing/layout/MarketingSection";
import MarketingContainer from "@/components/marketing/layout/MarketingContainer";
import MarketingCardGrid from "@/components/marketing/layout/MarketingCardGrid";
import FaqSections, {
  type FaqSection,
} from "@/components/marketing/FaqSections";
import pricingCopy from "@/content/pricing.json";
import {
  appendLandingAttribution,
  PRICING_PAGE_SOURCE,
} from "@/lib/analytics/landingAttribution";

const paidPlanOrder: PlanId[] = ["essential", "plus", "max"];
const freePlanId: PlanId = "free";

interface PricingPageClientProps {
  initialPrices: DisplayPrices;
}

export const PricingPageClient: React.FC<PricingPageClientProps> = ({
  initialPrices,
}) => {
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>("month");

  const ctaHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("redirect", "/onboarding");
    appendLandingAttribution(params, { source: PRICING_PAGE_SOURCE });
    return `/auth/sign-in?${params.toString()}`;
  }, []);
  const faqSections: FaqSection[] = pricingCopy.faq?.items?.length
    ? [
        {
          title: pricingCopy.faq.title ?? "Pricing FAQs",
          items: pricingCopy.faq.items,
        },
      ]
    : [];

  return (
    <>
      <MarketingSection className="pt-0 pb-16">
        <MarketingContainer>
          <div className="mb-12 flex flex-col items-start gap-6">
            <BillingIntervalToggle
              interval={billingInterval}
              onChange={setBillingInterval}
              monthlyDiscountPercent={getSharedDiscountPercent(
                initialPrices,
                "month",
              )}
              annualDiscountPercent={getSharedDiscountPercent(
                initialPrices,
                "year",
              )}
            />
          </div>

          <div className="space-y-8">
            <MarketingCardGrid cols={3}>
              {paidPlanOrder.map((planId, index) => {
                const priceModel = !isPaidPlanId(planId)
                  ? { amount: "$0", currency: "USD", interval: "/mo" }
                  : getPriceViewModel(
                      initialPrices[planId][billingInterval],
                      billingInterval,
                    );
                return (
                  <MarketingPlanCard
                    key={planId}
                    planId={planId}
                    billingInterval={billingInterval}
                    priceModel={priceModel}
                    ctaHref={ctaHref}
                    ctaLabel={
                      planId === "essential"
                        ? "Start free trial"
                        : "Get started"
                    }
                    isPopular={planId === "essential"}
                    index={index}
                  />
                );
              })}
            </MarketingCardGrid>

            <MarketingPlanCard
              planId={freePlanId}
              billingInterval={billingInterval}
              priceModel={{ amount: "$0", currency: "USD", interval: "/mo" }}
              layout="wide"
              ctaHref={ctaHref}
              ctaLabel="Start free"
              index={paidPlanOrder.length}
            />
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection variant="muted" className="py-20">
        <MarketingContainer>
          <PricingCommonFeatures />
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection className="py-20">
        <MarketingContainer>
          <FaqSections sections={faqSections} />
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection className="py-20">
        <MarketingContainer>
          <PricingDetailedFeatures />
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection variant="muted" className="py-20">
        <MarketingContainer>
          <PricingWhyChoose />
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection className="py-20">
        <MarketingContainer>
          <PricingEngineKeys />
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection className="pt-0 pb-24">
        <MarketingContainer>
          <PricingCTABanner />
        </MarketingContainer>
      </MarketingSection>
    </>
  );
};
