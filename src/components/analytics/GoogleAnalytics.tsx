"use client";

import React, { useEffect } from "react";
import {
  bootstrapAnalyticsConsent,
  isAllowed,
  loadVendor,
  readAnalyticsConsent,
  subscribeToAnalyticsConsent,
  unloadVendor,
  type AnalyticsConsent,
} from "@/lib/analytics/consent";
import { isGoogleAnalyticsEnabled } from "@/lib/deployment";

interface GoogleAnalyticsProps {
  gaId?: string;
}

const syncGoogleAnalytics = async (
  gaId: string,
  consent: AnalyticsConsent | null,
): Promise<void> => {
  if (!isAllowed("analytics", consent)) {
    await unloadVendor("google_analytics", { measurementId: gaId });
    return;
  }

  await loadVendor("google_analytics", { measurementId: gaId });
};

export const GoogleAnalytics: React.FC<GoogleAnalyticsProps> = ({ gaId }) => {
  useEffect(() => {
    if (!gaId) return;
    if (!isGoogleAnalyticsEnabled()) return;

    const { consent } = bootstrapAnalyticsConsent();
    void syncGoogleAnalytics(gaId, consent ?? readAnalyticsConsent());

    const unsubscribe = subscribeToAnalyticsConsent((nextConsent) => {
      void syncGoogleAnalytics(gaId, nextConsent ?? readAnalyticsConsent());
    });

    return () => {
      unsubscribe();
      void unloadVendor("google_analytics", { measurementId: gaId });
    };
  }, [gaId]);

  return null;
};
