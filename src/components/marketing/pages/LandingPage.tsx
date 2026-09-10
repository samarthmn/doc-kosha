"use client";

import React from "react";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Briefcase,
  Buildings,
  ChartBar,
  Clock,
  Eye,
  FileText,
  FolderOpen,
  Globe,
  Lock,
  Scales,
  Scroll,
  Shield,
  Users,
} from "@phosphor-icons/react";
import HeroCTAButtons from "@/components/landingPage/HeroCTAButtons";
import Link from "next/link";
import landingCopy from "@/content/landing.json";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHero from "@/components/marketing/MarketingHero";
import GlassCard from "@/components/marketing/GlassCard";
import {
  ArcadeProductDemo,
  ArcadeProductDemoProvider,
} from "@/components/productDemo/ArcadeProductDemo";
import MarketingSection from "@/components/marketing/layout/MarketingSection";
import MarketingContainer from "@/components/marketing/layout/MarketingContainer";
import MarketingCardGrid from "@/components/marketing/layout/MarketingCardGrid";
import { TestimonialsSection } from "@/components/marketing/TestimonialsSection";
import { useMarketingAnalytics } from "@/components/analytics/PostHogMarketing";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import {
  LANDING_PAGE_PATH,
  LANDING_PAGE_SOURCE,
} from "@/lib/analytics/landingAttribution";

const LANDING_HERO_HEADLINE = "Virtual data rooms for M&A teams and founders";
const LANDING_HERO_SUBHEAD = landingCopy.hero.subtext;
const landingAttribution = { source: LANDING_PAGE_SOURCE } as const;

const LandingPageContent: React.FC = () => {
  const { trackMarketingEvent } = useMarketingAnalytics();
  const isAuthenticated = useGlobalStore((s) => s.isAuthenticated);
  // Keys are the icon names authored in src/content/landing.json; values are the
  // Phosphor components they render as.
  const iconMap = {
    Shield,
    Eye,
    FileText,
    Users,
    BarChart3: ChartBar,
    Clock,
    Lock,
    ScrollText: Scroll,
    Globe2: Globe,
  } as const;

  const handleHeroPrimaryClick = () => {
    trackMarketingEvent("landing_primary_cta_clicked", {
      page: LANDING_PAGE_PATH,
      placement: "hero",
    });
  };

  const handleHeroSecondaryClick = () => {
    trackMarketingEvent("landing_secondary_cta_clicked", {
      page: LANDING_PAGE_PATH,
      placement: "hero",
      target: "demo",
    });
  };

  const trackSectionCta = (placement: string, target: string) => {
    trackMarketingEvent("landing_section_cta_clicked", {
      page: LANDING_PAGE_PATH,
      placement,
      target,
    });
  };

  const trackResourceClick = (target: string) => {
    trackMarketingEvent("landing_resource_clicked", {
      page: LANDING_PAGE_PATH,
      placement: "resource_grid",
      target,
    });
  };

  return (
    <>
      <MarketingHero
        badge={landingCopy.hero.badge}
        titleScale="display"
        title={
          <span className="block text-balance">{LANDING_HERO_HEADLINE}</span>
        }
        subtitle={undefined}
        className="pb-16 lg:pb-20"
      >
        <div className="flex flex-col items-start gap-8">
          <div className="flex max-w-3xl flex-col items-start gap-6">
            <p className="min-h-[112px] max-w-[58ch] text-[1.0625rem] leading-7 text-muted-foreground md:min-h-[84px]">
              {LANDING_HERO_SUBHEAD}
            </p>

            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <HeroCTAButtons
                attribution={landingAttribution}
                onPrimaryClick={handleHeroPrimaryClick}
                showMicrocopy={false}
              />
              <ArcadeProductDemo
                triggerLabel="See the walkthrough"
                buttonVariant="outline"
                buttonClassName="bg-background/60 backdrop-blur-sm"
                onTriggerClick={handleHeroSecondaryClick}
              />
            </div>
            {!isAuthenticated ? (
              <p className="text-sm text-muted-foreground">
                Free forever plan now available.
              </p>
            ) : null}

            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Our application is open source under AGPL-3.0-or-later. Cloud is
              available now; independent self-hosting is not yet available.{" "}
              <Link
                href="/blog/dockosha-open-source"
                className="rounded-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Read the open-source announcement
              </Link>
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Best fit for:
              </span>
              <Link
                href="#who-this-is-for"
                className="rounded-sm border border-primary/25 bg-transparent px-2.5 py-1 text-sm text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:outline-solid"
              >
                M&amp;A advisors
              </Link>
              <Link
                href="#who-this-is-for"
                className="rounded-sm border border-primary/25 bg-transparent px-2.5 py-1 text-sm text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:outline-solid"
              >
                Founders
              </Link>
              <Link
                href="#who-this-is-for"
                className="rounded-sm border border-primary/25 bg-transparent px-2.5 py-1 text-sm text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:outline-solid"
              >
                Lawyers and fundraising
              </Link>
            </div>
          </div>

          <div className="relative mt-8 w-full max-w-5xl">
            <div className="pointer-events-none absolute -inset-6 -z-10 bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--primary)_12%,transparent),transparent_68%)]" />
            <div className="relative overflow-hidden rounded-lg border border-border bg-[var(--dk-surface-raised)] [box-shadow:var(--dk-shadow-card)]">
              <div className="h-8 border-b border-border bg-muted/20" />
              <div className="flex aspect-video w-full items-center justify-center bg-background/50">
                <div className="flex flex-col items-center gap-3 px-6 text-center">
                  <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                    Watch how a team can launch a secure room, share sensitive
                    deal files with gated links, and track engagement without
                    adding enterprise-process overhead.
                  </p>
                  <ArcadeProductDemo
                    triggerLabel="Watch interactive walkthrough"
                    onTriggerClick={handleHeroSecondaryClick}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </MarketingHero>

      <MarketingSection>
        <MarketingContainer>
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <h2 className="max-w-[18ch] text-3xl leading-[1.12] font-medium tracking-[-0.03em] sm:text-4xl">
              Built for teams that share high-stakes documents.
              <br />
              <span className="text-muted-foreground">
                M&A teams and founders first. Lawyers and fundraising next.
              </span>
            </h2>
            <p className="max-w-[58ch] text-[1.0625rem] leading-7 text-muted-foreground lg:pt-1">
              DocKosha is built for M&A diligence and founder investor rooms,
              with a Free plan for controlled PDF sharing before a full room
              workflow.
            </p>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection
        id="who-this-is-for"
        className="border-y-0 bg-[#262a60] [background-image:radial-gradient(ellipse_at_85%_-30%,#353b80,transparent_62%)] py-20 text-[#f3f5fe] lg:py-24"
      >
        <MarketingContainer>
          <div className="mb-12 grid gap-5 lg:grid-cols-[0.65fr_1fr] lg:items-end">
            <h2 className="text-3xl font-medium tracking-[-0.03em] text-[#f3f5fe] sm:text-4xl">
              Who this is for
            </h2>
            <p className="max-w-[58ch] text-[0.9375rem] leading-7 text-[#cfd3e5]">
              Built primarily for M&A teams and founders preparing confidential
              review rooms. The same controls also help lawyers and fundraising
              teams share sensitive documents without opening a full enterprise
              VDR.
            </p>
          </div>

          <MarketingCardGrid cols={4}>
            {[
              {
                icon: Buildings,
                title: "M&A advisors and deal teams",
                description:
                  "Stand up sell-side, buy-side, and diligence rooms quickly without pulling your team into an enterprise admin project.",
              },
              {
                icon: Briefcase,
                title: "Founders preparing investor rooms",
                description:
                  "Share pitch decks, financials, cap tables, legal packets, and diligence folders with control beyond a one-off deck link.",
              },
              {
                icon: FolderOpen,
                title: "Fundraising teams",
                description:
                  "Move from simple deck sharing into room workflows when investors ask for more documents, updates, and follow-up signals.",
              },
              {
                icon: Scales,
                title: "Lawyers and legal teams",
                description:
                  "Share contracts, diligence requests, board materials, and client packets with gates, watermarking, and download controls.",
              },
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <GlassCard
                  key={item.title}
                  className="flex flex-col border-[#b2b6ca]/25 bg-white/[0.04] shadow-none hover:border-[#d2cefd]/60 hover:bg-white/[0.08]"
                >
                  <CardHeader>
                    <div className="mb-8 flex items-start justify-between">
                      <span
                        aria-hidden="true"
                        className="text-xs font-medium tracking-[0.12em] text-[#d2cefd]"
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <Icon className="size-5 text-[#d2cefd]" aria-hidden />
                    </div>
                    <CardTitle className="text-lg font-medium text-[#f3f5fe]">
                      {item.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <CardDescription className="text-sm leading-6 text-[#cfd3e5]">
                      {item.description}
                    </CardDescription>
                  </CardContent>
                </GlassCard>
              );
            })}
          </MarketingCardGrid>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection id="workflow-pain" variant="muted">
        <MarketingContainer>
          <div className="mb-12 grid gap-5 lg:grid-cols-[0.65fr_1fr] lg:items-end">
            <div>
              <Badge
                variant="outline"
                className="mb-5 rounded-sm border-primary/25 bg-transparent px-2.5 py-1 text-[0.6875rem] tracking-[0.1em] text-primary uppercase"
              >
                Common Workflow Pain
              </Badge>
              <h2 className="text-3xl font-medium tracking-[-0.03em] sm:text-4xl">
                The gap is not security. It is workflow fit.
              </h2>
            </div>
            <p className="max-w-[58ch] text-[0.9375rem] leading-7 text-muted-foreground">
              M&A teams and founders usually get pushed toward one of two bad
              options: heavy VDR tools that slow lean processes down, or
              lightweight sharing tools that lose control once diligence gets
              real.
            </p>
          </div>

          <MarketingCardGrid cols={3}>
            {[
              {
                title: "Room setup takes too much effort",
                description:
                  "Lean deal teams should not need enterprise rollout overhead to publish a secure room for one mandate.",
              },
              {
                title: "Client-facing controls are inconsistent",
                description:
                  "Permissions, NDA gating, download rules, and watermarking should be easy to apply before deal files move externally.",
              },
              {
                title: "Follow-up depends on guesswork",
                description:
                  "Advisors need to know what was opened, revisited, or downloaded so buyer and client follow-up is based on signal.",
              },
            ].map((item) => (
              <GlassCard key={item.title}>
                <CardHeader>
                  <CardTitle className="text-xl">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base leading-relaxed">
                    {item.description}
                  </CardDescription>
                </CardContent>
              </GlassCard>
            ))}
          </MarketingCardGrid>

          <div className="mt-10 flex">
            <Link
              href="/features/data-room"
              onClick={() =>
                trackSectionCta("workflow_pain", "data_room_feature_page")
              }
              className="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:text-primary/80 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:outline-solid"
            >
              See the data room workflow
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection>
        <MarketingContainer>
          <div className="mb-12 grid gap-5 lg:grid-cols-[0.65fr_1fr] lg:items-end">
            <h2 className="text-3xl font-medium tracking-[-0.03em] sm:text-4xl">
              Why M&A teams and founders switch to DocKosha
            </h2>
            <p className="max-w-[58ch] text-[0.9375rem] leading-7 text-muted-foreground">
              Keep the controls that matter while removing the drag that slows
              smaller deal, investor, and legal review rooms down.
            </p>
          </div>

          <div className="border-t border-border/70">
            {landingCopy.features.map((feature, index) => {
              const Icon =
                iconMap[feature.icon as keyof typeof iconMap] ?? FileText;
              return (
                <GlassCard
                  key={feature.title}
                  className="grid rounded-none border-x-0 border-t-0 border-b-border/70 bg-transparent shadow-none hover:bg-primary/[0.025] md:grid-cols-[7rem_minmax(14rem,0.8fr)_minmax(0,1fr)] md:items-start"
                >
                  <CardHeader className="contents">
                    <div className="flex items-center justify-between px-6 pt-6 md:px-4 md:py-8">
                      <span
                        aria-hidden="true"
                        className="text-sm font-medium text-primary tabular-nums"
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <Icon
                        className="size-4 text-primary md:hidden"
                        aria-hidden
                      />
                    </div>
                    <CardTitle className="px-6 pt-3 text-xl leading-7 font-medium md:px-4 md:py-8">
                      {feature.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-6 pt-3 pb-6 md:px-4 md:py-8">
                    <CardDescription className="max-w-[58ch] text-[0.9375rem] leading-7">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </GlassCard>
              );
            })}
          </div>
        </MarketingContainer>
      </MarketingSection>

      <TestimonialsSection />

      <MarketingSection id="smaller-repeat-deals" variant="muted">
        <MarketingContainer>
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <GlassCard className="h-full p-8">
              <Badge
                variant="outline"
                className="mb-4 border-primary/20 bg-primary/5 px-3 py-1 text-primary"
              >
                Fit For Lean External Review
              </Badge>
              <h2 className="text-3xl font-medium tracking-[-0.03em] md:text-4xl">
                Built for repeat M&A rooms and founder diligence
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                Start on Free for lightweight PDF sharing, then move to paid
                plans when your team needs full file support, more members,
                larger storage, branding, or custom domains.
              </p>
              <div className="mt-6 space-y-4">
                {[
                  "Launch a room quickly for a deal, investor process, or legal packet.",
                  "Keep buyers, investors, clients, and counsel in a polished experience instead of generic file folders.",
                  "Use watermarking, NDA gates, permissions, and analytics where they reduce risk.",
                  "Let lighter fundraising or legal shares start with secure document sharing before they need a full room.",
                ].map((item) => (
                  <div key={item} className="flex gap-3">
                    <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      •
                    </div>
                    <p className="leading-relaxed text-muted-foreground">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="h-full p-8">
              <h3 className="text-2xl font-semibold tracking-tight">
                Advisory-friendly controls in one workflow
              </h3>
              <div className="mt-6 space-y-4">
                {[
                  {
                    title: "Before sharing",
                    body: "Prepare documents, redact sensitive PDF content through DocYantra 0.0.26, and keep folder access organized.",
                  },
                  {
                    title: "At launch",
                    body: "Apply email gates, NDA terms, expirations, download rules, and watermarking at the room or document level.",
                  },
                  {
                    title: "During diligence",
                    body: "Track engagement, review downloads, and keep internal accountability with owner-only audit logs.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-md border border-border/70 p-4"
                  >
                    <div className="font-semibold text-foreground">
                      {item.title}
                    </div>
                    <div className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {item.body}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/pricing"
                  onClick={() =>
                    trackSectionCta("smaller_repeat_deals", "pricing")
                  }
                  className="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:text-primary/80 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:outline-solid"
                >
                  See ICP-friendly pricing
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/security"
                  onClick={() =>
                    trackSectionCta("smaller_repeat_deals", "security")
                  }
                  className="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:text-primary/80 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:outline-solid"
                >
                  Review security controls
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </GlassCard>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection>
        <MarketingContainer>
          <div className="mb-12 grid gap-5 lg:grid-cols-[0.65fr_1fr] lg:items-end">
            <h2 className="text-3xl font-medium tracking-[-0.03em] md:text-4xl">
              Explore key pages
            </h2>
            <p className="max-w-[58ch] text-[0.9375rem] leading-7 text-muted-foreground">
              Learn how DocKosha supports M&A rooms, founder investor rooms,
              secure document sharing, pricing, and security.
            </p>
          </div>

          <MarketingCardGrid cols={3}>
            {[
              {
                badge: "Workflow",
                title: "M&A and founder data room workflow",
                description:
                  "See how DocKosha handles room setup, file controls, and viewer access from first share to diligence or investor follow-up.",
                href: "/features/data-room",
              },
              {
                badge: "Controls",
                title: "Security controls",
                description:
                  "Review the plain-English security story for sensitive deal files, legal packets, and secure document sharing.",
                href: "/security",
              },
              {
                badge: "Pricing",
                title: "Free-first pricing",
                description:
                  "Understand what Free includes for lightweight sharing and what unlocks for active room workflows.",
                href: "/pricing",
              },
            ].map((item) => (
              <GlassCard key={item.href} className="group h-full">
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Badge
                      variant="outline"
                      className="border-primary/20 bg-primary/5 text-primary"
                    >
                      {item.badge}
                    </Badge>
                    <span className="text-xs font-medium text-muted-foreground">
                      Read
                    </span>
                  </div>
                  <CardTitle className="text-xl">
                    <Link
                      href={item.href}
                      onClick={() => trackResourceClick(item.href)}
                      className="rounded-sm underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:outline-solid"
                    >
                      {item.title}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base leading-relaxed">
                    {item.description}
                  </CardDescription>
                </CardContent>
              </GlassCard>
            ))}
          </MarketingCardGrid>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection className="py-28 lg:py-32">
        <MarketingContainer size="sm" className="relative z-10">
          <h2 className="mb-6 text-4xl leading-[1.1] font-medium tracking-[-0.035em] md:text-5xl">
            Build your next M&A or founder data room. Start free when sharing is
            lighter.
          </h2>
          <p className="mb-10 max-w-2xl text-[1.0625rem] leading-7 text-muted-foreground">
            Use gates, watermarking, and privacy-first analytics for deal rooms,
            investor rooms, legal packets, and everyday controlled document
            sharing.
          </p>
          <HeroCTAButtons attribution={landingAttribution} />
        </MarketingContainer>
      </MarketingSection>
    </>
  );
};

const LandingPage: React.FC = () => {
  return (
    <MarketingShell>
      <ArcadeProductDemoProvider>
        <LandingPageContent />
      </ArcadeProductDemoProvider>
    </MarketingShell>
  );
};

export default LandingPage;
