import type { Metadata } from "next";
import Link from "next/link";
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
import { DownloadSimple, Eye, Fingerprint } from "@phosphor-icons/react/ssr";

export const metadata: Metadata = {
  title: "Dynamic Watermarking",
  description:
    "Deter leaks with dynamic watermarking for data rooms and sensitive documents, including watermarked downloads.",
  keywords: [
    "dynamic watermarking",
    "document watermarking",
    "virtual data room watermarking",
    "m&a data room watermarking",
  ],
  alternates: { canonical: "/features/watermarking" },
  openGraph: {
    type: "website",
    title: "Dynamic Watermarking",
    description:
      "Deter leaks with dynamic watermarking for data rooms and sensitive documents.",
    url: "/features/watermarking",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dynamic Watermarking",
    description:
      "Deter leaks with dynamic watermarking for data rooms and sensitive documents.",
  },
};

const WatermarkingFeaturePage: React.FC = () => {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Feature"
        title="Dynamic watermarking for secure document rooms"
        subtitle="Add accountability during viewing and downloads so sensitive diligence documents are harder to forward casually."
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
            <Link href="/demos/watermark-template">Watch demo</Link>
          </Button>
        </div>
      </MarketingHero>

      <MarketingSection className="pt-0">
        <MarketingContainer>
          <div className="max-w-3xl border-l border-primary/40 pl-6">
            <p className="text-lg text-muted-foreground">
              Watermarking is not about being fancy. It is about making
              mishandling expensive. Pair watermarks with expiry and gated
              access for the strongest results.
            </p>
          </div>

          <div className="mt-10">
            <MarketingCardGrid cols={3}>
              <GlassCard>
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Fingerprint className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle>Dynamic, viewer-attributed watermarks</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Add viewer-attributed signals to increase accountability and
                    reduce casual screenshots and forwarding.
                  </CardDescription>
                </CardContent>
              </GlassCard>

              <GlassCard>
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <DownloadSimple className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle>Watermarked downloads</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    When watermarking is enabled, downloads stream the processed
                    PDF so the watermark stays consistent.
                  </CardDescription>
                </CardContent>
              </GlassCard>

              <GlassCard>
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Eye className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle>Works with gates and analytics</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Combine watermarks with verification/allowlists and
                    privacy-first analytics to see what got reviewed and when.
                  </CardDescription>
                </CardContent>
              </GlassCard>
            </MarketingCardGrid>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection variant="muted" className="pb-24">
        <MarketingContainer size="sm" className="text-left">
          <Badge
            variant="outline"
            className="mb-4 border-primary/20 bg-primary/5 px-3 py-1 text-primary"
          >
            Best practice
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Watermark the sensitive folders, not everything
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            For sensitive workflows, watermark financials, contracts, and other
            diligence-sensitive files. Keep lower-risk overview docs readable
            and low friction.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/features/nda">Add NDA gates</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/security">Read security overview</Link>
            </Button>
          </div>
          <div className="mt-8 text-sm">
            <span className="text-muted-foreground">Want the checklist? </span>
            <Link
              href="/blog/virtual-data-room-security-checklist"
              className="text-primary underline"
            >
              Read the VDR security checklist
            </Link>
            <span className="text-muted-foreground">.</span>
          </div>
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
};

export default WatermarkingFeaturePage;
