import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHero from "@/components/marketing/MarketingHero";
import MarketingSection from "@/components/marketing/layout/MarketingSection";
import MarketingContainer from "@/components/marketing/layout/MarketingContainer";
import { Button } from "@/components/ui/button";
import { SelfHostingContent } from "@/components/marketing/pages/SelfHostingContent";

const title = "Self-Host DocKosha: Open-Source Document Sharing and Data Rooms";
const description =
  "Run DocKosha and its open-source DocYantra engine on your infrastructure. Review prerequisites, setup, production responsibilities, and the managed Cloud option.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/self-hosting" },
  openGraph: { type: "website", title, description, url: "/self-hosting" },
  twitter: { card: "summary_large_image", title, description },
};

export default function SelfHostingPage() {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Open-source application and engine"
        title="Self-host DocKosha with the source in your hands"
        subtitle="DocKosha and DocYantra are open source under AGPL-3.0-or-later. Operate your own document sharing and virtual data rooms, or let DocKosha Cloud handle hosting."
      >
        <div className="flex flex-wrap gap-4">
          <Button asChild size="lg">
            <Link href="/auth/sign-in?redirect=%2Fonboarding">
              Start free on Cloud
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="https://github.com/samarthmn/doc-kosha/blob/HEAD/docs/self-hosting.md">
              Read the complete setup guide
            </a>
          </Button>
        </div>
      </MarketingHero>
      <MarketingSection>
        <MarketingContainer>
          <SelfHostingContent />
        </MarketingContainer>
      </MarketingSection>
    </MarketingShell>
  );
}
