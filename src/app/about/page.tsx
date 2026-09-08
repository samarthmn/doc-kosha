import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import aboutCopy from "@/content/about.json";
import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHero from "@/components/marketing/MarketingHero";
import GlassCard from "@/components/marketing/GlassCard";
import { Button } from "@/components/ui/button";
import MarketingSection from "@/components/marketing/layout/MarketingSection";
import MarketingContainer from "@/components/marketing/layout/MarketingContainer";

export const metadata: Metadata = {
  title: "About DocKosha",
  description: aboutCopy.subtitle,
  keywords: [
    "DocKosha",
    "secure document sharing",
    "virtual data room",
    "document analytics",
    "document watermarking",
  ],
  alternates: { canonical: "/about" },
  openGraph: {
    type: "website",
    title: "About DocKosha",
    description: aboutCopy.subtitle,
    url: "/about",
  },
  twitter: {
    card: "summary_large_image",
    title: "About DocKosha",
    description: aboutCopy.subtitle,
  },
};

const AboutPage: React.FC<PageProps<"/about">> = () => {
  return (
    <MarketingShell>
      <MarketingHero
        badge={aboutCopy.badge}
        title={aboutCopy.title}
        subtitle={aboutCopy.subtitle}
      />

      <MarketingSection className="pb-20">
        <MarketingContainer>
          <div className="grid gap-5 md:grid-cols-[1.15fr_0.85fr]">
            <GlassCard className="col-span-1 row-span-2 p-8 md:p-10">
              <CardHeader className="p-0 pb-6">
                <CardTitle className="text-3xl leading-tight font-medium tracking-[-0.025em]">
                  {aboutCopy.whatWeDo.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 text-lg leading-relaxed text-muted-foreground">
                <div className="space-y-6">
                  {aboutCopy.whatWeDo.paragraphs.map((p, i) => (
                    <p
                      key={p}
                      className="animate-fade-in-up opacity-0"
                      style={{ animationDelay: `${(i + 1) * 150}ms` }}
                    >
                      {p}
                    </p>
                  ))}
                </div>
              </CardContent>
            </GlassCard>

            <div className="grid gap-6">
              <GlassCard className="h-full p-8">
                <CardHeader className="p-0 pb-4">
                  <CardTitle className="text-xl font-medium text-primary">
                    Our Mission
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 text-muted-foreground">
                  To make secure document sharing intuitive, transparent, and
                  accessible for everyone, from startups to enterprises.
                </CardContent>
              </GlassCard>

              <GlassCard className="h-full p-8">
                <CardHeader className="p-0 pb-4">
                  <CardTitle className="text-xl font-medium text-primary">
                    {aboutCopy.differentiators.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ul className="space-y-3 text-muted-foreground">
                    {aboutCopy.differentiators.items.map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </GlassCard>
            </div>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection className="pb-32">
        <MarketingContainer size="sm" className="relative">
          <div className="absolute inset-0 -z-10 h-full w-full bg-[radial-gradient(ellipse_at_top_left,color-mix(in_srgb,var(--primary)_8%,transparent),transparent_68%)]" />
          <h2 className="text-3xl font-medium tracking-[-0.03em] md:text-5xl">
            See DocKosha in action
          </h2>
          <p className="mt-6 max-w-2xl text-[1.0625rem] leading-7 text-muted-foreground">
            Talk to us about your workflow and we’ll help you set up secure
            sharing that fits your team.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Button asChild size="lg" className="h-12 px-8 text-base">
              <Link href="/contact">Contact</Link>
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
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
};

export default AboutPage;
