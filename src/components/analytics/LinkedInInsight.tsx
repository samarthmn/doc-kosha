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
import { isLinkedInInsightEnabled } from "@/lib/deployment";

interface LinkedInInsightProps {
  partnerId?: string;
}

const syncLinkedInInsight = async (
  partnerId: string,
  consent: AnalyticsConsent | null,
): Promise<void> => {
  if (!isAllowed("analytics", consent)) {
    await unloadVendor("linkedin_insight", { partnerId });
    return;
  }

  await loadVendor("linkedin_insight", { partnerId });
};

export const LinkedInInsight: React.FC<LinkedInInsightProps> = ({
  partnerId,
}) => {
  useEffect(() => {
    if (!partnerId) return;
    if (!isLinkedInInsightEnabled()) return;

    const { consent } = bootstrapAnalyticsConsent();
    void syncLinkedInInsight(partnerId, consent ?? readAnalyticsConsent());

    const unsubscribe = subscribeToAnalyticsConsent((nextConsent) => {
      void syncLinkedInInsight(
        partnerId,
        nextConsent ?? readAnalyticsConsent(),
      );
    });

    return () => {
      unsubscribe();
      void unloadVendor("linkedin_insight", { partnerId });
    };
  }, [partnerId]);

  return null;
};
