import React from "react";
import { cn } from "@/lib/utils";
import { BackgroundGradient } from "@/components/ui/background-gradient";
import MarketingContainer from "@/components/marketing/layout/MarketingContainer";

/**
 * Nocturne display scale.
 * - `display-sm` is the shared marketing page-head treatment
 *   (`clamp(34px, 4.6vw, 56px)`) used by every interior page.
 * - `display` is the homepage-only hero treatment
 *   (`clamp(44px, 6.4vw, 88px)`).
 */
type MarketingHeroTitleScale = "display" | "display-sm";

const titleScaleClasses: Record<MarketingHeroTitleScale, string> = {
  display:
    "max-w-[15ch] text-[clamp(2.75rem,7vw,5.5rem)] leading-[1.06] tracking-[-0.035em]",
  "display-sm":
    "max-w-[24ch] text-[clamp(2.125rem,4.6vw,3.5rem)] leading-[1.12] tracking-[-0.025em]",
};

interface MarketingHeroProps {
  badge?: string;
  title: React.ReactNode;
  subtitle?: string;
  className?: string;
  children?: React.ReactNode;
  withGradient?: boolean;
  /** Defaults to the interior page-head scale; the homepage opts into `display`. */
  titleScale?: MarketingHeroTitleScale;
}

const MarketingHero: React.FC<MarketingHeroProps> = ({
  badge,
  title,
  subtitle,
  className,
  children,
  withGradient = true,
  titleScale = "display-sm",
}) => {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden py-16 sm:py-20 lg:py-28",
        className,
      )}
    >
      {withGradient ? <BackgroundGradient /> : null}

      <MarketingContainer className="relative">
        {badge && (
          <div className="animate-fade-in-up mb-6 flex items-center gap-4 opacity-0 [--animation-delay:120ms]">
            <span
              aria-hidden="true"
              className="hidden h-px w-11 bg-primary sm:block"
            />
            <span className="dk-nocturne-kicker">{badge}</span>
          </div>
        )}

        <h1
          className={cn(
            "animate-fade-in-up font-medium text-balance opacity-0 [--animation-delay:220ms]",
            titleScaleClasses[titleScale],
          )}
        >
          {title}
        </h1>

        {subtitle && (
          <p className="animate-fade-in-up mt-8 max-w-[58ch] text-[1.0625rem] leading-7 text-muted-foreground opacity-0 [--animation-delay:320ms]">
            {subtitle}
          </p>
        )}

        {children && (
          <div className="animate-fade-in-up mt-9 max-w-5xl opacity-0 [--animation-delay:420ms]">
            {children}
          </div>
        )}
      </MarketingContainer>
    </section>
  );
};

export default MarketingHero;
