import Link from "next/link";
import React from "react";
import {
  ArrowRight,
  CreditCard,
  WarningCircle,
} from "@phosphor-icons/react/ssr";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CheckoutCanceledPage: React.FC<
  PageProps<"/billing/checkout/canceled">
> = async ({ searchParams }) => {
  const params = (await searchParams) ?? {};
  const rawState = params.state;
  const state = Array.isArray(rawState) ? rawState[0] : rawState;
  const isFailed = state === "failed";
  const title = isFailed
    ? "Payment could not be completed"
    : "Checkout canceled";
  const description = isFailed
    ? "Your payment didn’t complete. You can retry selecting a plan whenever you’re ready."
    : "You left the checkout before finishing. You can pick up where you left off by selecting a plan again.";

  return (
    <div className="relative flex min-h-[70vh] items-center justify-center overflow-hidden px-4 py-12 sm:px-6">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,color-mix(in_srgb,var(--primary)_9%,transparent),transparent_46%)]"
        aria-hidden
      />
      <div className="dk-nocturne-surface relative w-full max-w-xl overflow-hidden rounded-lg p-6 sm:p-8">
        <div
          className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent"
          aria-hidden
        />
        <div className="flex size-11 items-center justify-center rounded border border-primary/25 bg-primary/[0.06] text-primary">
          {isFailed ? (
            <WarningCircle className="size-5" aria-hidden />
          ) : (
            <CreditCard className="size-5" aria-hidden />
          )}
        </div>
        <div className="mt-7 border-l border-primary/45 pl-4">
          <h1 className="text-[2rem] leading-tight font-medium tracking-[-0.025em]">
            {title}
          </h1>
          <p className="mt-3 max-w-[48ch] text-[15px] leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="mt-7 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row">
          <Link
            className={cn(buttonVariants(), "h-10 justify-between")}
            href="/settings?tab=subscription&planPicker=1"
          >
            Return to plan selection
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link
            className={cn(buttonVariants({ variant: "outline" }), "h-10")}
            href="/dashboard"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};

export default CheckoutCanceledPage;
