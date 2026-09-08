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
import MarketingCardGrid from "@/components/marketing/layout/MarketingCardGrid";
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

const pageTitle = "Free Virtual Data Room Software for M&A and Founders";
const pageDescription =
  "Free virtual data room software for M&A teams and founders: PDF-first secure sharing with watermarking, gated links, and privacy-first analytics on clear usage limits.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  keywords: [
    "free virtual data room",
    "free virtual data room software",
    "free VDR",
    "free data room software",
    "free investor data room",
    "founder data room",
    "fundraising data room",
    "M&A data room",
    "virtual data room software",
    "document sharing with watermarking",
    "document sharing with analytics",
    "secure virtual data room",
    "legal document sharing",
  ],
  alternates: { canonical: "/free-virtual-data-room" },
  openGraph: {
    type: "website",
    title: pageTitle,
    description: pageDescription,
    url: "/free-virtual-data-room",
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
  },
};

const freePlanMarketingFacts = getFreePlanMarketingFacts();

const freePlanFacts = [
  `${freePlanMarketingFacts.storage} total storage included`,
  `${freePlanMarketingFacts.bandwidth} public bandwidth included`,
  `${freePlanMarketingFacts.members} internal workspace member`,
  "PDF uploads only on the Free plan",
  "Gated link sharing included",
  "Dynamic watermarking and download controls included",
  "Privacy-first engagement analytics for views, page-level time, and downloads",
  "DocKosha branding is shown on Free-plan documents",
];

const securityControls = [
  "Email verification, password gates, allowlists/blocklists, and NDA gates",
  "High-fidelity PDF-first viewer with fallback when conversion is unavailable",
  "Dynamic watermarking and download controls on shared PDFs",
  "Public route sharing with explicit access controls and link expiry where configured",
  "Viewer telemetry is anonymized-first and does not store raw IP addresses",
];

const faqItems: SeoFaqItem[] = [
  {
    question: "Is this a free virtual data room software option?",
    answer:
      "Yes. DocKosha offers a free plan for secure PDF-first document sharing with clear limits on storage, bandwidth, and workspace size.",
  },
  {
    question: "Is free virtual data room software enough for early diligence?",
    answer:
      "For M&A teams, founders, and diligence-heavy workflows with mostly PDF packets, free plan limits are usually enough to start, with upgrade paths when deal or fundraising volume grows.",
  },
  {
    question:
      "What makes DocKosha different from generic cloud storage for document sharing?",
    answer:
      "Cloud storage is mostly file transport. DocKosha combines secure document sharing with watermarking, gated access, and privacy-first engagement analytics in one workflow.",
  },
  {
    question: "Can I move from free virtual data room to paid plans later?",
    answer:
      "Yes. You keep the same sharing model and workspace structure while moving to larger limits on paid plans.",
  },
  {
    question: "Does this support document sharing with analytics for free?",
    answer:
      "Yes. Free includes privacy-first document sharing analytics for page views and engagement signals, with stronger retention and workspace options on paid tiers.",
  },
];

const FreeVirtualDataRoomPage: FC = () => {
  const faqJsonLd = buildFaqPageJsonLd(faqItems);
  const webPageJsonLd = buildWebPageJsonLd({
    path: "/free-virtual-data-room",
    title: pageTitle,
    description: pageDescription,
  });
  const softwareJsonLd = buildSoftwareApplicationJsonLd({
    pagePath: "/free-virtual-data-room",
    description: pageDescription,
    featureList: [
      `Free plan with ${freePlanMarketingFacts.storage} storage and ${freePlanMarketingFacts.bandwidth} public bandwidth`,
      "PDF-only uploads on free",
      "Secure document sharing with email, password, and NDA gate options",
      "Dynamic watermarking and download controls",
      "Privacy-first engagement analytics",
      "Virtual data room software for M&A, founder, fundraising, and legal workflows",
    ],
  });
  const breadcrumbJsonLd = buildBreadcrumbListJsonLd([
    { name: "Home", path: "/" },
    { name: "Free Virtual Data Room", path: "/free-virtual-data-room" },
  ]);

  return (
    <MarketingShell>
      <Script
        id="free-vdr-webpage-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <Script
        id="free-vdr-software-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <Script
        id="free-vdr-faq-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Script
        id="free-vdr-breadcrumb-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <MarketingHero
        badge="Free Virtual Data Room"
        title="Need a free virtual data room for M&A or founder diligence?"
        subtitle="Start with PDF-first sharing for deal files, investor packets, legal documents, and fundraising materials. Use secure links, watermarking, and privacy-first analytics on plan limits that scale when volume increases."
      >
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Button asChild size="lg" className="h-12 px-8 text-base">
            <Link href="/auth/sign-in?redirect=%2Fonboarding">
              Start free now
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 bg-background/50 px-8 text-base backdrop-blur-sm"
          >
            <Link href="/pricing">Compare plans</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 bg-background/50 px-8 text-base backdrop-blur-sm"
          >
            <Link href="/security">Review security</Link>
          </Button>
        </div>
      </MarketingHero>

      <MarketingSection className="pt-0">
        <MarketingContainer>
          <div className="mb-6">
            <Badge
              variant="outline"
              className="border-primary/20 bg-primary/5 px-3 py-1 text-primary"
            >
              Free plan facts (document sharing with analytics)
            </Badge>
          </div>
          <MarketingCardGrid cols={3} className="auto-rows-fr">
            {freePlanFacts.map((fact, index) => (
              <GlassCard key={fact} className="h-full">
                <CardHeader className="flex h-full min-h-32 flex-col justify-between p-5 md:p-6">
                  <span
                    aria-hidden="true"
                    className="text-xs font-medium tracking-[0.12em] text-primary"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <CardTitle className="text-base leading-snug font-medium text-balance md:text-lg">
                    {fact}
                  </CardTitle>
                </CardHeader>
              </GlassCard>
            ))}
          </MarketingCardGrid>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection variant="muted">
        <MarketingContainer>
          <div className="grid gap-4 md:grid-cols-2">
            <GlassCard>
              <CardHeader>
                <CardTitle>Best fit for free virtual data room needs</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  M&A teams and founders who share PDF decks, diligence packets,
                  investor materials, and advisor documents and need controls
                  beyond plain file links.
                </CardDescription>
              </CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader>
                <CardTitle>When to choose a heavier VDR stack</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  Teams that already require very large storage footprints,
                  centralized governance packages, or custom procurement
                  workflows from day one.
                </CardDescription>
              </CardContent>
            </GlassCard>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection>
        <MarketingContainer>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            How DocKosha compares for secure document sharing
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <GlassCard>
              <CardHeader>
                <CardTitle>Generic cloud storage</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  Good for basic file transfer. Usually needs manual process
                  steps for document sharing with watermarking and analytics.
                </CardDescription>
              </CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader>
                <CardTitle>DocKosha free virtual data room</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  Focused on secure PDF sharing with practical controls and a
                  clear free limit model for smaller teams and early diligence
                  mandates.
                </CardDescription>
              </CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader>
                <CardTitle>Enterprise VDRs</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  Built for larger organizations that need broader procurement,
                  governance, and account structure patterns with higher cost
                  and operational overhead.
                </CardDescription>
              </CardContent>
            </GlassCard>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection variant="muted">
        <MarketingContainer>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Security controls included on the free virtual data room plan
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {securityControls.map((control) => (
              <GlassCard key={control}>
                <CardContent className="pt-6">
                  <CardDescription className="text-base text-foreground">
                    {control}
                  </CardDescription>
                </CardContent>
              </GlassCard>
            ))}
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection className="pb-24">
        <MarketingContainer>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            FAQ: free data room software
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
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/auth/sign-in?redirect=%2Fonboarding">
                Create free workspace
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">See paid plan differences</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/security">Security details</Link>
            </Button>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" variant="outline">
              <Link href="/secure-document-sharing">
                Secure sharing details
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/dockosha-facts">Fact sheet and plan scope</Link>
            </Button>
          </div>
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
};

export default FreeVirtualDataRoomPage;
