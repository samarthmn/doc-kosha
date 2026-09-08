import Link from "next/link";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHero from "@/components/marketing/MarketingHero";
import MarketingSection from "@/components/marketing/layout/MarketingSection";
import MarketingContainer from "@/components/marketing/layout/MarketingContainer";
import MarketingCardGrid from "@/components/marketing/layout/MarketingCardGrid";
import GlassCard from "@/components/marketing/GlassCard";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAllDemoWorkflows } from "@/modules/demos/catalog";

const DemosIndexPage: React.FC = () => {
  const demos = getAllDemoWorkflows();

  return (
    <MarketingShell>
      <MarketingHero
        badge="Product Demos"
        title="Demo Video Library"
        subtitle="Browse complete DocKosha product walkthroughs. Each page includes video playback plus the exact markdown notes for that flow."
      >
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Button asChild size="lg" className="h-12 px-8 text-base">
            <Link href="/auth/sign-in">Get started</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 bg-background/50 px-8 text-base backdrop-blur-sm"
          >
            <Link href="/features">View features</Link>
          </Button>
        </div>
      </MarketingHero>

      <MarketingSection className="pt-0 pb-24">
        <MarketingContainer>
          <MarketingCardGrid cols={2}>
            {demos.map((demo, index) => (
              <GlassCard
                key={demo.slug}
                className="group flex h-full flex-col border-border"
              >
                <CardHeader className="space-y-3">
                  <span
                    aria-hidden="true"
                    className="text-xs font-medium tracking-[0.12em] text-primary"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <CardTitle className="text-xl leading-tight font-medium">
                    {demo.title}
                  </CardTitle>
                  <CardDescription className="text-base">
                    {demo.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Includes video playback and step-level explanation text.
                  </p>
                  <Button asChild>
                    <Link href={`/demos/${demo.slug}`}>Watch Demo</Link>
                  </Button>
                </CardContent>
              </GlassCard>
            ))}
          </MarketingCardGrid>
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
};

export default DemosIndexPage;
