"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { clientEnv } from "@/lib/env";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import {
  capturePostHogEvent,
  capturePostHogPageview,
  identifyPostHogUser,
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
import {
  buildLandingAttributionProperties,
  getLandingAttribution,
} from "@/lib/analytics/landingAttribution";
import {
  DEFAULT_POSTHOG_HOST,
  POSTHOG_SESSION_RECORDING_BLOCK_SELECTOR,
} from "@/lib/analytics/posthogConfig";

const REPLAY_BLOCKED_PATH_PATTERNS: RegExp[] = [
  /^\/auth(?:\/|$)/i,
  /^\/(?:login|signup|billing|checkout|settings|security)(?:\/|$)/i,
  /^\/support(?:\/|$)/i,
  /^\/documents(?:\/|$)/i,
  /^\/data-rooms(?:\/|$)/i,
];

const isReplayBlockedPath = (pathname: string | null): boolean => {
  if (!pathname) return true;
  return REPLAY_BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
};

export const PostHogAuthenticated: React.FC = () => {
  const isLoading = useGlobalStore((s) => s.isLoading);
  const isAuthenticated = useGlobalStore((s) => s.isAuthenticated);
  const authUser = useGlobalStore((s) => s.authUser);
  const currentWorkspaceId = useGlobalStore((s) => s.currentWorkspaceId);
  const subscription = useGlobalStore((s) => s.currentWorkspaceSubscription);
  const userProfile = useGlobalStore((s) => s.userProfile);

  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [consent, setConsent] = React.useState<AnalyticsConsent | null>(null);

  const enabled =
    isPostHogEnabled() && Boolean(clientEnv.NEXT_PUBLIC_POSTHOG_KEY);

  const apiHost = useMemo(
    () => clientEnv.NEXT_PUBLIC_POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST,
    [],
  );

  const globalProperties = useMemo(
    () => ({
      app_env: clientEnv.NEXT_PUBLIC_APP_ENV,
      workspace_id: currentWorkspaceId ?? undefined,
      plan_id: subscription?.planId ?? undefined,
      subscription_status: subscription?.status ?? undefined,
      billing_interval: subscription?.billingInterval ?? undefined,
    }),
    [
      currentWorkspaceId,
      subscription?.billingInterval,
      subscription?.planId,
      subscription?.status,
    ],
  );

  const analyticsAllowed = isAllowed("analytics", consent);
  const replayAllowed = isAllowed("replay", consent);
  const replayBlockedForPath = useMemo(
    () => isReplayBlockedPath(pathname),
    [pathname],
  );
  const replayEnabledForRoute = replayAllowed && !replayBlockedForPath;
  const landingAttribution = useMemo(
    () => getLandingAttribution(searchParams),
    [searchParams],
  );

  const lastPageviewUrlRef = useRef<string>("");
  const lastSignedInUserIdRef = useRef<string>("");

  useEffect(() => {
    const { consent: initialConsent } = bootstrapAnalyticsConsent();
    setConsent(initialConsent ?? readAnalyticsConsent());

    return subscribeToAnalyticsConsent((nextConsent) => {
      setConsent(nextConsent ?? readAnalyticsConsent());
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (isLoading) return;
    if (!analyticsAllowed) return;
    if (!isAuthenticated || !authUser) return;

    void loadVendor("posthog", {
      handlers: {
        onLoad: async () => {
          const posthog = await initPostHogOnce({
            apiKey: clientEnv.NEXT_PUBLIC_POSTHOG_KEY!,
            apiHost,
            appEnv: clientEnv.NEXT_PUBLIC_APP_ENV,
            sessionRecordingBlockSelector:
              POSTHOG_SESSION_RECORDING_BLOCK_SELECTOR,
            sessionRecordingEnabled: replayEnabledForRoute,
          });

          if (!posthog) return;

          await setPostHogCaptureEnabled(true);
          await setPostHogReplayEnabled(replayEnabledForRoute);

          await identifyPostHogUser({
            distinctId: authUser.id,
            personProperties: {
              email: authUser.email ?? undefined,
              app_env: clientEnv.NEXT_PUBLIC_APP_ENV,
              primary_use_case: userProfile?.primary_use_case ?? undefined,
            },
            globalProperties,
          });

          if (lastSignedInUserIdRef.current === authUser.id) return;
          lastSignedInUserIdRef.current = authUser.id;

          await capturePostHogEvent({
            event: "user_signed_in",
            properties: {
              ...globalProperties,
              ...buildLandingAttributionProperties(landingAttribution),
              auth_provider:
                (authUser.app_metadata as { provider?: string } | undefined)
                  ?.provider ?? undefined,
            },
          });
        },
      },
    });
  }, [
    analyticsAllowed,
    apiHost,
    authUser,
    enabled,
    globalProperties,
    isAuthenticated,
    isLoading,
    landingAttribution,
    replayEnabledForRoute,
    userProfile?.primary_use_case,
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (isLoading) return;
    if (isAuthenticated && analyticsAllowed) return;

    lastPageviewUrlRef.current = "";
    lastSignedInUserIdRef.current = "";

    void unloadVendor("posthog", {
      handlers: {
        onUnload: async () => {
          await setPostHogReplayEnabled(false);
          await setPostHogCaptureEnabled(false);
          await resetPostHog();
        },
      },
    });
  }, [analyticsAllowed, enabled, isAuthenticated, isLoading]);

  useEffect(() => {
    if (!enabled) return;
    if (isLoading) return;
    if (!analyticsAllowed) return;
    if (!isAuthenticated || !authUser) return;
    if (!pathname) return;

    let url = window.location.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;

    if (lastPageviewUrlRef.current === url) return;
    lastPageviewUrlRef.current = url;

    void capturePostHogPageview({
      url,
      properties: globalProperties,
    });
  }, [
    analyticsAllowed,
    authUser,
    enabled,
    globalProperties,
    isAuthenticated,
    isLoading,
    pathname,
    searchParams,
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (isLoading) return;
    if (!isAuthenticated) return;
    if (!analyticsAllowed) return;

    void setPostHogReplayEnabled(replayEnabledForRoute);
  }, [
    analyticsAllowed,
    enabled,
    isAuthenticated,
    isLoading,
    replayEnabledForRoute,
  ]);

  return null;
};
