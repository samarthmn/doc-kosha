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
import { isGoogleAdsEnabled } from "@/lib/deployment";

interface GoogleAdsProps {
  adsId?: string;
}

const syncGoogleAds = async (
  adsId: string,
  consent: AnalyticsConsent | null,
): Promise<void> => {
  if (!isAllowed("analytics", consent)) {
    await unloadVendor("google_ads", { adsId });
    return;
  }

  await loadVendor("google_ads", { adsId });
};

export const GoogleAds: React.FC<GoogleAdsProps> = ({ adsId }) => {
  useEffect(() => {
    if (!adsId) return;
    if (!isGoogleAdsEnabled()) return;

    const { consent } = bootstrapAnalyticsConsent();
    void syncGoogleAds(adsId, consent ?? readAnalyticsConsent());

    const unsubscribe = subscribeToAnalyticsConsent((nextConsent) => {
      void syncGoogleAds(adsId, nextConsent ?? readAnalyticsConsent());
    });

    return () => {
      unsubscribe();
      void unloadVendor("google_ads", { adsId });
    };
  }, [adsId]);

  return null;
};
