import pricingCopy from "@/content/pricing.json";
import type { Metadata } from "next";
import Script from "next/script";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHero from "@/components/marketing/MarketingHero";
import { PricingPageClient } from "@/components/marketing/pages/PricingPageClient";
import { getResolvedDisplayPrices } from "@/modules/billing/server/offers";
import { getStripeMode } from "@/modules/billing/stripePriceIds";
import { getFreePlanMarketingFacts } from "@/modules/billing/marketingFacts";
import { clientEnv, serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Free-First Pricing for Secure Document Sharing | DocKosha",
  description: pricingCopy.subtitle,
  keywords: [
    "free virtual data room pricing",
    "secure document sharing pricing",
    "lightweight vdr pricing",
    "DocKosha pricing",
  ],
  alternates: { canonical: "/pricing" },
  openGraph: {
    type: "website",
    title: "DocKosha Pricing — Free First, Upgrade When Ready",
    description: pricingCopy.subtitle,
    url: "/pricing",
  },
  twitter: {
    card: "summary_large_image",
    title: "DocKosha Pricing — Free First, Upgrade When Ready",
    description: pricingCopy.subtitle,
  },
};

const PricingPage: React.FC<PageProps<"/pricing">> = async () => {
  const initialPrices = await getResolvedDisplayPrices(
    getStripeMode(serverEnv.STRIPE_MODE),
  );
  const siteUrl = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const pricingJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "DocKosha",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: siteUrl,
    mainEntityOfPage: `${siteUrl}/pricing`,
    description: pricingCopy.subtitle,
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        description: getFreePlanMarketingFacts().offerDescription,
      },
      {
        "@type": "Offer",
        name: "Essential",
        price: String(initialPrices.essential.month.unitAmount / 100),
        priceCurrency: initialPrices.essential.month.currency.toUpperCase(),
        availability: "https://schema.org/InStock",
        description:
          "Paid plan for teams moving beyond Free with broader sharing and storage needs.",
      },
      {
        "@type": "Offer",
        name: "Plus",
        price: String(initialPrices.plus.month.unitAmount / 100),
        priceCurrency: initialPrices.plus.month.currency.toUpperCase(),
        availability: "https://schema.org/InStock",
        description:
          "Paid plan for organizations running multiple active rooms with heavier traffic.",
      },
      {
        "@type": "Offer",
        name: "Max",
        price: String(initialPrices.max.month.unitAmount / 100),
        priceCurrency: initialPrices.max.month.currency.toUpperCase(),
        availability: "https://schema.org/InStock",
        description:
          "Paid plan for teams managing high document volume and broader external sharing.",
      },
    ],
    publisher: {
      "@type": "Organization",
      name: "DocKosha",
      url: siteUrl,
    },
  } as const;

  return (
    <MarketingShell>
      <Script
        id="pricing-software-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      <MarketingHero
        badge={pricingCopy.badge}
        title={pricingCopy.title}
        subtitle={pricingCopy.subtitle}
      />
      <PricingPageClient initialPrices={initialPrices} />
    </MarketingShell>
  );
};

export default PricingPage;
