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
import { ChartBar, FolderLock, Shield } from "@phosphor-icons/react/ssr";

export const metadata: Metadata = {
  title: "Lightweight Virtual Data Rooms for M&A and Founders",
  description:
    "Run lightweight virtual data rooms for M&A diligence, founder investor rooms, legal packets, and fundraising workflows.",
  keywords: [
    "lightweight virtual data room",
    "M&A data room",
    "founder data room",
    "investor data room",
    "fundraising data room",
    "legal document sharing",
    "free virtual data room",
    "secure data room software",
    "virtual data room",
    "due diligence data room",
  ],
  alternates: { canonical: "/features/data-room" },
  openGraph: {
    type: "website",
    title: "Lightweight Virtual Data Rooms for M&A and Founders",
    description:
      "Run data rooms with modern controls for M&A, founder, legal, and fundraising workflows.",
    url: "/features/data-room",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lightweight Virtual Data Rooms for M&A and Founders",
    description:
      "Run data rooms with modern controls for M&A, founder, legal, and fundraising workflows.",
  },
};

const DataRoomFeaturePage: React.FC = () => {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Feature"
        title="Lightweight virtual data rooms for M&A teams and founders"
        subtitle="Organize deal, investor, legal, and fundraising review workflows, control access, and track engagement without sacrificing speed or privacy."
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
            <Link href="/demos/data-room-workflow">Watch demo</Link>
          </Button>
        </div>
      </MarketingHero>

      <MarketingSection className="pt-0">
        <MarketingContainer>
          <div className="max-w-3xl border-l border-primary/40 pl-6">
            <p className="text-lg text-muted-foreground">
              A data room is more than a folder. M&A teams and founders need the
              ability to gate, watermark, revoke access, and keep version
              history clean while buyers, investors, lawyers, and reviewers work
              across devices.
            </p>
          </div>

          <div className="mt-10">
            <MarketingCardGrid cols={3}>
              <GlassCard>
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FolderLock className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle>Folders + least-privilege access</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Keep “Start Here” easy, and lock down Financials, Contracts,
                    management materials, and sensitive diligence folders with
                    room-level and folder-level rules.
                  </CardDescription>
                </CardContent>
              </GlassCard>

              <GlassCard>
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Shield className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle>Gates + watermarking when it matters</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Use verification, allowlists, NDA gates, dynamic
                    watermarking, and download controls to reduce forwarding
                    risk once documents leave your team.
                  </CardDescription>
                </CardContent>
              </GlassCard>

              <GlassCard>
                <CardHeader>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ChartBar className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle>Privacy-first analytics</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    Track time-per-page, downloads, and engagement so teams know
                    what got reviewed. Identity is collected only when your
                    gates require it.
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
            Built for lightweight repeat workflows
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Ship a clean room without turning every workflow into an enterprise
            rollout
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            Start with the room structure your team already uses, then add gates
            only where they reduce risk, such as financials, investor materials,
            contracts, and sensitive attachments.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/pricing">View pricing</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/blog/virtual-data-room-security-checklist">
                Read security checklist
              </Link>
            </Button>
          </div>
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
};

export default DataRoomFeaturePage;
