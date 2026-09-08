import landingCopy from "@/content/landing.json";
import type { Metadata } from "next";
import LandingPage from "@/components/marketing/pages/LandingPage";
import Script from "next/script";
import { clientEnv } from "@/lib/env";
import testimonialsCopy from "@/content/testimonials.json";
import { getFreePlanMarketingFacts } from "@/modules/billing/marketingFacts";

export const metadata: Metadata = {
  title: "M&A and Founder Virtual Data Room Software | DocKosha",
  description: landingCopy.hero.subtext,
  keywords: [
    "M&A data room",
    "founder data room",
    "investor data room",
    "virtual data room for M&A advisors",
    "virtual data room for founders",
    "deal room software",
    "due diligence data room",
    "startup data room",
    "fundraising data room",
    "legal document sharing",
    "secure document sharing",
    "free secure document sharing",
    "free virtual data room",
    "privacy-first analytics",
    "watermarked document sharing",
    "lightweight vdr",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    title: "DocKosha — Virtual Data Rooms for M&A Teams and Founders",
    description: landingCopy.hero.subtext,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "DocKosha — Virtual Data Rooms for M&A Teams and Founders",
    description: landingCopy.hero.subtext,
  },
};

const Home: React.FC<PageProps<"/">> = () => {
  const siteUrl = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const enabledTestimonials = testimonialsCopy.items.filter(
    (testimonial) => testimonial.enabled,
  );
  const orgLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "DocKosha",
    url: siteUrl,
  } as const;
  const websiteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: siteUrl,
    name: "DocKosha",
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  } as const;
  const softwareLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "DocKosha",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: siteUrl,
    description:
      "M&A teams and founders use DocKosha for deal-ready and investor-ready data rooms with watermarking, access controls, and privacy-first analytics. Lawyers and fundraising teams can start with secure PDF sharing before a full room workflow.",
    offers: {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: `${siteUrl}/pricing`,
      description: getFreePlanMarketingFacts().offerDescription,
    },
    publisher: {
      "@type": "Organization",
      name: "DocKosha",
      url: siteUrl,
    },
    review: enabledTestimonials.map((testimonial) => ({
      "@type": "Review",
      author: {
        "@type": "Person",
        name: testimonial.name,
        jobTitle: testimonial.role,
        worksFor: {
          "@type": "Organization",
          name: testimonial.company,
        },
      },
      reviewBody: testimonial.quote,
      itemReviewed: {
        "@type": "SoftwareApplication",
        name: "DocKosha",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
      },
    })),
  } as const;

  return (
    <>
      <Script
        id="ld-org"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }}
      />
      <Script
        id="ld-website"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }}
      />
      <Script
        id="ld-software-reviews"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareLd) }}
      />
      <LandingPage />
    </>
  );
};

export default Home;
