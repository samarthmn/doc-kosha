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
import {
  ChartBar,
  FileText,
  LinkSimple,
  Shield,
} from "@phosphor-icons/react/ssr";

export const metadata: Metadata = {
  title: "Secure Single-Document Sharing for Deals and Fundraising",
  description:
    "Share teaser decks, investor updates, legal packets, CIM excerpts, and sensitive documents with gated links, watermarking, and privacy-first analytics.",
  keywords: [
    "secure pitch deck sharing",
    "deal teaser sharing",
    "founder document sharing",
    "fundraising document sharing",
    "legal document sharing",
    "single document analytics",
    "secure document sharing",
  ],
  alternates: { canonical: "/features/single-document" },
  openGraph: {
    type: "website",
    title: "Secure Single-Document Sharing for Deals and Fundraising",
    description:
      "Share deal, investor, legal, and fundraising documents with gated links, watermarking, and privacy-first analytics.",
    url: "/features/single-document",
  },
  twitter: {
    card: "summary_large_image",
    title: "Secure Single-Document Sharing for Deals and Fundraising",
    description:
      "Share deal, investor, legal, and fundraising documents with gated links, watermarking, and privacy-first analytics.",
  },
};

const SingleDocumentFeaturePage: React.FC = () => {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Feature"
        title="Secure single-document sharing for deals, founders, and lawyers"
        subtitle="Send one document fast, then graduate to a room when diligence, fundraising, or legal review expands. Keep controls and analytics consistent."
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
            <Link href="/demos/single-document-sharing">Watch demo</Link>
          </Button>
        </div>
      </MarketingHero>

      <MarketingSection className="pt-0">
        <MarketingContainer>
          <div className="max-w-3xl border-l border-primary/40 pl-6">
            <p className="text-lg text-muted-foreground">
              Early sharing is still signal creation. A clean viewer, simple
              gates, and high-signal analytics help M&A teams, founders,
              lawyers, and fundraising teams follow up without guessing.
            </p>
          </div>

          <div className="mt-10">
            <MarketingCardGrid cols={3}>
              <GlassCard>
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <LinkSimple className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle>Gated links</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Add verification, allowlists, expiry, and download rules so
                    a forwarded link does not become a leak.
                  </CardDescription>
                </CardContent>
              </GlassCard>

              <GlassCard>
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Shield className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle>Watermarking + download control</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Deter casual screenshots and keep downloads intentional when
                    you share sensitive numbers, legal terms, or investor
                    materials.
                  </CardDescription>
                </CardContent>
              </GlassCard>

              <GlassCard>
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ChartBar className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle>Analytics you can act on</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Track time-per-page, return visits, and downloads. Use the
                    signals to prioritize follow-ups without over-collecting.
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
            When diligence starts
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Graduate from “one doc” to “one room”
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            Once you are sharing a model, contracts, investor materials, and
            diligence support files, room-first organization beats one-off
            links.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/features/data-room">Explore data rooms</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/blog/dockosha-vs-docsend">Read comparison</Link>
            </Button>
          </div>
          <div className="mt-8 flex items-center gap-2 text-sm">
            <FileText aria-hidden className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Want the playbook? </span>
            <Link
              href="/blog/secure-document-sharing-playbook-2025"
              className="text-primary underline"
            >
              Secure sharing playbook
            </Link>
          </div>
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
};

export default SingleDocumentFeaturePage;
