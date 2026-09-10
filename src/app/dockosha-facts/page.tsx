import type { FC } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import GlassCard from "@/components/marketing/GlassCard";
import MarketingContainer from "@/components/marketing/layout/MarketingContainer";
import MarketingSection from "@/components/marketing/layout/MarketingSection";
import MarketingHero from "@/components/marketing/MarketingHero";
import MarketingShell from "@/components/marketing/MarketingShell";
import {
  buildBreadcrumbListJsonLd,
  buildFaqPageJsonLd,
  buildSoftwareApplicationJsonLd,
  buildWebPageJsonLd,
  type SeoFaqItem,
} from "@/modules/seo/jsonLd";
import { getFreePlanMarketingFacts } from "@/modules/billing/marketingFacts";

const pageTitle =
  "DocKosha Facts | M&A, Founder Data Rooms, and Secure Sharing";
const pageDescription =
  "DocKosha facts: open-source document sharing under AGPL-3.0-or-later, managed Cloud plans, data rooms, self-hosting availability, and privacy rules.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  keywords: [
    "DocKosha facts",
    "M&A data room",
    "founder data room",
    "investor data room",
    "free virtual data room",
    "virtual data room software facts",
    "secure document sharing",
    "legal document sharing",
    "fundraising data room",
    "document sharing with watermarking",
    "document sharing with analytics",
  ],
  alternates: { canonical: "/dockosha-facts" },
  openGraph: {
    type: "website",
    title: pageTitle,
    description: pageDescription,
    url: "/dockosha-facts",
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
  },
};

const productSummaryFacts = [
  "DocKosha is a web-based M&A data room, founder data room, and secure document sharing product.",
  "Targeting: M&A teams and founders first, with lawyers and fundraising workflows as secondary ICPs.",
  "The product is designed around gated sharing, watermarking, and page-level engagement analytics.",
];

const freePlanMarketingFacts = getFreePlanMarketingFacts();

const freePlanFacts = [
  "Plan: Free",
  `Included storage: ${freePlanMarketingFacts.storage} total`,
  `Included public bandwidth: ${freePlanMarketingFacts.bandwidth}/month`,
  `Internal workspace members: ${freePlanMarketingFacts.members}`,
  "Allowed uploads on Free: PDF only",
  `Branding on Free: ${freePlanMarketingFacts.branding}`,
];

const paidPlanFacts = [
  "Paid tiers currently listed: Essential, Plus, Max",
  "Essential includes a 14-day trial with no credit card required",
  "Paid plans increase included storage and bandwidth",
  "Paid plans support non-PDF uploads with PDF-first viewer conversion",
  "Paid plans add options like branding removal and custom domains",
];

const supportedUseCases = [
  "M&A data rooms for sell-side, buy-side, and diligence workflows",
  "Founder data rooms for investor diligence and confidential fundraising materials",
  "Single-document sharing for lawyers, advisors, legal teams, and finance teams",
  "Folder-based room workflows for diligence, fundraising, and review cycles",
  "External sharing with gates, expiry, and revocation",
  "Secure document sharing with watermarking and controlled downloads",
  "Privacy-first engagement tracking across shared files",
];

const claimBoundaries = [
  "Non-PDF text and document formats may be converted to PDF before viewing.",
  "If conversion is unavailable, DocKosha can fall back to original formats where supported.",
  "Public/private route boundaries are enforced at the application layer.",
  "Storage and entitlement limits are workspace-based and updated through pricing changes.",
];

const faqItems: SeoFaqItem[] = [
  {
    question: "Is DocKosha open source?",
    answer:
      "Yes. DocKosha has one public application source edition under AGPL-3.0-or-later, available for inspection and contribution. Hosted Cloud subscriptions have their own capacity and feature limits.",
  },
  {
    question: "Can I self-host DocKosha?",
    answer:
      "Independent self-hosting is not currently available. The application requires DocYantra, a private document-processing dependency. DocKosha Cloud is the managed service available today.",
  },
  {
    question: "What is the primary use case for DocKosha?",
    answer:
      "M&A teams and founders use DocKosha for controlled data rooms and PDF sharing before broader room-level governance is required.",
  },
  {
    question: "What are the secondary use cases for DocKosha?",
    answer:
      "Lawyers and fundraising teams use DocKosha for confidential packets, investor materials, contracts, and review workflows that need gates, watermarking, and analytics.",
  },
  {
    question:
      "Does DocKosha publish virtual data room software facts publicly?",
    answer:
      "Yes. This page publishes current facts for plan limits, use cases, and security/privacy boundaries so teams can verify scope quickly.",
  },
  {
    question: "How is document sharing with analytics implemented?",
    answer:
      "DocKosha provides privacy-first analytics for views, downloads, and page-level time, with collection driven by sharing gate configuration.",
  },
];

const securityPrivacyFacts = [
  "Encryption in transit and at rest is managed through underlying Supabase infrastructure.",
  "Core controls include link gates, watermarking, download controls, and access permissions.",
  "Analytics are privacy-first and avoid raw IP address storage.",
  "Viewer identity signals are collected only when required by gates or sharing settings.",
];

const DocKoshaFactsPage: FC = () => {
  const faqJsonLd = buildFaqPageJsonLd(faqItems);
  const webPageJsonLd = buildWebPageJsonLd({
    path: "/dockosha-facts",
    title: pageTitle,
    description: pageDescription,
  });
  const softwareJsonLd = buildSoftwareApplicationJsonLd({
    pagePath: "/dockosha-facts",
    description:
      "DocKosha is an M&A and founder data room plus secure document sharing software product with free and paid plans, including gates, watermarking, and privacy-first analytics.",
    featureList: [
      `Free plan: ${freePlanMarketingFacts.storage} storage, ${freePlanMarketingFacts.bandwidth} public bandwidth, one member, PDF-only uploads`,
      "Paid plans: Essential, Plus, Max",
      "Core controls: gates, watermarking, and download controls",
      "Privacy-first analytics with no raw IP storage",
      "M&A room workflows, founder investor rooms, and secure PDF-first sharing",
      "Secondary support for lawyer and fundraising document workflows",
      "Facts-first page for free virtual data room and secure document sharing features",
    ],
  });
  const breadcrumbJsonLd = buildBreadcrumbListJsonLd([
    { name: "Home", path: "/" },
    { name: "DocKosha Facts", path: "/dockosha-facts" },
  ]);

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "DocKosha factual statements",
    itemListElement: [
      ...productSummaryFacts,
      ...freePlanFacts,
      ...paidPlanFacts,
      ...supportedUseCases,
      ...claimBoundaries,
      ...securityPrivacyFacts,
    ].map((text, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Thing",
        name: text,
      },
    })),
  } as const;

  return (
    <MarketingShell>
      <Script
        id="dockosha-facts-webpage-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <Script
        id="dockosha-facts-software-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <Script
        id="dockosha-facts-faq-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Script
        id="dockosha-facts-itemlist-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <Script
        id="dockosha-facts-breadcrumb-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <MarketingHero
        badge="Factual Product Page"
        title="DocKosha facts"
        subtitle="A concise reference for M&A and founder data room facts, secondary lawyer and fundraising workflows, free plan limits, and privacy rules."
      >
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Button asChild size="lg" className="h-12 px-8 text-base">
            <Link href="/free-virtual-data-room">Free VDR details</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/secure-document-sharing">Secure sharing details</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/pricing">Pricing</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/security">Security</Link>
          </Button>
        </div>
      </MarketingHero>

      <MarketingSection className="pt-0">
        <MarketingContainer>
          <div className="grid gap-4">
            <GlassCard>
              <CardHeader>
                <Badge
                  variant="outline"
                  className="mb-3 w-fit border-primary/20 bg-primary/5 px-3 py-1 text-primary"
                >
                  Company and product summary
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {productSummaryFacts.map((fact) => (
                    <CardDescription
                      key={fact}
                      className="text-base text-foreground"
                    >
                      {fact}
                    </CardDescription>
                  ))}
                </div>
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader>
                <Badge
                  variant="outline"
                  className="mb-3 w-fit border-primary/20 bg-primary/5 px-3 py-1 text-primary"
                >
                  Current free plan facts
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {freePlanFacts.map((fact) => (
                    <CardDescription
                      key={fact}
                      className="text-base text-foreground"
                    >
                      {fact}
                    </CardDescription>
                  ))}
                </div>
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader>
                <Badge
                  variant="outline"
                  className="mb-3 w-fit border-primary/20 bg-primary/5 px-3 py-1 text-primary"
                >
                  Paid plan differences
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {paidPlanFacts.map((fact) => (
                    <CardDescription
                      key={fact}
                      className="text-base text-foreground"
                    >
                      {fact}
                    </CardDescription>
                  ))}
                </div>
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader>
                <Badge
                  variant="outline"
                  className="mb-3 w-fit border-primary/20 bg-primary/5 px-3 py-1 text-primary"
                >
                  Supported use cases
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {supportedUseCases.map((fact) => (
                    <CardDescription
                      key={fact}
                      className="text-base text-foreground"
                    >
                      {fact}
                    </CardDescription>
                  ))}
                </div>
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader>
                <Badge
                  variant="outline"
                  className="mb-3 w-fit border-primary/20 bg-primary/5 px-3 py-1 text-primary"
                >
                  Claim boundaries and current scope
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {claimBoundaries.map((fact) => (
                    <CardDescription
                      key={fact}
                      className="text-base text-foreground"
                    >
                      {fact}
                    </CardDescription>
                  ))}
                </div>
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader>
                <Badge
                  variant="outline"
                  className="mb-3 w-fit border-primary/20 bg-primary/5 px-3 py-1 text-primary"
                >
                  Security and privacy facts
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {securityPrivacyFacts.map((fact) => (
                    <CardDescription
                      key={fact}
                      className="text-base text-foreground"
                    >
                      {fact}
                    </CardDescription>
                  ))}
                </div>
              </CardContent>
            </GlassCard>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection variant="muted">
        <MarketingContainer>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            FAQ: virtual data room software and secure sharing
          </h2>
          <div className="mt-6 grid gap-4">
            {faqItems.map((item) => (
              <GlassCard key={item.question}>
                <CardHeader>
                  <CardTitle className="text-xl">{item.question}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    {item.answer}
                  </CardDescription>
                </CardContent>
              </GlassCard>
            ))}
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection className="pb-24">
        <MarketingContainer>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/auth/sign-in?redirect=%2Fonboarding">
                Start onboarding
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">Open pricing page</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/security">Open security page</Link>
            </Button>
          </div>
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
};

export default DocKoshaFactsPage;
