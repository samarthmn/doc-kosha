import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { ArrowRight, CheckCircle, Quotes } from "@phosphor-icons/react/ssr";

import GlassCard from "@/components/marketing/GlassCard";
import MarketingContainer from "@/components/marketing/layout/MarketingContainer";
import MarketingSection from "@/components/marketing/layout/MarketingSection";
import MarketingHero from "@/components/marketing/MarketingHero";
import MarketingShell from "@/components/marketing/MarketingShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clientEnv } from "@/lib/env";
import { glHfCustomerStory } from "@/content/customerStories";

const siteUrl = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
const storyUrl = `${siteUrl}${glHfCustomerStory.href}`;

export const metadata: Metadata = {
  title: "GL HF chose DocKosha as a lower-cost DocSend alternative",
  description: glHfCustomerStory.description,
  alternates: { canonical: glHfCustomerStory.href },
  keywords: glHfCustomerStory.keywords,
  openGraph: {
    type: "article",
    title: glHfCustomerStory.title,
    description: glHfCustomerStory.description,
    url: glHfCustomerStory.href,
    publishedTime: glHfCustomerStory.publishedISO,
    modifiedTime: glHfCustomerStory.updatedISO,
  },
  twitter: {
    card: "summary_large_image",
    title: glHfCustomerStory.title,
    description: glHfCustomerStory.description,
  },
};

const customerStoryJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: glHfCustomerStory.title,
  description: glHfCustomerStory.description,
  datePublished: glHfCustomerStory.publishedISO,
  dateModified: glHfCustomerStory.updatedISO,
  url: storyUrl,
  author: {
    "@type": "Organization",
    name: "DocKosha",
    url: siteUrl,
  },
  about: {
    "@type": "SoftwareApplication",
    name: "DocKosha",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
  },
  citation: {
    "@type": "Review",
    author: {
      "@type": "Person",
      name: glHfCustomerStory.customer.name,
      jobTitle: glHfCustomerStory.customer.role,
      worksFor: {
        "@type": "Organization",
        name: glHfCustomerStory.customer.company,
      },
    },
    reviewBody: glHfCustomerStory.testimonial.quote,
    itemReviewed: {
      "@type": "SoftwareApplication",
      name: "DocKosha",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
    },
  },
} as const;

const CustomerStoryPage: React.FC = () => {
  return (
    <MarketingShell>
      <Script
        id="gl-hf-customer-story-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(customerStoryJsonLd),
        }}
      />

      <MarketingHero
        badge="Customer Story"
        title={glHfCustomerStory.title}
        subtitle={glHfCustomerStory.description}
        className="pb-12"
      >
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Button asChild size="lg" className="h-12 px-8 text-base">
            <Link href="/auth/sign-in?redirect=%2Fonboarding">Start free</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 bg-background/50 px-8 text-base backdrop-blur-sm"
          >
            <Link href="/features/single-document">
              Explore document sharing
            </Link>
          </Button>
        </div>
      </MarketingHero>

      <MarketingSection className="pt-0">
        <MarketingContainer>
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <GlassCard className="p-6 md:p-8">
              <div className="mb-6 flex size-9 items-center justify-center rounded-md border border-primary/20 bg-primary/5 text-primary">
                <Quotes className="size-4" aria-hidden="true" />
              </div>
              <figure>
                <blockquote className="text-xl leading-9 font-medium text-balance text-foreground">
                  <p>&ldquo;{glHfCustomerStory.testimonial.quote}&rdquo;</p>
                </blockquote>
                <figcaption className="mt-8 border-t border-border pt-6">
                  <cite className="block font-semibold text-foreground not-italic">
                    {glHfCustomerStory.customer.name}
                  </cite>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {glHfCustomerStory.customer.role},{" "}
                    {glHfCustomerStory.customer.company}
                  </p>
                </figcaption>
              </figure>
            </GlassCard>

            <div className="grid gap-4">
              {glHfCustomerStory.highlights.map((highlight) => (
                <GlassCard key={highlight} className="p-5">
                  <div className="flex gap-4">
                    <CheckCircle
                      className="mt-1 h-5 w-5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <p className="leading-7 text-foreground">{highlight}</p>
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection variant="muted">
        <MarketingContainer>
          <div className="max-w-3xl space-y-12">
            {glHfCustomerStory.sections.map((section) => (
              <section key={section.title} className="space-y-3">
                <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                  {section.title}
                </h2>
                <p className="text-lg leading-8 text-muted-foreground">
                  {section.body}
                </p>
              </section>
            ))}
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection className="pb-24">
        <MarketingContainer>
          <div className="mx-auto max-w-4xl">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-primary/20 bg-primary/5 px-3 py-1 text-primary"
              >
                Related resources
              </Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {glHfCustomerStory.relatedLinks.map((link) => (
                <GlassCard key={link.href} className="p-5">
                  <Link
                    href={link.href}
                    className="group/link flex min-h-20 items-center justify-between gap-4 font-medium text-foreground"
                  >
                    <span>{link.label}</span>
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-primary transition-transform group-hover/link:translate-x-1"
                      aria-hidden="true"
                    />
                  </Link>
                </GlassCard>
              ))}
            </div>
          </div>
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
};

export default CustomerStoryPage;
