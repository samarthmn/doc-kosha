import type { Metadata } from "next";
import Link from "next/link";
import {
  Broadcast,
  Cloud,
  Database,
  Envelope,
  Gauge,
  GitBranch,
  Globe,
  HardDrives,
  Lock,
  Scales,
  ShieldCheck,
  Terminal,
} from "@phosphor-icons/react/ssr";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHero from "@/components/marketing/MarketingHero";
import MarketingSection from "@/components/marketing/layout/MarketingSection";
import MarketingContainer from "@/components/marketing/layout/MarketingContainer";
import MarketingCardGrid from "@/components/marketing/layout/MarketingCardGrid";
import GlassCard from "@/components/marketing/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Canonical UTM-tagged Cloud destination for the hosted-vs-self-hosted CTA.
 * Every Cloud CTA on this page uses this exact URL.
 */
const CLOUD_CTA_HREF =
  "https://dockosha.com/auth/sign-in?redirect=%2Fonboarding&utm_source=product&utm_medium=marketing&utm_campaign=product-docs";

export const metadata: Metadata = {
  title: "Hosted vs Self-Hosted | DocKosha",
  description:
    "An honest comparison of DocKosha's public source and managed DocKosha Cloud: what is available today, what the source license permits, and what Cloud operates for customers.",
  alternates: { canonical: "/hosted-vs-self-hosted" },
  keywords: [
    "self-hosted virtual data room",
    "AGPL document sharing",
    "self-host vs cloud",
    "AGPL data room",
    "DocKosha self-hosting",
  ],
  openGraph: {
    type: "website",
    title: "DocKosha: hosted or self-hosted",
    description:
      "What DocKosha source publication means today, what DocKosha Cloud operates, and what is not currently available externally.",
    url: "/hosted-vs-self-hosted",
  },
  twitter: {
    card: "summary_large_image",
    title: "DocKosha: hosted or self-hosted",
    description:
      "What DocKosha source publication means today, what DocKosha Cloud operates, and what is not currently available externally.",
  },
};

const selfHostFit = [
  "You want to inspect the public DocKosha source under the AGPL-3.0-or-later license.",
  "You want to review the architecture and contribute improvements.",
  "You understand that external self-hosting is not currently available.",
  "You do not need external access to the private DocYantra dependency.",
] as const;

const cloudFit = [
  "Operating the stack is not how your team wants to spend its week.",
  "You want upgrades, backups, deliverability, and custom-domain certificates handled for you.",
  "You want the DocYantra processing path already operated inside Cloud.",
  "You would rather pay a subscription than carry an on-call rotation.",
] as const;

const operatorDuties = [
  {
    title: "Upgrades and migrations",
    icon: GitBranch,
    body: "Releases ship with database migrations. Taking a version means reading the release notes, applying migrations in the same change, and having a way back. It is a recurring calendar item, not a one-time install.",
  },
  {
    title: "Backups you have actually restored",
    icon: Database,
    body: "Provisioning Postgres is the easy half. The half that matters is a restore you have rehearsed into a scratch environment on a schedule you trust, because a data room is the wrong place to discover an untested backup.",
  },
  {
    title: "Object storage and its bill",
    icon: HardDrives,
    body: "A bucket, its CORS configuration, credentials, lifecycle rules, and its own backups. Document storage grows in one direction, so someone owns retention policy and cost as the room count climbs.",
  },
  {
    title: "Email deliverability",
    icon: Envelope,
    body: "Access gates that mail one-time passcodes are exactly as reliable as your SMTP path. SPF, DKIM, DMARC, and the sending domain's reputation are yours. This is the duty operators underestimate most often, not because it is hard but because it fails quietly.",
  },
  {
    title: "Custom-domain infrastructure",
    icon: Globe,
    body: "Serving rooms on a customer's own domain needs wildcard DNS, automated certificate issuance, and a router in front of the app. DocKosha ships that router as a Cloudflare Worker; a future operator would need to account for that infrastructure.",
  },
  {
    title: "Secrets and transport security",
    icon: Lock,
    body: "Generating, storing, and rotating the cookie secret, service-role keys, and SMTP credentials, plus TLS termination and the proxy in front of the Node process. Nothing in the repository generates or escrows a secret for you.",
  },
  {
    title: "Availability and monitoring",
    icon: Gauge,
    body: "Process supervision, log capture, alerting, and capacity planning would be future operator considerations. No external self-hosting support is currently available.",
  },
  {
    title: "Legal and regulatory duties",
    icon: Scales,
    body: "Retention, data-subject requests, and regulatory obligations for the documents your users store would be future operator considerations if an external deployment becomes available.",
  },
] as const;

const responsibilitySplit = [
  {
    concern: "Upgrades and migrations",
    selfHosted:
      "Future operator reference only; external runtime unavailable today.",
    cloud: "Applied by DocKosha; nothing for you to schedule.",
  },
  {
    concern: "Database and backups",
    selfHosted:
      "Future operator reference only; external runtime unavailable today.",
    cloud: "Managed and backed up as part of the service.",
  },
  {
    concern: "Object storage",
    selfHosted:
      "Future operator reference only; external runtime unavailable today.",
    cloud: "Included in the plan's storage allowance.",
  },
  {
    concern: "Email deliverability",
    selfHosted:
      "Future operator reference only; external runtime unavailable today.",
    cloud: "Sent over DocKosha's sending domain, which we maintain.",
  },
  {
    concern: "Custom domains",
    selfHosted:
      "Future operator reference only; external runtime unavailable today.",
    cloud: "Configured in the app on paid plans.",
  },
  {
    concern: "TLS and secret rotation",
    selfHosted:
      "Future operator reference only; external runtime unavailable today.",
    cloud: "Managed by DocKosha.",
  },
  {
    concern: "Monitoring and on-call",
    selfHosted:
      "Future operator reference only; external runtime unavailable today.",
    cloud: "DocKosha's.",
  },
  {
    concern: "Support",
    selfHosted: "No external self-hosting support is currently available.",
    cloud:
      "Commercial support and service-level agreements are paid artifacts, available through Cloud or a separate agreement.",
  },
  {
    concern: "DocYantra engine",
    selfHosted:
      "Unavailable to external users while the private DocYantra dependency remains internal.",
    cloud: "Already running; no separate key to buy.",
  },
  {
    concern: "What it costs",
    selfHosted:
      "Future operator reference only; no external runtime is available today.",
    cloud: "A subscription; the plan tiers are on the pricing page.",
  },
] as const;

const identicalOnBothPaths = [
  {
    title: "Safety-critical capability stays in the DocKosha application",
    icon: ShieldCheck,
    body: "Link gates (password, one-time passcode, expiry, revocation, open-once, allowlists and blocklists), data rooms with room, folder, and document access lists, static and dynamic burned-in watermarking, the NDA gate, DocYantra-backed redaction, the audit log, analytics, and version history are all part of the DocKosha application. Authorization, security, and evidence quality do not depend on a separate edition. That is a design rule, not a promotion.",
  },
  {
    title: "Watermarks are burned into the delivered bytes",
    icon: Lock,
    body: "Watermarking runs server-side in the current DocKosha Cloud product and is burned into the PDF bytes that get delivered. It is not an overlay drawn on top of the page in the browser, so it survives the file leaving the viewer.",
  },
  {
    title: "Screenshot protection is a deterrent, and we say so",
    icon: Broadcast,
    body: "No browser can block an operating system's screen capture, and none can stop a phone camera pointed at the monitor. The screenshot controls raise the effort and leave a trail; they do not make a document uncopyable. We would rather you know that before the deal than after it.",
  },
  {
    title: "Conversion fails closed, never degraded",
    icon: Terminal,
    body: "In the current DocKosha Cloud product, work outside the validated format, size, and fidelity envelope fails with a typed reason and the viewer serves the original file unchanged. It never renders a partial approximation and calls it a success.",
  },
] as const;

const editionCapabilities = [
  "Custom domains and white-label branding",
  "User groups and group-based access rules",
  "Advanced analytics: per-page dwell, country, media sections, exports",
  "Versioning retention policies",
] as const;

const HostedVsSelfHostPage: React.FC = () => {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Hosted vs self-hosted"
        title={
          <>
            Read the source, or
            <span className="text-primary"> use Cloud</span>
          </>
        }
        subtitle="DocKosha source is public under AGPL-3.0-or-later for reading and contribution. External self-hosting is not currently available because the mandatory DocYantra dependency is private; DocKosha Cloud is the available hosted product."
      >
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Button asChild size="lg" className="h-12 px-8 text-base">
            <a href={CLOUD_CTA_HREF}>Start on DocKosha Cloud</a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 bg-background/50 px-8 text-base backdrop-blur-sm"
          >
            <a href="#what-self-hosting-costs">What self-hosting costs</a>
          </Button>
        </div>
      </MarketingHero>

      <MarketingSection variant="muted" className="pb-20">
        <MarketingContainer>
          <div className="mb-12 grid gap-6 lg:grid-cols-[0.7fr_1fr] lg:items-end">
            <h2 className="text-3xl font-medium tracking-[-0.03em] md:text-4xl">
              The short version
            </h2>
            <p className="max-w-[58ch] text-[0.9375rem] leading-7 text-muted-foreground">
              The source is public for reading and contribution, but external
              self-hosting is not currently available. DocKosha Cloud is the
              supported way to use the product today.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <GlassCard className="p-6 md:p-8">
              <CardHeader className="p-0 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Terminal aria-hidden className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-xl">
                    Read and contribute to the public source if
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-0 text-sm leading-relaxed text-muted-foreground">
                <ul className="space-y-2">
                  {selfHostFit.map((line) => (
                    <li key={line} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </GlassCard>

            <GlassCard className="p-6 md:p-8">
              <CardHeader className="p-0 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Cloud aria-hidden className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-xl">
                    Use DocKosha Cloud if
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-0 text-sm leading-relaxed text-muted-foreground">
                <ul className="space-y-2">
                  {cloudFit.map((line) => (
                    <li key={line} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </GlassCard>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection id="what-self-hosting-costs" className="scroll-mt-24">
        <MarketingContainer>
          <div className="mb-12 grid gap-6 lg:grid-cols-[0.7fr_1fr] lg:items-end">
            <h2 className="text-3xl font-medium tracking-[-0.03em] md:text-4xl">
              What a future self-hosting path would involve
            </h2>
            <p className="max-w-[58ch] text-[0.9375rem] leading-7 text-muted-foreground">
              These are maintainer reference notes for a possible future
              self-hosting path, not instructions or an offer available today.
            </p>
          </div>

          <MarketingCardGrid cols={4}>
            {operatorDuties.map((duty) => {
              const Icon = duty.icon;
              return (
                <GlassCard key={duty.title} className="h-full">
                  <CardHeader className="space-y-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                      <Icon aria-hidden className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg font-medium">
                      {duty.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-relaxed text-muted-foreground">
                    {duty.body}
                  </CardContent>
                </GlassCard>
              );
            })}
          </MarketingCardGrid>

          <p className="mt-8 max-w-[70ch] text-sm leading-7 text-muted-foreground">
            The repository ships public source and maintainer reference
            material. It does not currently ship an externally runnable
            deployment or DocYantra access.
          </p>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection variant="muted">
        <MarketingContainer>
          <div className="mb-12 grid gap-6 lg:grid-cols-[0.7fr_1fr] lg:items-end">
            <h2 className="text-3xl font-medium tracking-[-0.03em] md:text-4xl">
              What is available today
            </h2>
            <p className="max-w-[58ch] text-[0.9375rem] leading-7 text-muted-foreground">
              There is one supported route today: DocKosha Cloud. The source is
              public for review and contribution; a runnable external route is
              not currently available.
            </p>
          </div>

          <GlassCard className="overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border/70 bg-muted/40">
                      <th scope="col" className="px-6 py-4 font-medium">
                        Concern
                      </th>
                      <th scope="col" className="px-6 py-4 font-medium">
                        Public source (runtime unavailable)
                      </th>
                      <th scope="col" className="px-6 py-4 font-medium">
                        DocKosha Cloud
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {responsibilitySplit.map((row) => (
                      <tr
                        key={row.concern}
                        className="border-b border-border/60 last:border-b-0"
                      >
                        <th
                          scope="row"
                          className="px-6 py-5 align-top font-medium text-foreground"
                        >
                          {row.concern}
                        </th>
                        <td className="px-6 py-5 align-top text-muted-foreground">
                          {row.selfHosted}
                        </td>
                        <td className="px-6 py-5 align-top text-muted-foreground">
                          {row.cloud}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </GlassCard>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection>
        <MarketingContainer>
          <div className="mb-12 grid gap-6 lg:grid-cols-[0.7fr_1fr] lg:items-end">
            <h2 className="text-3xl font-medium tracking-[-0.03em] md:text-4xl">
              What the Cloud product provides
            </h2>
            <p className="max-w-[58ch] text-[0.9375rem] leading-7 text-muted-foreground">
              These are the product guarantees available through DocKosha Cloud.
            </p>
          </div>

          <MarketingCardGrid cols={2}>
            {identicalOnBothPaths.map((fact) => {
              const Icon = fact.icon;
              return (
                <GlassCard key={fact.title} className="h-full p-6 md:p-8">
                  <CardHeader className="p-0 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Icon aria-hidden className="h-5 w-5 text-primary" />
                      </div>
                      <CardTitle className="text-xl">{fact.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 text-sm leading-relaxed text-muted-foreground">
                    {fact.body}
                  </CardContent>
                </GlassCard>
              );
            })}
          </MarketingCardGrid>

          <GlassCard className="mt-6 p-6 md:p-8">
            <CardHeader className="p-0 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Scales aria-hidden className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-xl">
                  What the public source and Cloud product include
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-0 text-sm leading-relaxed text-muted-foreground">
              <p>
                DocKosha source is published under AGPL-3.0-or-later. The Cloud
                product provides the hosted feature set, including:
              </p>
              <ul className="space-y-2">
                {editionCapabilities.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p>
                The capability matrix also names later roadmap items such as
                SSO/SAML and MFA enforcement; those are not shipped, so treat
                them as roadmap rather than as something you are buying.
              </p>
              <p>
                DocYantra is the private mandatory direct `0.0.25` dependency
                for the validated Office and PDF path. Enterprise terms require
                a separate signed agreement and do not imply engine access; see{" "}
                <Link href="/pricing" className="text-primary underline">
                  pricing
                </Link>{" "}
                for that path.
              </p>
            </CardContent>
          </GlassCard>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection variant="muted">
        <MarketingContainer size="sm">
          <div className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-3xl font-medium tracking-[-0.03em] md:text-4xl">
                Source publication does not create a deployment
              </h2>
              <p className="text-lg leading-relaxed text-muted-foreground">
                The public repository is available for review and contribution,
                but it is not currently an externally runnable deployment.
              </p>
            </div>

            <GlassCard className="p-6 md:p-8">
              <CardHeader className="p-0 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Broadcast aria-hidden className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-xl">
                    What source publication does and does not provide
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-0 text-sm leading-relaxed text-muted-foreground">
                <ul className="space-y-2">
                  <li className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>
                      Telemetry and marketing analytics are opt-in and
                      environment-gated. Leave their variables unset and those
                      integrations are inert.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>
                      External users do not receive private DocYantra package
                      access, tokens, SDKs, APIs, or engine licenses.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>
                      The public repository is not an externally runnable
                      distribution today; there is no external installation to
                      count.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>
                      The claim is meant to be checked rather than trusted: grep
                      the source for DocKosha-owned endpoints, then read{" "}
                      <code>env.example</code> for every configurable network
                      boundary.
                    </span>
                  </li>
                </ul>
              </CardContent>
            </GlassCard>

            <GlassCard className="p-6 md:p-8">
              <CardHeader className="p-0 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Globe aria-hidden className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-xl">
                    Cloud is different, and here is exactly how
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-0 text-sm leading-relaxed text-muted-foreground">
                <p>
                  DocKosha Cloud is a hosted service we operate, so the it runs
                  viewer and product analytics under consent:
                </p>
                <ul className="space-y-2">
                  <li className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>
                      Consent is regional. Visitors in the EU, EEA, and UK — and
                      any visitor whose region cannot be determined — get
                      nothing until they explicitly opt in.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>
                      Elsewhere, analytics default to granted with a
                      straightforward opt-out.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>
                      A Global Privacy Control signal always wins, whatever the
                      region says.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>
                      Raw IP addresses are never stored by the current
                      application.
                    </span>
                  </li>
                </ul>
                <p>
                  The{" "}
                  <Link href="/security" className="text-primary underline">
                    security page
                  </Link>{" "}
                  covers the rest of what Cloud does with data.
                </p>
              </CardContent>
            </GlassCard>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection className="pt-20 pb-24">
        <MarketingContainer>
          <div className="relative overflow-hidden rounded-lg border border-primary/25 bg-primary/[0.045] px-6 py-12 md:px-12 md:py-16">
            <div className="pointer-events-none absolute -top-24 right-0 size-64 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative z-10 max-w-3xl space-y-6">
              <h2 className="text-3xl font-medium tracking-[-0.03em] md:text-4xl">
                Pick the path that fits your week
              </h2>
              <p className="max-w-2xl text-[0.9375rem] leading-7 text-muted-foreground">
                Read and contribute to the repository under AGPL-3.0-or-later,
                or use DocKosha Cloud for the available hosted product.
                Enterprise terms require a separate signed agreement and do not
                grant DocYantra engine access.
              </p>
              <div className="flex flex-col gap-4 pt-4 sm:flex-row">
                <Button size="lg" asChild className="font-semibold">
                  <a href={CLOUD_CTA_HREF}>Start on DocKosha Cloud</a>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="bg-transparent"
                >
                  <a href="mailto:contact@dockosha.com?subject=Enterprise%20License%20Inquiry">
                    Ask about Enterprise licensing
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
};

export default HostedVsSelfHostPage;
