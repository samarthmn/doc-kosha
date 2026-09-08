"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import Logo from "@/components/ui/logo";
import { themeInitScript } from "@/components/theme/themeInitScript";
import { isSentryEnabled } from "@/lib/deployment";
import { cn } from "@/lib/utils";
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";
// global-error replaces the root layout, so global styles must be imported here.
import "@/app/globals.css";

const sentryEnabled = isSentryEnabled();

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (sentryEnabled) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12 sm:px-6">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,color-mix(in_srgb,var(--destructive)_7%,transparent),transparent_44%)]"
            aria-hidden
          />
          <div className="dk-nocturne-surface relative w-full max-w-xl overflow-hidden rounded-lg p-6 sm:p-8">
            <div
              className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-destructive/65 to-transparent"
              aria-hidden
            />
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <Logo className="size-6" aria-hidden />
                <span className="text-base font-medium tracking-[-0.015em]">
                  DocKosha
                </span>
              </div>
              <div className="flex size-10 items-center justify-center rounded border border-destructive/25 bg-destructive/[0.06] text-destructive">
                <WarningCircle
                  className="size-5"
                  weight="duotone"
                  aria-hidden
                />
              </div>
            </div>
            <div className="mt-7 border-l border-destructive/45 pl-4">
              <h1 className="text-[2rem] leading-tight font-medium tracking-[-0.025em]">
                Something went wrong
              </h1>
              <p className="mt-3 max-w-[48ch] text-[15px] leading-6 text-muted-foreground">
                An unexpected error occurred. Please try again — if the problem
                persists, contact support.
              </p>
            </div>
            <div className="mt-7 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row">
              <Button className="h-10" onClick={() => reset()}>
                <ArrowClockwise className="size-4" aria-hidden />
                Try again
              </Button>
              {/* global-error replaces the crashed root layout, so navigation
                  must be a full-page load rather than a client-side <Link>. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                className={cn(buttonVariants({ variant: "outline" }), "h-10")}
                href="/dashboard"
              >
                Go to dashboard
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
