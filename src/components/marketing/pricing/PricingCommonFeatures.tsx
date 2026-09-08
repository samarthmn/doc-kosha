import React from "react";
import { Check } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import pricingCopy from "@/content/pricing.json";

const PricingCommonFeatures: React.FC<{ className?: string }> = ({
  className,
}) => {
  const allPlansInclude = pricingCopy.allPlansInclude;
  const items = allPlansInclude?.items ?? [];

  if (!items.length) return null;

  // Split description and title if possible, or mapping to icons could happen here
  // For now, we will create a rich card for each text item
  return (
    <div className={cn("py-8", className)}>
      <div className="mb-14 grid gap-6 lg:grid-cols-[0.7fr_1fr] lg:items-end">
        <div>
          <div className="mb-5 inline-flex size-9 items-center justify-center rounded-md border border-primary/25 bg-primary/5 text-primary">
            <Check aria-hidden className="size-4" weight="bold" />
          </div>
          <h3 className="text-3xl font-medium tracking-[-0.03em] md:text-4xl">
            {allPlansInclude?.title ?? "Everything you need, included."}
          </h3>
        </div>
        {allPlansInclude?.subtitle ? (
          <p className="max-w-[58ch] text-[0.9375rem] leading-7 text-muted-foreground">
            {allPlansInclude.subtitle}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const hasFootnote = item.endsWith("*");
          const displayText = hasFootnote ? item.slice(0, -1) : item;

          return (
            <div
              key={item}
              className="group relative flex flex-col gap-4 bg-card p-6 transition-colors hover:bg-primary/[0.035]"
            >
              <div className="flex size-8 items-center justify-center rounded-md border border-primary/20 bg-primary/5 text-primary">
                <Check aria-hidden className="size-4" weight="bold" />
              </div>

              <div className="space-y-2">
                <h4 className="text-base leading-6 font-medium text-foreground transition-colors group-hover:text-primary">
                  {displayText}
                </h4>
                {hasFootnote && (
                  <p className="text-xs text-muted-foreground/70">
                    Subject to fair-use and abuse prevention.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PricingCommonFeatures;
