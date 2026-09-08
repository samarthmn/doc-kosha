const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const appUrl = rawAppUrl.replace(/\/$/, "");

export interface SeoFaqItem {
  question: string;
  answer: string;
}

interface SeoWebPageInput {
  path: string;
  title: string;
  description: string;
}

interface SeoSoftwareApplicationInput {
  pagePath: string;
  description: string;
  featureList: string[];
}

interface SeoBreadcrumbItem {
  name: string;
  path: string;
}

const toAbsoluteUrl = (path: string): string => {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/")) return `${appUrl}${path}`;
  return `${appUrl}/${path}`;
};

export const buildWebPageJsonLd = ({
  path,
  title,
  description,
}: SeoWebPageInput) => {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: toAbsoluteUrl(path),
    isPartOf: {
      "@type": "WebSite",
      name: "DocKosha",
      url: appUrl,
    },
    about: {
      "@type": "SoftwareApplication",
      name: "DocKosha",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: appUrl,
    },
  } as const;
};

export const buildSoftwareApplicationJsonLd = ({
  pagePath,
  description,
  featureList,
}: SeoSoftwareApplicationInput) => {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "DocKosha",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: appUrl,
    mainEntityOfPage: toAbsoluteUrl(pagePath),
    description,
    offers: {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
      category: "Free plan",
      url: toAbsoluteUrl("/pricing"),
      availability: "https://schema.org/InStock",
      description:
        "250 MB storage, 2 GB/month public bandwidth, PDF-only uploads, one workspace member, and DocKosha branding required.",
    },
    featureList,
    publisher: {
      "@type": "Organization",
      name: "DocKosha",
      url: appUrl,
    },
  } as const;
};

export const buildFaqPageJsonLd = (items: SeoFaqItem[]) => {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  } as const;
};

export const buildBreadcrumbListJsonLd = (items: SeoBreadcrumbItem[]) => {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: toAbsoluteUrl(item.path),
    })),
  } as const;
};
