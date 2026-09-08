import type { Metadata } from "next";
import Link from "next/link";
import { Buildings, Shield } from "@phosphor-icons/react/ssr";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHero from "@/components/marketing/MarketingHero";
import MarketingSection from "@/components/marketing/layout/MarketingSection";
import MarketingContainer from "@/components/marketing/layout/MarketingContainer";
import GlassCard from "@/components/marketing/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Subprocessors | DocKosha",
  description:
    "Review the service providers DocKosha uses to operate authentication, storage, hosting, billing, email, analytics, and error monitoring.",
  alternates: { canonical: "/security/subprocessors" },
};

const subprocessors = [
  {
    name: "Supabase",
    purpose: "Authentication and Postgres database",
    dataCategory:
      "Account data, workspace content metadata, and viewer emails where collected",
  },
  {
    name: "Cloudflare R2",
    purpose: "Document file storage",
    dataCategory: "Uploaded documents and generated PDFs",
  },
  {
    name: "Vercel",
    purpose: "Application hosting",
    dataCategory: "Request handling",
  },
  {
    name: "Stripe",
    purpose: "Billing",
    dataCategory: "Payment and subscription data",
  },
  {
    name: "ZeptoMail / Zoho",
    purpose: "Transactional email",
    dataCategory: "Recipient addresses and email content",
  },
  {
    name: "PostHog",
    purpose: "Product analytics",
    dataCategory: "Consent-gated behavioral events, proxied via s.dockosha.com",
  },
  {
    name: "Sentry",
    purpose: "Error monitoring",
    dataCategory: "PII-scrubbed error reports",
  },
] as const;

const SubprocessorsPage: React.FC = () => {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Trust center"
        title={
          <>
            DocKosha
            <span className="text-primary"> subprocessors</span>
          </>
        }
        subtitle="A subprocessor is a service provider that processes data on our behalf. We keep this list current as the services used to operate DocKosha change."
      >
        <p className="text-sm text-muted-foreground">
          Last updated: July 29, 2026
        </p>
      </MarketingHero>

      <MarketingSection variant="muted" className="pb-20">
        <MarketingContainer>
          <GlassCard className="overflow-hidden">
            <CardHeader className="border-b border-border/70">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Buildings aria-hidden className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-xl">Current subprocessors</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border/70 bg-muted/40">
                      <th scope="col" className="px-6 py-4 font-medium">
                        Subprocessor
                      </th>
                      <th scope="col" className="px-6 py-4 font-medium">
                        Purpose
                      </th>
                      <th scope="col" className="px-6 py-4 font-medium">
                        Data category
                      </th>
                      <th scope="col" className="px-6 py-4 font-medium">
                        Region
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {subprocessors.map((subprocessor) => (
                      <tr
                        key={subprocessor.name}
                        className="border-b border-border/60 last:border-b-0"
                      >
                        <th
                          scope="row"
                          className="px-6 py-5 align-top font-medium text-foreground"
                        >
                          {subprocessor.name}
                        </th>
                        <td className="px-6 py-5 align-top text-muted-foreground">
                          {subprocessor.purpose}
                        </td>
                        <td className="px-6 py-5 align-top text-muted-foreground">
                          {subprocessor.dataCategory}
                        </td>
                        <td className="px-6 py-5 align-top text-muted-foreground">
                          Pending verification
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

      <MarketingSection className="pb-24">
        <MarketingContainer size="sm">
          <GlassCard className="p-6 md:p-8">
            <CardHeader className="p-0 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Shield aria-hidden className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-xl">Data processing terms</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-0 text-sm leading-relaxed text-muted-foreground">
              <p>
                Our draft Data Processing Agreement explains the controller and
                processor roles, subprocessor authorization, security
                obligations, and international-transfer terms.
              </p>
              <Button asChild variant="secondary">
                <Link href="/security/dpa">Read the draft DPA</Link>
              </Button>
            </CardContent>
          </GlassCard>
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
};

export default SubprocessorsPage;
