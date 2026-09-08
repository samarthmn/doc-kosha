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
import { Clock, Signature, UserCheck } from "@phosphor-icons/react/ssr";

export const metadata: Metadata = {
  title: "NDA Gate",
  description:
    "Require NDA acceptance before viewing sensitive diligence and client-facing documents. Keep sharing fast while reducing forwarding risk.",
  keywords: [
    "NDA gate",
    "data room NDA",
    "virtual data room NDA",
    "m&a data room nda",
  ],
  alternates: { canonical: "/features/nda" },
  openGraph: {
    type: "website",
    title: "NDA Gate",
    description:
      "Require NDA acceptance before viewing sensitive diligence and client-facing documents.",
    url: "/features/nda",
  },
  twitter: {
    card: "summary_large_image",
    title: "NDA Gate",
    description:
      "Require NDA acceptance before viewing sensitive diligence and client-facing documents.",
  },
};

const NdaFeaturePage: React.FC = () => {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Feature"
        title="NDA gates for sensitive document rooms"
        subtitle="Turn implied trust into explicit trust without adding unnecessary friction to client-facing review workflows."
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
            <Link href="/demos/nda-gate-and-otp">Watch demo</Link>
          </Button>
        </div>
      </MarketingHero>

      <MarketingSection className="pt-0">
        <MarketingContainer>
          <div className="max-w-3xl border-l border-primary/40 pl-6">
            <p className="text-lg text-muted-foreground">
              The goal of an NDA gate is simple: set expectations and reduce
              careless forwarding. Use it for financials, contracts, and
              sensitive diligence material, not for every low-risk document.
            </p>
          </div>

          <div className="mt-10">
            <MarketingCardGrid cols={3}>
              <GlassCard>
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Signature className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle>NDA acceptance before file access</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Gate access so viewers must accept your NDA terms before
                    viewing sensitive content.
                  </CardDescription>
                </CardContent>
              </GlassCard>

              <GlassCard>
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <UserCheck className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle>Combine with verification</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Pair NDA gates with email verification or allowlists so
                    agreements are tied to a real viewer identity.
                  </CardDescription>
                </CardContent>
              </GlassCard>

              <GlassCard>
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Clock className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle>Works with expiry and revocation</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Keep access time-bound with expirations and revocable links,
                    so rooms don’t stay open forever.
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
            Practical guidance
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Gate only what is truly sensitive
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            Keep “Start Here” low friction. Add NDA gates before Financials,
            Contracts, and other sensitive diligence folders to reduce risk.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/features/data-room">Explore data rooms</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/security">Read security overview</Link>
            </Button>
          </div>
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
};

export default NdaFeaturePage;
