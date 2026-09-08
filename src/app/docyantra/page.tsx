import docyantraCopy from "@/content/docyantra.json";
import MarketingShell from "@/components/marketing/MarketingShell";
import { DocyantraPageClient } from "@/components/marketing/pages/DocyantraPageClient";
import type { Metadata } from "next";
import Script from "next/script";

const { seo, highlights } = docyantraCopy;

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  alternates: { canonical: seo.canonical },
  openGraph: {
    type: "article",
    title: seo.title,
    description: seo.description,
    url: seo.canonical,
  },
  twitter: {
    card: "summary_large_image",
    title: seo.title,
    description: seo.description,
  },
};

const DocyantraPage: React.FC = () => {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: seo.title,
    description: seo.description,
    inLanguage: "en",
    about: highlights.map((item) => item.title),
  } as const;

  return (
    <MarketingShell>
      <Script
        id="docyantra-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <DocyantraPageClient />
    </MarketingShell>
  );
};

export default DocyantraPage;
