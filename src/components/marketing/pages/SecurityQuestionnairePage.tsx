import type { Metadata } from "next";
import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import {
  Eye,
  FileLock,
  Lock,
  SealCheck,
  Shield,
  UserCheck,
} from "@phosphor-icons/react/ssr";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHero from "@/components/marketing/MarketingHero";
import MarketingSection from "@/components/marketing/layout/MarketingSection";
import MarketingContainer from "@/components/marketing/layout/MarketingContainer";
import GlassCard from "@/components/marketing/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Security Questionnaire | DocKosha",
  description:
    "Review DocKosha's implementation-checked answers about compliance, data protection, access control, application security, infrastructure, and incident response.",
  alternates: { canonical: "/security/questionnaire" },
};

interface QuestionnaireItem {
  question: string;
  answer: React.ReactNode;
}

interface QuestionnaireGroup {
  title: string;
  icon: Icon;
  items: readonly QuestionnaireItem[];
}

const questionnaireGroups: readonly QuestionnaireGroup[] = [
  {
    title: "Company & compliance",
    icon: SealCheck,
    items: [
      {
        question: "What is DocKosha?",
        answer:
          "DocKosha is a document-sharing and virtual data-room product with one normal feature edition under AGPL-3.0-or-later. DocYantra is the mandatory direct 0.0.26 dependency; managed DocKosha Cloud provides hosting. Enterprise licensing is available only through a separate signed agreement.",
      },
      {
        question: "Do you hold SOC 2 or ISO 27001 certifications?",
        answer: (
          <>
            No. We do not hold SOC 2 or ISO 27001 certifications. Instead, we
            publish the controls implemented today and maintain the{" "}
            <Link
              href="#enforced-controls"
              className="text-primary underline underline-offset-4"
            >
              enforced-controls list
            </Link>{" "}
            below for security reviewers.
          </>
        ),
      },
      {
        question: "How is the software licensed?",
        answer: (
          <>
            The DocKosha source is licensed under AGPL-3.0-or-later. There is
            one normal feature edition, and DocYantra is the mandatory direct
            0.0.26 dependency. Enterprise licensing is available only through a
            separate signed agreement.
          </>
        ),
      },
      {
        question: "Does the Cloud product send product telemetry?",
        answer:
          "The hosted Cloud product uses consent-gated analytics. EU, EEA, UK, and unknown-region visitors require opt-in; non-EU visitors can opt out; Global Privacy Control is honored and turns analytics and session replay off. We do not make a no-phone-home claim for the Cloud product.",
      },
    ],
  },
  {
    title: "Data protection",
    icon: Lock,
    items: [
      {
        question: "How is data encrypted?",
        answer:
          "Data is protected with TLS in transit and AES-256 at rest on Supabase-managed infrastructure.",
      },
      {
        question: "What customer data does DocKosha process?",
        answer:
          "The service processes account and workspace data, uploaded documents, generated PDFs, sharing settings, billing records, transactional email details, and viewer information only where the selected link settings collect it.",
      },
      {
        question: "Where is customer data hosted?",
        answer: (
          <>
            See the{" "}
            <Link
              href="/security/subprocessors"
              className="text-primary underline underline-offset-4"
            >
              subprocessor list
            </Link>
            . Deployment regions are pending verification from the relevant
            provider account settings and are not guessed on that page.
          </>
        ),
      },
      {
        question: "What retention controls are implemented?",
        answer:
          "Viewer analytics are pruned at 365 days. Workspace owners can configure retention from 1 to 20 previous document versions; the current version is not counted. Other records follow the applicable product and legal retention requirements.",
      },
      {
        question: "How can a customer request deletion?",
        answer: (
          <>
            Account deletion and privacy-rights requests are accepted through{" "}
            <Link
              href="/data-request"
              className="text-primary underline underline-offset-4"
            >
              /data-request
            </Link>
            . Requests are handled subject to applicable legal retention
            requirements.
          </>
        ),
      },
    ],
  },
  {
    title: "Access control",
    icon: UserCheck,
    items: [
      {
        question: "How are tenants isolated?",
        answer:
          "Postgres row-level security is applied on every tenant table to enforce workspace-scoped access.",
      },
      {
        question: "How do users authenticate?",
        answer:
          "DocKosha uses Supabase Auth with passwordless magic links and Google OAuth. Authenticated routes enforce the session boundary server-side.",
      },
      {
        question: "What authorization model is used?",
        answer:
          "A workspace owner has full workspace control. Other members receive per-surface access levels for documents and data rooms, with none, viewer, or editor access and optional explicit per-room grants.",
      },
      {
        question: "Are administrative actions audited?",
        answer:
          "Yes. Relevant workspace activity is recorded in an immutable, trigger-driven audit log that is available to workspace owners.",
      },
    ],
  },
  {
    title: "Application security",
    icon: FileLock,
    items: [
      {
        question: "Which document-access protections are server enforced?",
        answer:
          "Public sharing gates are server enforced and include passwords, email OTP, expiry, one-time open, allowlists, NDA acceptance, and download rules.",
      },
      {
        question: "How are document watermarks applied?",
        answer:
          "For supported PDF and convertible-document downloads that require watermarking, watermarks are burned into the delivered PDF bytes server-side. A required watermark failure fails closed rather than returning the raw file.",
      },
      {
        question: "Can DocKosha stop screenshots?",
        answer:
          "No. Screenshot controls are a best-effort deterrent. Browsers cannot block operating-system capture, and the product states that limitation plainly.",
      },
      {
        question: "Are public authentication surfaces rate limited?",
        answer:
          "Yes. OTP send and verification, link-password checks, and public forms use per-identifier fixed-window limits backed by the database. The checks fail closed when the limiter cannot make a decision.",
      },
      {
        question: "Are browser security headers configured?",
        answer:
          "Baseline security headers are enforced. Content Security Policy is rolling out in report-only mode before enforcement.",
      },
    ],
  },
  {
    title: "Infrastructure",
    icon: Shield,
    items: [
      {
        question: "Which providers operate the hosted service?",
        answer: (
          <>
            DocKosha uses specialist providers for database and authentication,
            object storage, application hosting, billing, transactional email,
            product analytics, and error monitoring. The current providers and
            data categories are listed on the{" "}
            <Link
              href="/security/subprocessors"
              className="text-primary underline underline-offset-4"
            >
              subprocessor page
            </Link>
            .
          </>
        ),
      },
      {
        question: "What backup and disaster-recovery controls exist?",
        answer:
          "Database backups are Supabase-managed and automated. We do not claim a customer-specific recovery point or recovery time objective on this page.",
      },
      {
        question: "How is production monitored?",
        answer:
          "Sentry provides production error monitoring with PII-scrubbed reports. Operational telemetry is kept server-side where credentials or secrets are involved.",
      },
      {
        question: "Is document conversion sent to a remote conversion service?",
        answer:
          "DocYantra 0.0.26 handles PDF, Office, Markdown, and redaction work within its validated limits. The dependency fails closed outside its envelope; there is no provider-selection variable or fallback provider.",
      },
    ],
  },
  {
    title: "Incident response",
    icon: Eye,
    items: [
      {
        question:
          "Has DocKosha completed a formal third-party penetration test?",
        answer: (
          <>
            No formal third-party penetration test has been completed to date.
            DocKosha operates a good-faith vulnerability disclosure program
            under{" "}
            <Link
              href="/.well-known/security.txt"
              className="text-primary underline underline-offset-4"
            >
              the published security policy
            </Link>
            .
          </>
        ),
      },
      {
        question: "How quickly are vulnerability reports acknowledged?",
        answer:
          "The disclosure policy targets acknowledgment within 3 business days and ongoing updates while a report is investigated and fixed.",
      },
      {
        question: "How are customers notified of a data breach?",
        answer:
          "Incidents are investigated and contained using available application, database, storage, and monitoring evidence. Where customer personal data is affected, notification is made without undue delay as required by the applicable agreement and law.",
      },
    ],
  },
];

const enforcedControls = [
  "TLS in transit and AES-256 at rest on Supabase-managed infrastructure",
  "Postgres row-level security for tenant isolation",
  "Workspace-owner and per-surface authorization",
  "Trigger-driven internal audit logging",
  "Server-enforced public-link gates and server-side PDF watermarking",
  "Consent-aware analytics with Global Privacy Control honored",
] as const;

const SecurityQuestionnairePage: React.FC = () => {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Trust center"
        title={
          <>
            Pre-answered
            <span className="text-primary"> security questionnaire</span>
          </>
        }
        subtitle="These answers were reviewed against the implementation and public repository. They describe the controls in place today and state gaps directly."
      >
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>Last reviewed: July 29, 2026</p>
          <p>
            Need an answer that is not covered here?{" "}
            <a
              href="mailto:support@dockosha.com"
              className="text-primary underline underline-offset-4"
            >
              Email support@dockosha.com
            </a>
            .
          </p>
        </div>
      </MarketingHero>

      <MarketingSection variant="muted" className="pb-20">
        <MarketingContainer size="sm">
          <GlassCard id="enforced-controls" className="p-6 md:p-8">
            <CardHeader className="p-0 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <SealCheck aria-hidden className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-xl">
                  Enforced controls at a glance
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="grid gap-3 text-sm leading-relaxed text-muted-foreground sm:grid-cols-2">
                {enforcedControls.map((control) => (
                  <li key={control} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{control}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </GlassCard>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection className="pb-24">
        <MarketingContainer size="sm">
          <div className="space-y-10">
            {questionnaireGroups.map((group) => {
              const Icon = group.icon;
              return (
                <section key={group.title} className="space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon aria-hidden className="h-5 w-5 text-primary" />
                    </div>
                    <h2 className="text-2xl font-medium tracking-[-0.02em] md:text-3xl">
                      {group.title}
                    </h2>
                  </div>

                  <div className="space-y-4">
                    {group.items.map((item) => (
                      <GlassCard key={item.question} className="p-6">
                        <CardHeader className="p-0 pb-3">
                          <CardTitle className="text-base leading-relaxed">
                            {item.question}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 text-sm leading-7 text-muted-foreground">
                          {item.answer}
                        </CardContent>
                      </GlassCard>
                    ))}
                  </div>
                </section>
              );
            })}

            <GlassCard className="p-6 md:p-8">
              <CardHeader className="p-0 pb-3">
                <CardTitle className="text-xl">
                  Need supporting detail?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-0 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Send the missing question or your organization&apos;s review
                  template. We will answer against the current implementation
                  and identify anything that still needs verification.
                </p>
                <Button asChild variant="secondary">
                  <a href="mailto:support@dockosha.com">
                    Email the security team
                  </a>
                </Button>
              </CardContent>
            </GlassCard>
          </div>
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
};

export default SecurityQuestionnairePage;
