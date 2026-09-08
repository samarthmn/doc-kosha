type DeploymentEnv = "local" | "staging" | "production";

const isDeploymentEnv = (v: unknown): v is DeploymentEnv =>
  v === "local" || v === "staging" || v === "production";

const getDeploymentEnv = (): DeploymentEnv => {
  const publicEnv = process.env.NEXT_PUBLIC_APP_ENV;
  if (isDeploymentEnv(publicEnv)) return publicEnv;

  return process.env.NODE_ENV === "production" ? "production" : "local";
};

const isProductionDeployment = (): boolean =>
  getDeploymentEnv() === "production";

// E2E-only escape hatch: Playwright sets this (playwright.config.ts webServerEnv)
// so consent-gated vendor loading can be exercised against stubbed hosts in
// local runs. Must stay a literal NEXT_PUBLIC_* access so Next inlines it.
const isE2EAnalyticsStubEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_E2E_ANALYTICS_STUB === "true";

const hasConfiguredValue = (value: string | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

export const isSentryEnabled = (): boolean =>
  isProductionDeployment() &&
  (hasConfiguredValue(process.env.NEXT_PUBLIC_SENTRY_DSN) ||
    hasConfiguredValue(process.env.SENTRY_DSN));

export const isPostHogEnabled = (): boolean =>
  isProductionDeployment() || isE2EAnalyticsStubEnabled();

export const isGoogleAnalyticsEnabled = (): boolean => isProductionDeployment();

export const isGoogleAdsEnabled = (): boolean => isProductionDeployment();

export const isLinkedInInsightEnabled = (): boolean =>
  isProductionDeployment() || isE2EAnalyticsStubEnabled();

export const isApolloTrackerEnabled = (): boolean =>
  isProductionDeployment() &&
  hasConfiguredValue(process.env.NEXT_PUBLIC_APOLLO_TRACKER_APP_ID);

// Public (non-secret) Apollo tracker app id. Must stay a literal NEXT_PUBLIC_*
// access so Next inlines it. With no configured id, the tracker stays inert.
export const APOLLO_TRACKER_APP_ID =
  process.env.NEXT_PUBLIC_APOLLO_TRACKER_APP_ID;

export const isMetaPixelEnabled = (): boolean => isProductionDeployment();
