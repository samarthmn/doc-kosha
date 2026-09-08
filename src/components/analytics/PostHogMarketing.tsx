"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { clientEnv } from "@/lib/env";
import {
  capturePostHogPageview,
  initPostHogOnce,
  resetPostHog,
  setPostHogCaptureEnabled,
  setPostHogReplayEnabled,
} from "@/lib/analytics/posthog";
import {
  bootstrapAnalyticsConsent,
  isAllowed,
  loadVendor,
  readAnalyticsConsent,
  subscribeToAnalyticsConsent,
  unloadVendor,
  type AnalyticsConsent,
} from "@/lib/analytics/consent";
import { isPostHogEnabled } from "@/lib/deployment";
import { trackProductEvent } from "@/lib/analytics/productEvents";
import {
  DEFAULT_POSTHOG_HOST,
  POSTHOG_SESSION_RECORDING_BLOCK_SELECTOR,
} from "@/lib/analytics/posthogConfig";

type MarketingAnalyticsEvent =
  | "landing_primary_cta_clicked"
  | "landing_secondary_cta_clicked"
  | "landing_section_cta_clicked"
  | "landing_resource_clicked";

type MarketingAnalyticsContextValue = {
  trackMarketingEvent: (
    event: MarketingAnalyticsEvent,
    properties?: Record<string, unknown>,
  ) => void;
};

const MarketingAnalyticsContext = createContext<MarketingAnalyticsContextValue>(
  {
    trackMarketingEvent: () => {},
  },
);

export const useMarketingAnalytics = (): MarketingAnalyticsContextValue =>
  useContext(MarketingAnalyticsContext);

export const PostHogMarketing: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);

  const enabled =
    isPostHogEnabled() && Boolean(clientEnv.NEXT_PUBLIC_POSTHOG_KEY);
  const analyticsAllowed = isAllowed("analytics", consent);
  const apiHost = useMemo(
    () => clientEnv.NEXT_PUBLIC_POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST,
    [],
  );

  const initOptions = useMemo(
    () => ({
      apiKey: clientEnv.NEXT_PUBLIC_POSTHOG_KEY!,
      apiHost,
      appEnv: clientEnv.NEXT_PUBLIC_APP_ENV,
      sessionRecordingBlockSelector: POSTHOG_SESSION_RECORDING_BLOCK_SELECTOR,
      sessionRecordingEnabled: false,
    }),
    [apiHost],
  );

  const lastPageviewUrlRef = useRef("");

  useEffect(() => {
    const { consent: initialConsent } = bootstrapAnalyticsConsent();
    setConsent(initialConsent ?? readAnalyticsConsent());

    return subscribeToAnalyticsConsent((nextConsent) => {
      setConsent(nextConsent ?? readAnalyticsConsent());
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!analyticsAllowed) {
      lastPageviewUrlRef.current = "";

      void unloadVendor("posthog", {
        handlers: {
          onUnload: async () => {
            await setPostHogReplayEnabled(false);
            await setPostHogCaptureEnabled(false);
            await resetPostHog();
          },
        },
      });
      return;
    }

    void loadVendor("posthog", {
      handlers: {
        onLoad: async () => {
          const posthog = await initPostHogOnce(initOptions);
          if (!posthog) return;

          await setPostHogCaptureEnabled(true);
          await setPostHogReplayEnabled(false);
        },
      },
    });
  }, [analyticsAllowed, enabled, initOptions]);

  useEffect(() => {
    if (!enabled) return;
    if (!analyticsAllowed) return;
    if (!pathname) return;

    const capturePageview = async () => {
      const posthog = await initPostHogOnce(initOptions);
      if (!posthog) return;

      let url = window.location.origin + pathname;
      const qs = searchParams?.toString();
      if (qs) {
        url += `?${qs}`;
      }

      if (lastPageviewUrlRef.current === url) return;
      lastPageviewUrlRef.current = url;

      await capturePostHogPageview({
        url,
        properties: {
          page_type: "marketing",
        },
      });
    };

    void capturePageview();
  }, [analyticsAllowed, enabled, initOptions, pathname, searchParams]);

  const trackMarketingEvent = useCallback(
    (event: MarketingAnalyticsEvent, properties?: Record<string, unknown>) => {
      trackProductEvent(event, properties);
    },
    [],
  );

  const contextValue = useMemo<MarketingAnalyticsContextValue>(
    () => ({
      trackMarketingEvent,
    }),
    [trackMarketingEvent],
  );

  return (
    <MarketingAnalyticsContext.Provider value={contextValue}>
      {children}
    </MarketingAnalyticsContext.Provider>
  );
};
