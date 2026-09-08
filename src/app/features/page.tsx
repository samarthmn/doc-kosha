import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartBar,
  ChatCircleDots,
  Clock,
  Eye,
  FileText,
  Globe,
  LinkSimple,
  Lock,
  Scissors,
  Scroll,
  Shield,
  Users,
} from "@phosphor-icons/react/ssr";
import featuresCopy from "@/content/features.json";
import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHero from "@/components/marketing/MarketingHero";
import GlassCard from "@/components/marketing/GlassCard";
import { Button } from "@/components/ui/button";
import MarketingSection from "@/components/marketing/layout/MarketingSection";
import MarketingContainer from "@/components/marketing/layout/MarketingContainer";
import MarketingCardGrid from "@/components/marketing/layout/MarketingCardGrid";

export const metadata: Metadata = {
  title: featuresCopy.title,
  description: featuresCopy.subtitle,
  keywords: [
    "virtual data room features",
    "secure document sharing features",
    "document analytics for deal rooms",
    "document watermarking",
    "link permissions",
    "pdf redaction",
  ],
  alternates: { canonical: "/features" },
  openGraph: {
    type: "website",
    title: featuresCopy.title,
    description: featuresCopy.subtitle,
    url: "/features",
  },
  twitter: {
    card: "summary_large_image",
    title: featuresCopy.title,
    description: featuresCopy.subtitle,
  },
};

// Keys are the icon names authored in src/content/features.json; values are the
// Phosphor components they render as.
const iconMap = {
  Shield,
  Eye,
  FileText,
  Users,
  BarChart3: ChartBar,
  Clock,
  Lock,
  Link2: LinkSimple,
  MessageCircleMore: ChatCircleDots,
  Scissors,
  ScrollText: Scroll,
  Globe2: Globe,
} as const;

const fallbackCta = {
  title: "Ready to share securely?",
  subtitle:
    "Start with a plan that fits today, then upgrade as your team grows.",
  primaryButton: {
    text: "View pricing",
    href: "/pricing",
  },
  secondaryButton: {
    text: "Talk to sales",
    href: "/contact",
  },
};

const FeaturesPage: React.FC = () => {
  const ctaCopy = featuresCopy.cta ?? fallbackCta;

  return (
    <MarketingShell>
      <MarketingHero
        badge={featuresCopy.badge}
        title={featuresCopy.title}
        subtitle={featuresCopy.subtitle}
      />

      <MarketingSection variant="muted">
        <MarketingContainer>
          <div className="mb-12 max-w-3xl">
            <h2 className="mb-2 text-2xl font-semibold">
              {featuresCopy.gridTitle}
            </h2>
            <p className="text-muted-foreground">{featuresCopy.gridSubtitle}</p>
          </div>
          <MarketingCardGrid cols={3}>
            {featuresCopy.sections.map(
              (s: {
                icon: string;
                title: string;
                description: string;
                comingSoon?: string;
                href?: string;
              }) => {
                const Icon =
                  iconMap[s.icon as keyof typeof iconMap] ?? FileText;
                return (
                  <GlassCard key={s.title} className="text-left">
                    <CardHeader>
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <CardTitle>{s.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-base">
                        {s.description}
                      </CardDescription>
                      {s.href ? (
                        <div className="mt-4">
                          <Link
                            href={s.href}
                            className="text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                          >
                            Learn more
                          </Link>
                        </div>
                      ) : null}
                      {s.comingSoon && (
                        <p className="mt-3 text-xs text-muted-foreground/70 italic">
                          {s.comingSoon}
                        </p>
                      )}
                    </CardContent>
                  </GlassCard>
                );
              },
            )}
          </MarketingCardGrid>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection>
        <MarketingContainer size="sm" className="text-left">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Explore product demos
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            Walk through the product flows for secure sharing, lightweight data
            rooms, and controlled external review.
          </p>
          <div className="mt-6">
            <Button asChild size="lg">
              <Link href="/demos">Browse all demos</Link>
            </Button>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection className="pt-0">
        <MarketingContainer>
          <MarketingCardGrid cols={2}>
            <GlassCard>
              <CardHeader>
                <CardTitle>{featuresCopy.supported.title}</CardTitle>
                <CardDescription>
                  {featuresCopy.supported.subtitle}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {featuresCopy.supported.items.map((line) => (
                    <li key={line}>• {line}</li>
                  ))}
                </ul>
              </CardContent>
            </GlassCard>

            <GlassCard>
              <CardHeader>
                <CardTitle>{featuresCopy.privacy.title}</CardTitle>
                <CardDescription>
                  {featuresCopy.privacy.subtitle}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {featuresCopy.privacy.items.map((line) => (
                    <li key={line}>• {line}</li>
                  ))}
                </ul>
              </CardContent>
            </GlassCard>
          </MarketingCardGrid>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection className="pb-24">
        <MarketingContainer size="sm" className="text-left">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            {ctaCopy.title}
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            {ctaCopy.subtitle}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href={ctaCopy.primaryButton.href}>
                {ctaCopy.primaryButton.text}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={ctaCopy.secondaryButton.href}>
                {ctaCopy.secondaryButton.text}
              </Link>
            </Button>
          </div>
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
};

export default FeaturesPage;
