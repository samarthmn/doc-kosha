import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHero from "@/components/marketing/MarketingHero";
import MarketingSection from "@/components/marketing/layout/MarketingSection";
import MarketingContainer from "@/components/marketing/layout/MarketingContainer";
import { Button } from "@/components/ui/button";
import FaqSections from "@/components/marketing/FaqSections";
import faqCopy from "@/content/faq.json";

export const metadata: Metadata = {
  title: "FAQ",
  description: faqCopy.subtitle,
  keywords: [
    "DocKosha FAQ",
    "secure document sharing",
    "virtual data room",
    "document watermarking",
    "document analytics",
  ],
  alternates: { canonical: "/faq" },
  openGraph: {
    type: "website",
    title: "DocKosha FAQ",
    description: faqCopy.subtitle,
    url: "/faq",
  },
  twitter: {
    card: "summary_large_image",
    title: "DocKosha FAQ",
    description: faqCopy.subtitle,
  },
};

const FaqPage: React.FC = () => {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqCopy.sections.flatMap((section) =>
      section.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.a,
        },
      })),
    ),
  } as const;

  return (
    <MarketingShell>
      <Script
        id="faq-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <MarketingHero
        badge={faqCopy.badge}
        title={faqCopy.title}
        subtitle={faqCopy.subtitle}
      />

      <section className="pb-24">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
          <FaqSections sections={faqCopy.sections} />
        </div>
      </section>

      <MarketingSection className="pt-10 pb-24">
        <MarketingContainer size="sm">
          <div className="mb-6 inline-flex size-9 items-center justify-center rounded-md border border-primary/20 bg-primary/5 text-primary">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold">Still have questions?</h2>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Can&apos;t find the answer you&apos;re looking for? Please chat to
            our friendly team.
          </p>
          <div className="mt-8">
            <Button asChild size="lg">
              <Link href="/contact">Get in touch</Link>
            </Button>
          </div>
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
};

export default FaqPage;
