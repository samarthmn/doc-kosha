import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PricingCTABanner: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-primary/25 bg-primary/[0.045] px-6 py-12 md:px-12 md:py-16",
        className,
      )}
    >
      <div className="pointer-events-none absolute -top-24 right-0 size-64 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative z-10 max-w-3xl space-y-6">
        <h2 className="text-3xl font-medium tracking-[-0.03em] md:text-4xl">
          Start with a free room, then upgrade when volume grows
        </h2>
        <p className="max-w-2xl text-[0.9375rem] leading-7 text-muted-foreground">
          Use core room controls for secure sharing: permissions, watermarking,
          NDA or email gates, and privacy-first analytics. Essential still
          includes a 14-day trial when you are ready for paid capacity.
        </p>
        <div className="flex flex-col gap-4 pt-4 sm:flex-row">
          <Button size="lg" variant="outline" asChild className="font-semibold">
            <Link href="/auth/sign-in?redirect=%2Fonboarding">Start free</Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            asChild
            className="bg-transparent"
          >
            <Link href="/contact">Book a walkthrough</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PricingCTABanner;
