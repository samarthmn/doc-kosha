import type { Metadata } from "next";
import Link from "next/link";
import {
  Bug,
  Eye,
  FileLock,
  Fingerprint,
  Key,
  Lock,
  SealCheck,
  Shield,
  UserCheck,
} from "@phosphor-icons/react/ssr";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHero from "@/components/marketing/MarketingHero";
import MarketingSection from "@/components/marketing/layout/MarketingSection";
import MarketingContainer from "@/components/marketing/layout/MarketingContainer";
import MarketingCardGrid from "@/components/marketing/layout/MarketingCardGrid";
import GlassCard from "@/components/marketing/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Security Controls | DocKosha",
  description:
    "Learn how DocKosha protects sensitive documents with Supabase-managed TLS and AES-256 at rest, role-based access controls, watermarking, and consent-aware analytics.",
  alternates: { canonical: "/security" },
  keywords: [
    "virtual data room security",
    "secure document sharing",
    "lightweight vdr security",
    "dynamic watermarking",
    "NDA gates",
    "document access control",
    "privacy consent analytics",
  ],
  openGraph: {
    type: "website",
    title: "DocKosha Security",
    description:
      "Supabase-managed TLS/AES-256 encryption, access controls, dynamic watermarking, and consent-aware analytics for secure document sharing.",
    url: "/security",
  },
  twitter: {
    card: "summary_large_image",
    title: "DocKosha Security",
    description:
      "Supabase-managed TLS/AES-256 encryption, access controls, dynamic watermarking, and consent-aware analytics for secure document sharing.",
  },
};

const securityControls = [
  {
    title: "Encryption in transit & at rest",
    description:
      "Data is encrypted in transit with TLS and at rest with AES-256 on Supabase-managed infrastructure.",
    icon: Lock,
    badge: "Baseline",
  },
  {
    title: "Authentication",
    description:
      "Passwordless magic links and Google OAuth via Supabase Auth. Session handling is server-assisted for safer public-room and document-access flows.",
    icon: Key,
    badge: "Access",
  },
  {
    title: "Role-based access control",
    description:
      "Workspace roles (owner/editor/viewer) and workspace-scoped permissions help prevent accidental over-sharing.",
    icon: UserCheck,
    badge: "RBAC",
  },
  {
    title: "Row Level Security (RLS)",
    description:
      "Database policies enforce workspace scoping and role-aware permissions, so users only see what they’re allowed to access.",
    icon: Shield,
    badge: "Database",
  },
  {
    title: "Secure sharing controls",
    description:
      "Link controls like access gating, allowlists and blocklists, expirations, NDA templates, presets, and download restrictions help teams share sensitive material with less risk.",
    icon: FileLock,
    badge: "Links",
  },
  {
    title: "Internal audit logs",
    description:
      "Internal audit logs help workspace owners understand team activity across documents and data rooms.",
    icon: SealCheck,
    badge: "Audit",
  },
  {
    title: "Dynamic watermarking",
    description:
      "Watermarks add accountability during viewing and downloads, reducing the risk of casual leaks or forwarding.",
    icon: Fingerprint,
    badge: "Deterrence",
  },
  {
    title: "Privacy-first analytics",
    description:
      "Engagement signals help teams understand what was viewed without defaulting to unnecessary personal data collection.",
    icon: Eye,
    badge: "Privacy",
  },
  {
    title: "Operational monitoring",
    description:
      "Production monitoring via Sentry helps detect errors and performance regressions quickly without exposing secrets to the client.",
    icon: SealCheck,
    badge: "Ops",
  },
] as const;

const SecurityPage: React.FC = () => {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Security"
        title={
          <>
            Security controls for
            <span className="text-primary"> secure document sharing</span>
          </>
        }
        subtitle="DocKosha combines infrastructure-level safeguards with practical room controls like watermarking, gating, download restrictions, and auditability. This page describes what is implemented today."
      >
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Button asChild size="lg" className="h-12 px-8 text-base">
            <Link href="/contact">Book a walkthrough</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 bg-background/50 px-8 text-base backdrop-blur-sm"
          >
            <Link href="/features">Explore features</Link>
          </Button>
        </div>
      </MarketingHero>

      <MarketingSection variant="muted" className="pb-20">
        <MarketingContainer>
          <div className="mb-12 grid gap-6 lg:grid-cols-[0.7fr_1fr] lg:items-end">
            <h2 className="text-3xl font-medium tracking-[-0.03em] md:text-4xl">
              Security controls at a glance
            </h2>
            <p className="max-w-[58ch] text-[0.9375rem] leading-7 text-muted-foreground">
              This page is a plain-English overview for customer security
              reviewers. If you need specifics for a questionnaire,{" "}
              <Link href="/contact" className="text-primary underline">
                contact us
              </Link>
              .
            </p>
          </div>

          <MarketingCardGrid cols={4}>
            {securityControls.map((c) => {
              const Icon = c.icon;
              return (
                <GlassCard key={c.title} className="h-full">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {c.badge}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg font-medium">
                      {c.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-relaxed text-muted-foreground">
                    {c.description}
                  </CardContent>
                </GlassCard>
              );
            })}
          </MarketingCardGrid>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection className="pb-24">
        <MarketingContainer size="sm">
          <div className="space-y-10">
            <div className="space-y-3">
              <h2 className="text-3xl font-medium tracking-[-0.03em] md:text-4xl">
                How DocKosha approaches security
              </h2>
              <p className="text-lg leading-relaxed text-muted-foreground">
                We treat secure sharing as a product capability, not a marketing
                checkbox. Encryption matters, but practical risk reduction
                depends on whether policy is enforced at room, link, folder, and
                document levels.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <GlassCard className="p-6 md:p-8">
                <CardHeader className="p-0 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <FileLock aria-hidden className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-xl">
                      Policy controls for live sharing
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 p-0 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    DocKosha focuses on controls that still matter after a room
                    goes live:
                  </p>
                  <ul className="space-y-2">
                    <li className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>
                        Link-level permissions for view and download behavior
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>
                        Gating like verification, allowlists or blocklists, and
                        NDA terms
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>Expiration and revocable access patterns</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>
                        Watermarking for accountability and deterrence
                      </span>
                    </li>
                  </ul>
                </CardContent>
              </GlassCard>

              <GlassCard className="p-6 md:p-8">
                <CardHeader className="p-0 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Eye aria-hidden className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-xl">
                      Privacy and analytics boundaries
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 p-0 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    Teams often need to know what was opened, revisited, or
                    downloaded. Viewer analytics are designed to surface those
                    signals while minimizing sensitive data collection.
                  </p>
                  <ul className="space-y-2">
                    <li className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>We avoid storing raw IP addresses</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>
                        Identity is collected only when link settings require it
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>
                        Events focus on viewing, downloads, and time spent
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>
                        PostHog product analytics and replay stay off until
                        consent is granted
                      </span>
                    </li>
                  </ul>
                </CardContent>
              </GlassCard>
            </div>

            <GlassCard className="p-6 md:p-8">
              <CardHeader className="p-0 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Lock aria-hidden className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-xl">
                    What this means in practice
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-0 text-sm leading-relaxed text-muted-foreground">
                <p>
                  In plain English: DocKosha helps teams control who can open
                  sensitive materials, what they can do after opening them, and
                  what activity internal users can review later.
                </p>
                <ul className="space-y-2">
                  <li className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>
                      Use gated access for contracts, financials, and other
                      sensitive files
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>
                      Apply watermarking when documents move outside the firm
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>
                      Review audit logs and analytics to support internal
                      follow-up
                    </span>
                  </li>
                </ul>
              </CardContent>
            </GlassCard>

            <GlassCard className="p-6 md:p-8">
              <CardHeader className="p-0 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <SealCheck aria-hidden className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-xl">Trust center</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-0 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Review the implementation-checked questionnaire, current
                  subprocessors, and draft data-processing terms used in
                  security reviews.
                </p>
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap">
                  <Button asChild variant="secondary">
                    <Link href="/security/questionnaire">
                      Security questionnaire
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/security/subprocessors">Subprocessors</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/security/dpa">Draft DPA</Link>
                  </Button>
                </div>
              </CardContent>
            </GlassCard>

            <GlassCard className="p-6 md:p-8">
              <CardHeader className="p-0 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Shield aria-hidden className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-xl">
                    Claims we do not make
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-0 text-sm leading-relaxed text-muted-foreground">
                <p>
                  We keep this page explicit so buyers can verify controls
                  quickly.
                </p>
                <ul className="space-y-2">
                  <li className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>
                      We describe TLS in transit and AES-256 at rest on
                      Supabase-managed infrastructure.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>
                      We do not claim SOC 2, ISO, HIPAA, or specific CSP/HSTS
                      hardening status on this page.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>
                      We can provide implementation details for current controls
                      through security review conversations.
                    </span>
                  </li>
                </ul>
              </CardContent>
            </GlassCard>

            <GlassCard className="p-6 md:p-8">
              <CardHeader className="p-0 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Bug aria-hidden className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-xl">
                    Reporting a vulnerability
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-0 text-sm leading-relaxed text-muted-foreground">
                <p>
                  If you believe you’ve found a security issue, email us with
                  steps to reproduce and any relevant logs or screenshots.
                </p>
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <Button asChild variant="secondary">
                    <a href="mailto:support@dockosha.com">Email support</a>
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Please avoid sharing sensitive customer data in the initial
                    report.
                  </span>
                </div>
              </CardContent>
            </GlassCard>
          </div>
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
};

export default SecurityPage;
