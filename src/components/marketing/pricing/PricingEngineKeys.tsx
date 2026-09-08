import React from "react";
import Link from "next/link";
import { Key, Package, Scales } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import pricingCopy from "@/content/pricing.json";

const itemIcons = [Package, Key, Scales] as const;

const PricingEngineKeys: React.FC<{ className?: string }> = ({ className }) => {
  const engineKeys = pricingCopy.engineKeys;
  const items = engineKeys?.items ?? [];

  if (!items.length) return null;

  return (
    <div className={cn("py-8", className)}>
      <div className="mb-12 grid gap-6 lg:grid-cols-[0.7fr_1fr] lg:items-end">
        <div>
          <div className="mb-5 inline-flex size-9 items-center justify-center rounded-md border border-primary/25 bg-primary/5 text-primary">
            <Key aria-hidden className="size-4" weight="bold" />
          </div>
          <h3 className="text-3xl font-medium tracking-[-0.03em] md:text-4xl">
            {engineKeys.title}
          </h3>
        </div>
        {engineKeys.subtitle ? (
          <p className="max-w-[58ch] text-[0.9375rem] leading-7 text-muted-foreground">
            {engineKeys.subtitle}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {items.map((item, index) => {
          const Icon = itemIcons[index % itemIcons.length];
          return (
            <div
              key={item.title}
              className="flex flex-col items-start rounded-lg border bg-card p-6 [box-shadow:var(--dk-shadow-card)]"
            >
              <div className="mb-5 rounded-md border border-primary/20 bg-primary/5 p-2.5 text-primary">
                <Icon aria-hidden className="size-5" />
              </div>
              <h4 className="mb-2 text-xl font-medium">{item.title}</h4>
              <p className="text-sm leading-6 text-muted-foreground">
                {item.body}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col gap-5 rounded-lg border border-primary/25 bg-primary/[0.045] px-6 py-6 md:flex-row md:items-center md:justify-between md:px-8">
        <p className="max-w-[62ch] text-sm leading-6 text-muted-foreground">
          {engineKeys.cta.note}
        </p>
        <Button
          asChild
          size="lg"
          variant="outline"
          className="shrink-0 bg-transparent"
        >
          <Link href={engineKeys.cta.href}>{engineKeys.cta.label}</Link>
        </Button>
      </div>
    </div>
  );
};

export default PricingEngineKeys;
