import Link from "next/link";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHero from "@/components/marketing/MarketingHero";
import { Button } from "@/components/ui/button";
import { ArrowRight, Lifebuoy } from "@phosphor-icons/react/ssr";

const NotFoundPage: React.FC = () => {
  return (
    <MarketingShell>
      <MarketingHero
        badge="404"
        title="This page doesn’t exist"
        subtitle="Check the URL, or head back to the homepage."
      >
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <Button asChild size="lg">
            <Link href="/">
              Go home
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/contact">
              <Lifebuoy className="size-4" aria-hidden />
              Contact support
            </Link>
          </Button>
        </div>
      </MarketingHero>
    </MarketingShell>
  );
};

export default NotFoundPage;
