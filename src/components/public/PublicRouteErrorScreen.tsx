"use client";

import * as Sentry from "@sentry/nextjs";
import React, { useEffect } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";
import { PublicGateShell } from "@/components/public/PublicGateShell";
import { Button } from "@/components/ui/button";
import { isSentryEnabled } from "@/lib/deployment";

const sentryEnabled = isSentryEnabled();

interface PublicRouteErrorScreenProps {
  error: Error & { digest?: string };
}

/**
 * Shared error boundary UI for the public recipient routes (/d, /r). Without
 * it, a client-side failure (most commonly a stale chunk after a deploy)
 * leaves recipients on a frozen loading screen with no way forward. A full
 * reload — not Next's reset() — is the reliable recovery for stale chunks
 * because reset() re-renders with the same broken module graph.
 */
const PublicRouteErrorScreen: React.FC<PublicRouteErrorScreenProps> = ({
  error,
}) => {
  useEffect(() => {
    if (sentryEnabled) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <PublicGateShell
      title="Something went wrong"
      description="This page couldn't be displayed. Reloading usually fixes it — if the problem persists, ask the sender for a fresh link."
    >
      <Button className="h-10 w-full" onClick={() => window.location.reload()}>
        <ArrowClockwise className="size-4" aria-hidden />
        Reload page
      </Button>
    </PublicGateShell>
  );
};

export { PublicRouteErrorScreen };
