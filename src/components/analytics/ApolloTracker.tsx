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
import { isApolloTrackerEnabled } from "@/lib/deployment";

interface ApolloTrackerProps {
  appId?: string;
}

const syncApolloTracker = async (
  appId: string,
  consent: AnalyticsConsent | null,
): Promise<void> => {
  if (!isAllowed("analytics", consent)) {
    await unloadVendor("apollo_tracker", { appId });
    return;
  }

  await loadVendor("apollo_tracker", { appId });
};

export const ApolloTracker: React.FC<ApolloTrackerProps> = ({ appId }) => {
  useEffect(() => {
    if (!appId) return;
    if (!isApolloTrackerEnabled()) return;

    const { consent } = bootstrapAnalyticsConsent();
    void syncApolloTracker(appId, consent ?? readAnalyticsConsent());

    const unsubscribe = subscribeToAnalyticsConsent((nextConsent) => {
      void syncApolloTracker(appId, nextConsent ?? readAnalyticsConsent());
    });

    return () => {
      unsubscribe();
      void unloadVendor("apollo_tracker", { appId });
    };
  }, [appId]);

  return null;
};
