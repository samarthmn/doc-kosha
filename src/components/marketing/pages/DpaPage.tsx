import type { Metadata } from "next";
import Link from "next/link";
import { FileLock, SealCheck, Shield } from "@phosphor-icons/react/ssr";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHero from "@/components/marketing/MarketingHero";
import MarketingSection from "@/components/marketing/layout/MarketingSection";
import MarketingContainer from "@/components/marketing/layout/MarketingContainer";
import GlassCard from "@/components/marketing/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Data Processing Agreement (Draft) | DocKosha",
  description:
    "Read DocKosha's draft Data Processing Agreement covering controller and processor roles, security, subprocessors, assistance, deletion, audits, and transfers.",
  alternates: { canonical: "/security/dpa" },
};

const DpaPage: React.FC = () => {
  return (
    <MarketingShell>
      <style>{`
        @media print {
          header, footer {
            display: none !important;
          }

          body {
            background: white !important;
            color: black !important;
          }

          .dk-dpa-document {
            max-width: none !important;
          }

          .dk-dpa-card {
            break-inside: avoid;
            border-color: #d4d4d4 !important;
            box-shadow: none !important;
          }

          .dk-dpa-section {
            break-inside: avoid;
          }

          a {
            color: inherit !important;
            text-decoration: none !important;
          }
        }
      `}</style>

      <MarketingHero
        badge="Trust center"
        title={
          <>
            Data Processing Agreement
            <span className="text-primary"> draft</span>
          </>
        }
        subtitle="Controller-processor terms for customer personal data handled through the DocKosha Cloud service."
        className="print:py-8"
        withGradient={false}
      />

      <MarketingSection
        variant="muted"
        className="pb-8 print:bg-white print:py-0"
      >
        <MarketingContainer size="sm" className="dk-dpa-document">
          <GlassCard className="dk-dpa-card border-primary/40 bg-primary/5 p-6 md:p-8">
            <CardHeader className="p-0 pb-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 print:hidden">
                  <FileLock aria-hidden className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-xl leading-relaxed">
                  DRAFT — pending legal review. Contact support@dockosha.com to
                  execute a signed copy.
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0 text-sm leading-7 text-muted-foreground print:text-black">
              This page is provided for review and is not an executed agreement.
              A signed PDF version is available on request; no unsigned download
              is provided here.
            </CardContent>
          </GlassCard>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection className="pb-24 print:py-6">
        <MarketingContainer size="sm" className="dk-dpa-document space-y-10">
          <div className="space-y-3 border-b border-border pb-8 print:border-neutral-300">
            <p className="text-sm text-muted-foreground print:text-black">
              Last updated: July 29, 2026
            </p>
            <p className="leading-7 text-muted-foreground print:text-black">
              This Data Processing Agreement (&quot;DPA&quot;) forms part of the
              agreement governing the Customer&apos;s use of DocKosha Cloud (the
              &quot;Main Agreement&quot;) once signed by the parties. If this
              DPA conflicts with the Main Agreement on the processing of
              Customer Personal Data, this DPA controls to the extent of that
              conflict.
            </p>
          </div>

          <section className="dk-dpa-section space-y-4">
            <h2 className="text-2xl font-medium tracking-[-0.02em]">
              1. Definitions
            </h2>
            <div className="space-y-4 text-sm leading-7 text-muted-foreground print:text-black">
              <p>
                <strong className="text-foreground print:text-black">
                  Applicable Data Protection Law
                </strong>{" "}
                means the privacy and data-protection law that applies to the
                processing covered by this DPA.
              </p>
              <p>
                <strong className="text-foreground print:text-black">
                  Customer Personal Data
                </strong>{" "}
                means personal data submitted to or collected through the
                service on the Customer&apos;s behalf.
              </p>
              <p>
                <strong className="text-foreground print:text-black">
                  Controller, Processor, Data Subject, Personal Data,
                  Processing, and Subprocessor
                </strong>{" "}
                have the meanings given by Applicable Data Protection Law.
              </p>
              <p>
                <strong className="text-foreground print:text-black">
                  Security Incident
                </strong>{" "}
                means a confirmed breach of security leading to accidental or
                unlawful destruction, loss, alteration, unauthorized disclosure
                of, or access to Customer Personal Data.
              </p>
            </div>
          </section>

          <section className="dk-dpa-section space-y-4">
            <h2 className="text-2xl font-medium tracking-[-0.02em]">
              2. Roles and instructions
            </h2>
            <div className="space-y-4 text-sm leading-7 text-muted-foreground print:text-black">
              <p>
                The Customer is the Controller of Customer Personal Data, and
                DocKosha is the Processor, except where Applicable Data
                Protection Law assigns different roles. Each party will comply
                with the obligations applicable to its role.
              </p>
              <p>
                DocKosha will process Customer Personal Data only on documented
                instructions from the Customer, including the Main Agreement,
                this DPA, the Customer&apos;s use and configuration of the
                service, and other written instructions agreed by the parties.
                If an instruction violates Applicable Data Protection Law,
                DocKosha will inform the Customer unless prohibited by law.
              </p>
            </div>
          </section>

          <section className="dk-dpa-section space-y-4">
            <h2 className="text-2xl font-medium tracking-[-0.02em]">
              3. Processing details
            </h2>
            <div className="space-y-4 text-sm leading-7 text-muted-foreground print:text-black">
              <p>
                <strong className="text-foreground print:text-black">
                  Subject matter and duration.
                </strong>{" "}
                Processing necessary to provide, secure, support, and improve
                DocKosha Cloud for the term of the Main Agreement and any
                limited period required to delete or return data afterward.
              </p>
              <p>
                <strong className="text-foreground print:text-black">
                  Nature and purpose.
                </strong>{" "}
                Hosting, organizing, converting, displaying, sharing, securing,
                analyzing engagement with, and supporting documents and data
                rooms as configured by the Customer.
              </p>
              <p>
                <strong className="text-foreground print:text-black">
                  Data subjects.
                </strong>{" "}
                Customer personnel, workspace members, invited collaborators,
                public-link viewers, signatories or NDA acceptors, and people
                whose personal data appears in Customer content.
              </p>
              <p>
                <strong className="text-foreground print:text-black">
                  Data categories.
                </strong>{" "}
                Account identifiers, contact details, workspace and sharing
                metadata, uploaded document content, generated PDFs, viewer
                email addresses where collection is enabled, access and activity
                records, support communications, and billing or subscription
                metadata.
              </p>
              <p>
                The Customer will not submit special-category or highly
                regulated personal data unless its use is lawful and compatible
                with the Main Agreement and configured safeguards.
              </p>
            </div>
          </section>

          <section className="dk-dpa-section space-y-4">
            <h2 className="text-2xl font-medium tracking-[-0.02em]">
              4. Processor obligations
            </h2>
            <div className="space-y-4 text-sm leading-7 text-muted-foreground print:text-black">
              <p>
                DocKosha will ensure that people authorized to process Customer
                Personal Data are bound by confidentiality obligations and
                access the data only as needed for their duties.
              </p>
              <p>
                DocKosha will maintain technical and organizational measures
                appropriate to the risk. The implemented control baseline is
                described on the{" "}
                <Link
                  href="/security"
                  className="text-primary underline underline-offset-4"
                >
                  security page
                </Link>
                , including Supabase-managed TLS in transit and AES-256 at rest,
                row-level security, access controls, audit logging, gated
                sharing, and server-side watermarking.
              </p>
              <p>
                Taking into account the nature of the processing, DocKosha will
                provide reasonable assistance with Data Subject requests,
                security assessments, breach obligations, and data-protection
                impact assessments where the requested information is not
                otherwise available to the Customer.
              </p>
            </div>
          </section>

          <section className="dk-dpa-section space-y-4">
            <h2 className="text-2xl font-medium tracking-[-0.02em]">
              5. Subprocessors
            </h2>
            <div className="space-y-4 text-sm leading-7 text-muted-foreground print:text-black">
              <p>
                The Customer provides general authorization for DocKosha to
                appoint Subprocessors needed to operate the service. The{" "}
                <Link
                  href="/security/subprocessors"
                  className="text-primary underline underline-offset-4"
                >
                  live Subprocessor list
                </Link>{" "}
                is Annex II to this DPA and identifies each provider&apos;s
                purpose, data category, and verified region when available.
              </p>
              <p>
                DocKosha will impose data-protection obligations on each
                Subprocessor that are appropriate to the services it performs.
                DocKosha remains responsible for its Subprocessors&apos;
                performance to the extent required by Applicable Data Protection
                Law.
              </p>
              <p>
                If DocKosha materially changes the Subprocessor list, the
                Customer may raise a reasonable data-protection objection by
                contacting support. The parties will work in good faith to
                resolve the concern.
              </p>
            </div>
          </section>

          <section className="dk-dpa-section space-y-4">
            <h2 className="text-2xl font-medium tracking-[-0.02em]">
              6. Security incidents
            </h2>
            <div className="space-y-4 text-sm leading-7 text-muted-foreground print:text-black">
              <p>
                DocKosha will notify the Customer without undue delay after
                becoming aware of a Security Incident affecting Customer
                Personal Data. Notification will include available information
                reasonably needed for the Customer&apos;s legal obligations,
                such as the nature of the incident, likely consequences,
                affected data, and mitigation measures.
              </p>
              <p>
                DocKosha will take reasonable steps to contain, investigate, and
                mitigate the Security Incident. Notification is not an admission
                of fault or liability.
              </p>
            </div>
          </section>

          <section className="dk-dpa-section space-y-4">
            <h2 className="text-2xl font-medium tracking-[-0.02em]">
              7. Deletion or return
            </h2>
            <div className="space-y-4 text-sm leading-7 text-muted-foreground print:text-black">
              <p>
                At the end of the services, and at the Customer&apos;s choice
                where technically available, DocKosha will delete or return
                Customer Personal Data unless retention is required by law. Data
                retained in managed backups will remain protected and be deleted
                through the provider&apos;s normal backup lifecycle.
              </p>
              <p>
                Privacy and account-deletion requests may also be submitted
                through{" "}
                <Link
                  href="/data-request"
                  className="text-primary underline underline-offset-4"
                >
                  /data-request
                </Link>
                .
              </p>
            </div>
          </section>

          <section className="dk-dpa-section space-y-4">
            <h2 className="text-2xl font-medium tracking-[-0.02em]">
              8. Audit and compliance information
            </h2>
            <div className="space-y-4 text-sm leading-7 text-muted-foreground print:text-black">
              <p>
                On reasonable written request, DocKosha will provide information
                necessary to demonstrate compliance with this DPA. If that
                information is insufficient, the Customer may request an audit
                no more than once per year, unless a Security Incident or
                regulator requires otherwise.
              </p>
              <p>
                Audits must be scoped to relevant systems, protect other
                customers and confidential information, avoid unreasonable
                disruption, and use an independent auditor bound by
                confidentiality. The parties will agree reasonable timing,
                access, and cost allocation before the audit begins.
              </p>
            </div>
          </section>

          <section className="dk-dpa-section space-y-4">
            <h2 className="text-2xl font-medium tracking-[-0.02em]">
              9. International transfers
            </h2>
            <div className="space-y-4 text-sm leading-7 text-muted-foreground print:text-black">
              <p>
                Where Customer Personal Data is transferred from the European
                Economic Area, United Kingdom, or Switzerland to a country that
                does not provide an adequate level of protection, the parties
                will use the applicable Standard Contractual Clauses or another
                lawful transfer mechanism. Any required UK Addendum or Swiss
                adaptations will apply.
              </p>
              <p>
                The parties will cooperate on transfer assessments and
                supplementary measures reasonably required by Applicable Data
                Protection Law. Provider regions remain subject to verification
                on the live Subprocessor list.
              </p>
            </div>
          </section>

          <section className="dk-dpa-section space-y-4">
            <h2 className="text-2xl font-medium tracking-[-0.02em]">
              10. Liability and precedence
            </h2>
            <div className="space-y-4 text-sm leading-7 text-muted-foreground print:text-black">
              <p>
                Each party&apos;s liability arising from this DPA is subject to
                the exclusions and limitations in the Main Agreement, except
                where Applicable Data Protection Law does not permit that
                limitation. The current public{" "}
                <Link
                  href="/terms-and-conditions"
                  className="text-primary underline underline-offset-4"
                >
                  Terms and Conditions
                </Link>{" "}
                are provided for reference; an executed Main Agreement controls
                where one exists.
              </p>
            </div>
          </section>

          <div className="grid gap-6 pt-4 md:grid-cols-2">
            <GlassCard className="dk-dpa-card p-6">
              <CardHeader className="p-0 pb-3">
                <div className="flex items-center gap-3">
                  <Shield
                    aria-hidden
                    className="h-5 w-5 text-primary print:hidden"
                  />
                  <CardTitle className="text-lg">Annex I</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0 text-sm leading-7 text-muted-foreground print:text-black">
                The processing subject matter, duration, nature, purpose, data
                categories, and Data Subjects are specified in section 3.
              </CardContent>
            </GlassCard>

            <GlassCard className="dk-dpa-card p-6">
              <CardHeader className="p-0 pb-3">
                <div className="flex items-center gap-3">
                  <SealCheck
                    aria-hidden
                    className="h-5 w-5 text-primary print:hidden"
                  />
                  <CardTitle className="text-lg">Annex II</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0 text-sm leading-7 text-muted-foreground print:text-black">
                The live{" "}
                <Link
                  href="/security/subprocessors"
                  className="text-primary underline underline-offset-4"
                >
                  Subprocessor list
                </Link>{" "}
                is incorporated by reference.
              </CardContent>
            </GlassCard>
          </div>
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
};

export default DpaPage;
