"use client";

import React, { useEffect } from "react";

declare global {
  interface Window {
    __dkPublicHydrated?: boolean;
  }
}

/**
 * Proof-of-life for publicChunkRecoveryScript's hydration deadline: mounted
 * from the /d and /r layouts, it flips the flag the inline watchdog polls.
 * If React never mounts on a public route (failed chunk, dead hydration),
 * the flag stays unset and the watchdog reloads or prompts.
 */
const PublicHydrationMarker: React.FC = () => {
  useEffect(() => {
    window.__dkPublicHydrated = true;
  }, []);
  return null;
};

export { PublicHydrationMarker };
