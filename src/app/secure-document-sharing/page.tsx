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

const pageTitle = "Secure Document Sharing with Watermarking | DocKosha";
const pageDescription =
  "Secure document sharing with watermarking, link gates, and privacy-first analytics for M&A teams, founders, lawyers, and fundraising workflows.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  keywords: [
    "secure document sharing",
    "secure document sharing for founders",
    "legal document sharing",
    "fundraising document sharing",
    "secure virtual data room",
    "document sharing with watermarking",
    "document sharing with analytics",
    "founder data room",
    "M&A data room",
    "virtual data room software",
    "virtual data room alternative",
    "secure file sharing for clients",
  ],
  alternates: { canonical: "/secure-document-sharing" },
  openGraph: {
    type: "website",
    title: pageTitle,
    description: pageDescription,
    url: "/secure-document-sharing",
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
  },
};

const freePlanFacts = [
  "250 MB included storage",
  "2 GB included public bandwidth",
  "1 internal workspace member",
  "PDF-only uploads on Free",
  "Verification gates, allowlists, and expiry options",
  "Document sharing with watermarking and download controls",
  "Privacy-first analytics for views, downloads, and page time",
];

const comparisonRows = [
  {
    title: "Generic cloud storage",
    description:
      "Works for file transfer, but secure controls such as watermarking and engagement analytics usually require add-on tooling.",
  },
  {
    title: "DocKosha secure sharing",
    description:
      "Single secure sharing workflow for gates, watermarking, download control, and privacy-first analytics.",
  },
  {
    title: "Enterprise VDR suites",
    description:
      "Built for broad procurement and governance needs, often with heavier onboarding and higher operational overhead.",
  },
];

const faqItems: SeoFaqItem[] = [
  {
    question: "What is secure document sharing with watermarking?",
    answer:
      "It is controlled document access where shared PDFs can include dynamic visible identifiers to discourage casual forwarding and support compliance-friendly workflows.",
  },
  {
    question: "Can I use this for M&A and founder diligence?",
    answer:
      "Yes. DocKosha is intended for lean M&A and founder diligence workflows before heavier governance systems are needed.",
  },
  {
    question: "Can lawyers use DocKosha for secure document sharing?",
    answer:
      "Yes. Lawyers and legal teams can use gates, watermarking, download controls, and privacy-first analytics for contracts, client packets, and review materials.",
  },
  {
    question: "Does this support document sharing with analytics?",
    answer:
      "Yes. DocKosha tracks views, downloads, and page-level time so teams can review reader engagement signals.",
  },
  {
    question: "Do these analytics collect raw personal data?",
    answer:
      "No raw IP addresses are stored. Additional viewer signals are collected only through sharing gate requirements or workspace settings.",
  },
];

const SecureDocumentSharingPage: FC = () => {
  const faqJsonLd = buildFaqPageJsonLd(faqItems);
  const webPageJsonLd = buildWebPageJsonLd({
    path: "/secure-document-sharing",
    title: pageTitle,
    description: pageDescription,
  });
  const softwareJsonLd = buildSoftwareApplicationJsonLd({
    pagePath: "/secure-document-sharing",
    description: pageDescription,
    featureList: [
      "Secure links with email verification and password gates",
      "Allowlists, blocklists, expiry, and NDA controls",
      "Dynamic watermarking and download controls",
      "Privacy-first analytics for views, downloads, and page-level time",
      "Secure document sharing for M&A, founders, lawyers, and fundraising teams",
      "PDF-only free entry path with paid plan upgrade options",
    ],
  });
  const breadcrumbJsonLd = buildBreadcrumbListJsonLd([
    { name: "Home", path: "/" },
    { name: "Secure Document Sharing", path: "/secure-document-sharing" },
  ]);

  return (
    <MarketingShell>
      <Script
        id="secure-sharing-webpage-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <Script
        id="secure-sharing-software-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <Script
        id="secure-sharing-faq-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Script
        id="secure-sharing-breadcrumb-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <MarketingHero
        badge="Secure Document Sharing"
        title="Secure document sharing for M&A teams, founders, and lawyers"
        subtitle="Move from file links to controlled sharing for deal files, investor packets, legal documents, and fundraising materials: gates, expiry, watermarking, and analytics without enterprise-vendor complexity."
      >
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Button asChild size="lg" className="h-12 px-8 text-base">
            <Link href="/auth/sign-in?redirect=%2Fonboarding">Start free</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 bg-background/50 px-8 text-base backdrop-blur-sm"
          >
            <Link href="/pricing">View pricing</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 bg-background/50 px-8 text-base backdrop-blur-sm"
          >
            <Link href="/security">Security posture</Link>
          </Button>
        </div>
      </MarketingHero>

      <MarketingSection className="pt-0">
        <MarketingContainer>
          <div className="max-w-3xl border-l border-primary/40 pl-6">
            <p className="text-[1.0625rem] leading-7 text-muted-foreground">
              Secure document sharing is for control, not just transfer. For
              teams sharing CIMs, pitch decks, legal packets, and diligence
              materials, this adds gate control, watermarking, and engagement
              insight.
            </p>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection>
        <MarketingContainer>
          <div className="mb-6">
            <Badge
              variant="outline"
              className="border-primary/20 bg-primary/5 px-3 py-1 text-primary"
            >
              Free plan facts
            </Badge>
          </div>
          <MarketingCardGrid cols={3}>
            {freePlanFacts.map((fact) => (
              <GlassCard key={fact}>
                <CardHeader className="p-5 md:p-6">
                  <CardTitle className="text-lg">{fact}</CardTitle>
                </CardHeader>
              </GlassCard>
            ))}
          </MarketingCardGrid>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection variant="muted">
        <MarketingContainer>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Positioning: secure document sharing vs alternatives
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {comparisonRows.map((row) => (
              <GlassCard key={row.title}>
                <CardHeader>
                  <CardTitle>{row.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    {row.description}
                  </CardDescription>
                </CardContent>
              </GlassCard>
            ))}
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/free-virtual-data-room">Free virtual data room</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/dockosha-facts">How it works + plan facts</Link>
            </Button>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection className="pb-24">
        <MarketingContainer>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            What teams can do in secure document sharing
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <GlassCard>
              <CardHeader>
                <CardTitle>Control who can open links</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  Add verification gates, allowlists/blocklists, and expiry so
                  links stay intentional.
                </CardDescription>
              </CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader>
                <CardTitle>Reduce accidental redistribution</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  Apply dynamic watermarking and download controls to reduce
                  casual forwarding risk.
                </CardDescription>
              </CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader>
                <CardTitle>
                  Read engagement with privacy-first signals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  Track views, downloads, and page-level time to prioritize
                  follow-up without raw IP capture.
                </CardDescription>
              </CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader>
                <CardTitle>Grow into room workflows</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  Start with single-document sharing and move into foldered room
                  workflows as diligence scope expands.
                </CardDescription>
              </CardContent>
            </GlassCard>
          </div>

          <div className="mt-8">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              FAQ: secure document sharing
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
          </div>
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
};

export default SecureDocumentSharingPage;
