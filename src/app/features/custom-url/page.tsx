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
import { LinkSimple, ShieldCheck, Sparkle } from "@phosphor-icons/react/ssr";

export const metadata: Metadata = {
  title: "Custom URLs",
  description:
    "Create clean, memorable share links with custom URL paths scoped to your workspace.",
  keywords: [
    "custom share links",
    "custom URL links",
    "branded document links",
    "virtual data room links",
  ],
  alternates: { canonical: "/features/custom-url" },
  openGraph: {
    type: "website",
    title: "Custom URLs",
    description:
      "Create clean, memorable share links with custom URL paths scoped to your workspace.",
    url: "/features/custom-url",
  },
  twitter: {
    card: "summary_large_image",
    title: "Custom URLs",
    description:
      "Create clean, memorable share links with custom URL paths scoped to your workspace.",
  },
};

const CustomUrlFeaturePage: React.FC = () => {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Feature"
        title="Custom URLs for room and document links"
        subtitle="Create clean, memorable share links with custom URL paths scoped to your workspace."
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
              Give each document or data room link a human-friendly path like{" "}
              <span className="rounded bg-muted/40 px-2 py-1 font-mono text-sm">
                /acme/board-deck
              </span>
              , while keeping the same security controls you already rely on.
            </p>
          </div>

          <div className="mt-10">
            <MarketingCardGrid cols={3}>
              <GlassCard>
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <LinkSimple className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle>Workspace-scoped paths</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Uniqueness is enforced within a workspace, so different
                    teams can use the same link path without conflicts.
                  </CardDescription>
                </CardContent>
              </GlassCard>

              <GlassCard>
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ShieldCheck className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle>All controls still apply</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Passwords, verification, allow rules, expirations, download
                    controls, and watermarks behave the same.
                  </CardDescription>
                </CardContent>
              </GlassCard>

              <GlassCard>
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Sparkle className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle>Better sharing hygiene</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Use consistent naming conventions for deals, projects, and
                    rooms so links are easier for clients to recognize and
                    verify.
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
            Share links people can trust
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            Custom URLs make it easier for recipients to confirm they are on the
            right link before they view or download.
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

export default CustomUrlFeaturePage;
