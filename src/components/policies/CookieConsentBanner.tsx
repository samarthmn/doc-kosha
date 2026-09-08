"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Cookie, SlidersHorizontal, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { exitFade, riseIn } from "@/lib/motion";
import { clientEnv } from "@/lib/env";
import {
  APOLLO_TRACKER_APP_ID,
  isApolloTrackerEnabled,
  isGoogleAdsEnabled,
  isGoogleAnalyticsEnabled,
  isLinkedInInsightEnabled,
  isMetaPixelEnabled,
  isPostHogEnabled,
} from "@/lib/deployment";
import {
  bootstrapAnalyticsConsent,
  saveAnalyticsConsent,
  type ConsentRegion,
} from "@/lib/analytics/consent";

export const CookieConsentBanner: React.FC = () => {
  const gaEnabled =
    isGoogleAnalyticsEnabled() &&
    Boolean(clientEnv.NEXT_PUBLIC_GA_MEASUREMENT_ID);
  const googleAdsEnabled =
    isGoogleAdsEnabled() && Boolean(clientEnv.NEXT_PUBLIC_GOOGLE_ADS_ID);
  const linkedInInsightEnabled =
    isLinkedInInsightEnabled() &&
    Boolean(clientEnv.NEXT_PUBLIC_LINKEDIN_PARTNER_ID);
  const apolloTrackerEnabled =
    isApolloTrackerEnabled() && Boolean(APOLLO_TRACKER_APP_ID);
  const metaPixelEnabled =
    isMetaPixelEnabled() && Boolean(clientEnv.NEXT_PUBLIC_META_PIXEL_ID);
  const postHogEnabled =
    isPostHogEnabled() && Boolean(clientEnv.NEXT_PUBLIC_POSTHOG_KEY);
  const analyticsStackEnabled =
    gaEnabled ||
    googleAdsEnabled ||
    linkedInInsightEnabled ||
    apolloTrackerEnabled ||
    metaPixelEnabled ||
    postHogEnabled;

  const [mounted, setMounted] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [replayEnabled, setReplayEnabled] = useState(false);
  const [region, setRegion] = useState<ConsentRegion>("EU_EEA_UK");
  const [gpcEnabled, setGpcEnabled] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!analyticsStackEnabled) return;

    const bootstrap = bootstrapAnalyticsConsent();

    setRegion(bootstrap.region);
    setGpcEnabled(bootstrap.gpcEnabled);
    setAnalyticsEnabled(bootstrap.consent?.analytics ?? false);
    setReplayEnabled(bootstrap.consent?.replay ?? false);

    if (!bootstrap.requiresEuConsent) {
      setShowBanner(false);
      return;
    }

    const timer = window.setTimeout(() => setShowBanner(true), 600);
    return () => window.clearTimeout(timer);
  }, [analyticsStackEnabled]);

  const helperCopy = useMemo(() => {
    if (gpcEnabled) {
      return "Global Privacy Control is enabled in your browser. Analytics and session recording are disabled automatically.";
    }

    if (region === "EU_EEA_UK") {
      return "We only load analytics after you opt in.";
    }

    return "You can manage analytics and session recording anytime from Privacy settings.";
  }, [gpcEnabled, region]);

  const applyConsent = (analytics: boolean, replay: boolean) => {
    const next = saveAnalyticsConsent({ analytics, replay, region });
    setAnalyticsEnabled(next.analytics);
    setReplayEnabled(next.replay);
    setShowBanner(false);
    setIsCustomizing(false);
  };

  if (!analyticsStackEnabled) return null;
  if (!mounted) return null;

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          {...riseIn}
          {...exitFade}
          className="dk-mobile-floating-chrome fixed right-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-3 z-50 mx-auto w-auto max-w-[calc(100vw-1.5rem)] lg:right-4 lg:bottom-4 lg:left-auto lg:max-w-md"
        >
          <div
            className={cn(
              "dk-nocturne-overlay relative overflow-hidden rounded-[14px] p-5",
            )}
          >
            <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />

            <div className="relative flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/8 text-primary">
                    <Cookie className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-sm leading-tight font-medium">
                      Privacy Preferences
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {helperCopy}
                    </p>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="-mt-1 -mr-1 h-8 w-8 rounded-md text-muted-foreground hover:bg-muted/50"
                  onClick={() => applyConsent(false, false)}
                  aria-label="Close privacy banner"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              {isCustomizing && (
                <div className="space-y-4 rounded-lg border border-border bg-background/35 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Label
                        htmlFor="consent-analytics"
                        className="font-medium"
                      >
                        Analytics
                      </Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Helps us understand usage and improve the product.
                      </p>
                    </div>
                    <Switch
                      id="consent-analytics"
                      checked={analyticsEnabled}
                      onCheckedChange={(checked) => {
                        setAnalyticsEnabled(checked);
                        if (!checked) setReplayEnabled(false);
                      }}
                      aria-label="Toggle product analytics"
                      disabled={gpcEnabled}
                    />
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Label htmlFor="consent-replay" className="font-medium">
                        Session Recording
                      </Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Helps diagnose UX issues. Sensitive surfaces are masked
                        and blocked from capture.
                      </p>
                    </div>
                    <Switch
                      id="consent-replay"
                      checked={replayEnabled}
                      onCheckedChange={setReplayEnabled}
                      aria-label="Toggle session recording"
                      disabled={gpcEnabled || !analyticsEnabled}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
                {!isCustomizing && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCustomizing(true)}
                    className="h-9 bg-transparent px-4"
                  >
                    <SlidersHorizontal
                      className="mr-2 h-4 w-4"
                      aria-hidden="true"
                    />
                    Customize
                  </Button>
                )}

                {isCustomizing ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsCustomizing(false)}
                      className="h-9 bg-transparent px-4"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        applyConsent(analyticsEnabled, replayEnabled)
                      }
                      className="h-9 rounded-md border border-primary bg-transparent px-5 text-primary hover:bg-primary/10 hover:text-primary"
                    >
                      Save Preferences
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => applyConsent(false, false)}
                      className="h-9 bg-transparent px-4 font-normal text-muted-foreground hover:text-foreground"
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => applyConsent(true, true)}
                      className="h-9 rounded-md border border-primary bg-transparent px-5 text-primary hover:bg-primary/10 hover:text-primary"
                    >
                      Accept
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
