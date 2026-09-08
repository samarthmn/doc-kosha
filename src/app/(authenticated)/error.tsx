"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import React, { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { isSentryEnabled } from "@/lib/deployment";
import { cn } from "@/lib/utils";
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";

const sentryEnabled = isSentryEnabled();

const AuthenticatedError: React.FC<{
  error: Error & { digest?: string };
  reset: () => void;
}> = ({ error, reset }) => {
  useEffect(() => {
    if (sentryEnabled) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <div className="relative flex min-h-[70vh] items-center justify-center overflow-hidden px-4 py-12 sm:px-6">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,color-mix(in_srgb,var(--destructive)_7%,transparent),transparent_44%)]"
        aria-hidden
      />
      <div className="dk-nocturne-surface relative w-full max-w-xl overflow-hidden rounded-lg p-6 sm:p-8">
        <div
          className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-destructive/65 to-transparent"
          aria-hidden
        />
        <div className="flex size-11 items-center justify-center rounded border border-destructive/25 bg-destructive/[0.06] text-destructive">
          <WarningCircle className="size-5" weight="duotone" aria-hidden />
        </div>
        <div className="mt-7 border-l border-destructive/45 pl-4">
          <h1 className="text-[2rem] leading-tight font-medium tracking-[-0.025em]">
            Something went wrong
          </h1>
          <p className="mt-3 max-w-[48ch] text-[15px] leading-6 text-muted-foreground">
            An unexpected error occurred while loading this page. Try again, or
            head back to your dashboard.
          </p>
        </div>
        <div className="mt-7 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row">
          <Button className="h-10" onClick={() => reset()}>
            <ArrowClockwise className="size-4" aria-hidden />
            Try again
          </Button>
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

export default AuthenticatedError;
