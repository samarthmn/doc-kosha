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
import { isMetaPixelEnabled } from "@/lib/deployment";

interface MetaPixelProps {
  pixelId?: string;
}

const syncMetaPixel = async (
  pixelId: string,
  consent: AnalyticsConsent | null,
): Promise<void> => {
  if (!isAllowed("analytics", consent)) {
    await unloadVendor("meta_pixel", { pixelId });
    return;
  }

  await loadVendor("meta_pixel", { pixelId });
};

export const MetaPixel: React.FC<MetaPixelProps> = ({ pixelId }) => {
  useEffect(() => {
    if (!pixelId) return;
    if (!isMetaPixelEnabled()) return;

    const { consent } = bootstrapAnalyticsConsent();
    void syncMetaPixel(pixelId, consent ?? readAnalyticsConsent());

    const unsubscribe = subscribeToAnalyticsConsent((nextConsent) => {
      void syncMetaPixel(pixelId, nextConsent ?? readAnalyticsConsent());
    });

    return () => {
      unsubscribe();
      void unloadVendor("meta_pixel", { pixelId });
    };
  }, [pixelId]);

  return null;
};
