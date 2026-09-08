"use client";

import React from "react";
import { CardContent, CardHeader } from "@/components/ui/card";
import { SurfaceCard } from "@/components/ui/surface-card";
import { cn } from "@/lib/utils";

interface PublicGateShellProps {
  /** Gate title, e.g. "Password Protected Link" */
  title: string;
  /** Short description below the title */
  description?: string;
  /** The form / action content rendered inside the card body */
  children: React.ReactNode;
  /** Optional error message shown below the form */
  error?: string | null;
  className?: string;
}

/**
 * Consistent wrapper for all public gating flows (password, email OTP, NDA).
 *
 * Guarantees:
 * - centered layout on all breakpoints
 * - Nocturne surface treatment for visual consistency with public viewers
 * - consistent title/description hierarchy
 * - error announcement via aria-live
 * - mobile-friendly sizing (max-w-md, full-width inputs)
 */
const PublicGateShell: React.FC<PublicGateShellProps> = ({
  title,
  description,
  children,
  error,
  className,
}) => {
  return (
    <div
      translate="no"
      data-ph-no-capture
      className={cn(
        "ph-no-capture notranslate relative isolate flex min-h-screen w-full items-center justify-center overflow-hidden bg-background px-4 py-8 sm:px-6",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_50%_-10%,color-mix(in_srgb,var(--primary)_12%,transparent),transparent_42%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 -z-10 h-px bg-gradient-to-r from-transparent via-border/70 to-transparent"
        aria-hidden
      />
      <SurfaceCard className="relative w-full max-w-md overflow-hidden border-border/70 bg-card/85 shadow-[0_18px_60px_-36px_color-mix(in_srgb,var(--foreground)_45%,transparent)] backdrop-blur-xl">
        <div
          className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/80 to-transparent"
          aria-hidden
        />
        <CardHeader className="space-y-2.5 px-5 pt-7 text-left sm:px-7 sm:pt-8">
          <div className="h-0.5 w-9 rounded-full bg-primary/75" aria-hidden />
          <h1 className="pt-1 text-xl leading-none font-medium tracking-[-0.02em]">
            {title}
          </h1>
          {description ? (
            <p className="max-w-sm text-sm leading-6 text-pretty text-muted-foreground">
              {description}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="mt-1 space-y-4 px-5 pt-0 pb-7 sm:px-7 sm:pb-8">
          {children}
          {error ? (
            <p
              role="alert"
              aria-live="polite"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </CardContent>
      </SurfaceCard>
    </div>
  );
};

export { PublicGateShell };
