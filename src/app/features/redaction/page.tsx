import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHero from "@/components/marketing/MarketingHero";
import MarketingSection from "@/components/marketing/layout/MarketingSection";
import MarketingContainer from "@/components/marketing/layout/MarketingContainer";
import MarketingCardGrid from "@/components/marketing/layout/MarketingCardGrid";
import GlassCard from "@/components/marketing/GlassCard";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileX, LinkSimple, Stack } from "@phosphor-icons/react/ssr";

export const metadata: Metadata = {
  title: "Secure PDF Redaction",
  description:
    "DocYantra 0.0.25 permanently removes sensitive information from PDFs and converted deal documents within its validated envelope while keeping links and version history intact.",
  keywords: [
    "PDF redaction",
    "secure redaction",
    "document redaction",
    "virtual data room security",
  ],
  alternates: { canonical: "/features/redaction" },
  openGraph: {
    type: "website",
    title: "Secure PDF Redaction",
    description:
      "DocYantra 0.0.25 permanently removes sensitive information from PDFs and converted documents within its validated envelope while keeping links and version history intact.",
    url: "/features/redaction",
  },
  twitter: {
    card: "summary_large_image",
    title: "Secure PDF Redaction",
    description:
      "DocYantra 0.0.25 permanently removes sensitive information from PDFs and converted documents within its validated envelope while keeping links and version history intact.",
  },
};

const RedactionFeaturePage: React.FC = () => {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Feature"
        title="Secure PDF redaction for deal materials"
        subtitle="DocYantra 0.0.25 permanently removes sensitive information from PDFs and converted documents within its validated envelope before they move outside your firm."
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
            <Link href="/features">Back to features</Link>
          </Button>
        </div>
      </MarketingHero>

      <MarketingSection className="pt-0">
        <MarketingContainer>
          <div className="max-w-3xl border-l border-primary/40 pl-6">
            <p className="text-lg text-muted-foreground">
              DocYantra-backed DocKosha redaction is designed to permanently
              remove sensitive content within its validated envelope, not just
              hide it.
            </p>
          </div>

          <div className="mt-10">
            <MarketingCardGrid cols={3}>
              <GlassCard>
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileX className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle>Permanent removal</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Remove sensitive text and areas from PDFs in a way that is
                    meant to prevent recovery from the exported file.
                  </CardDescription>
                </CardContent>
              </GlassCard>

              <GlassCard>
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Stack className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle>Works with versioning</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Save as a new document or replace the current version while
                    retaining history and internal traceability.
                  </CardDescription>
                </CardContent>
              </GlassCard>

              <GlassCard>
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <LinkSimple className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle>Links stay stable</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Keep sharing the same link after a redaction update, so you
                    can fix issues without re-sending URLs.
                  </CardDescription>
                </CardContent>
              </GlassCard>
            </MarketingCardGrid>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection variant="muted" className="pb-24">
        <MarketingContainer size="sm" className="text-left">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Keep documents moving without leaking details
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            Use redaction when a client, buyer, or counterparty needs the
            document but should not see every underlying detail.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/pricing">View pricing</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/contact">Talk to sales</Link>
            </Button>
          </div>
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
};

export default RedactionFeaturePage;
