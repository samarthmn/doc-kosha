import { getCookie, setCookie } from "cookies-next";
import {
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_CONSENT_EVENT,
  ANALYTICS_CONSENT_VERSION,
  ANALYTICS_REGION_COOKIE,
  normalizeConsentRegion,
  type ConsentRegion,
} from "@/lib/analytics/consent-region";

export { type ConsentRegion };

type AnalyticsCategory = "analytics" | "replay";
type AnalyticsVendorId =
  | "google_analytics"
  | "google_ads"
  | "posthog"
  | "linkedin_insight"
  | "apollo_tracker"
  | "meta_pixel";

export type AnalyticsConsent = {
  v: number;
  ts: string;
  region: ConsentRegion;
  analytics: boolean;
  replay: boolean;
  gpcSeen: boolean;
  decision: "default" | "explicit";
};

type AnalyticsConsentEventDetail = {
  consent: AnalyticsConsent | null;
};

type VendorLifecycleHandlers = {
  onLoad?: () => void | Promise<void>;
  onUnload?: () => void | Promise<void>;
};

type LoadVendorOptions = {
  measurementId?: string;
  adsId?: string;
  partnerId?: string;
  appId?: string;
  pixelId?: string;
  handlers?: VendorLifecycleHandlers;
};

type UnloadVendorOptions = LoadVendorOptions;

const CONSENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const GOOGLE_ANALYTICS_SCRIPT_ID = "dk-google-analytics-script";
const GOOGLE_ANALYTICS_BOOTSTRAP_ID = "dk-google-analytics-bootstrap";
const GOOGLE_ADS_SCRIPT_ID = "dk-google-ads-script";
const GOOGLE_ADS_BOOTSTRAP_ID = "dk-google-ads-bootstrap";
const LINKEDIN_INSIGHT_SCRIPT_ID = "dk-linkedin-insight-script";
const LINKEDIN_INSIGHT_BOOTSTRAP_ID = "dk-linkedin-insight-bootstrap";
const APOLLO_TRACKER_SCRIPT_ID = "dk-apollo-tracker-script";
const META_PIXEL_SCRIPT_ID = "dk-meta-pixel-script";
const META_PIXEL_BOOTSTRAP_ID = "dk-meta-pixel-bootstrap";

const loadedVendors = new Set<AnalyticsVendorId>();

export const isVendorLoaded = (vendorId: AnalyticsVendorId): boolean =>
  loadedVendors.has(vendorId);

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    lintrk?: LinkedInInsightFunction;
    _linkedin_data_partner_ids?: string[];
    _linkedin_partner_id?: string;
    trackingFunctions?: ApolloTrackingFunctions;
    fbq?: MetaPixelFunction;
    _fbq?: MetaPixelFunction;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }

  interface Navigator {
    globalPrivacyControl?: boolean;
  }
}

type LinkedInInsightFunction = ((...args: unknown[]) => void) & {
  q?: unknown[][];
};

type ApolloTrackingFunctions = {
  onLoad: (options: { appId: string }) => void;
};

type MetaPixelFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  push?: (args: unknown[]) => number;
  loaded?: boolean;
  version?: string;
};

const normalizeCookieString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const decodeCookieString = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const isIsoTimestamp = (value: string): boolean => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") return value;
  return fallback;
};

const defaultCategoryEnabled = (
  region: ConsentRegion,
  gpcSeen: boolean,
): boolean => region !== "EU_EEA_UK" && !gpcSeen;

const buildConsent = (options: {
  region: ConsentRegion;
  analytics: boolean;
  replay: boolean;
  gpcSeen: boolean;
  decision: "default" | "explicit";
  ts?: string;
}): AnalyticsConsent => {
  const analytics = options.analytics;
  const replay = analytics ? options.replay : false;

  return {
    v: ANALYTICS_CONSENT_VERSION,
    ts:
      typeof options.ts === "string" && isIsoTimestamp(options.ts)
        ? options.ts
        : new Date().toISOString(),
    region: options.region,
    analytics,
    replay,
    gpcSeen: options.gpcSeen,
    decision: options.decision,
  };
};

const parseStructuredConsent = (raw: string): AnalyticsConsent | null => {
  const decoded = decodeCookieString(raw);

  try {
    const parsed = JSON.parse(decoded);
    if (!isObjectRecord(parsed)) return null;

    const region = normalizeConsentRegion(
      typeof parsed.region === "string" ? parsed.region : null,
    );

    const gpcSeen = normalizeBoolean(parsed.gpcSeen, false);
    const analytics = normalizeBoolean(
      parsed.analytics,
      defaultCategoryEnabled(region, gpcSeen),
    );
    const replay = normalizeBoolean(
      parsed.replay,
      defaultCategoryEnabled(region, gpcSeen),
    );
    const defaultEnabled = defaultCategoryEnabled(region, gpcSeen);
    // EU bootstrap never auto-seeded a structured cookie, so an older EU
    // cookie without the marker necessarily came from an explicit choice.
    const decision =
      parsed.decision === "explicit" || parsed.decision === "default"
        ? parsed.decision
        : region === "EU_EEA_UK"
          ? "explicit"
          : analytics === defaultEnabled && replay === defaultEnabled
            ? "default"
            : "explicit";

    const version =
      typeof parsed.v === "number" && Number.isFinite(parsed.v) && parsed.v > 0
        ? parsed.v
        : ANALYTICS_CONSENT_VERSION;

    const ts =
      typeof parsed.ts === "string" && isIsoTimestamp(parsed.ts)
        ? parsed.ts
        : new Date().toISOString();

    return {
      ...buildConsent({
        region,
        analytics,
        replay,
        gpcSeen,
        decision,
        ts,
      }),
      v: version,
    };
  } catch {
    return null;
  }
};

const parseLegacyConsent = (raw: string): AnalyticsConsent | null => {
  const normalized = decodeCookieString(raw).trim().toLowerCase();
  if (normalized !== "granted" && normalized !== "denied") return null;

  const region = getConsentRegion();
  const granted = normalized === "granted";

  return buildConsent({
    region,
    analytics: granted,
    replay: granted,
    gpcSeen: false,
    decision: "default",
  });
};

const readRawConsentCookie = (): string | null =>
  normalizeCookieString(getCookie(ANALYTICS_CONSENT_COOKIE));

const isLegacyConsentCookieValue = (raw: string): boolean => {
  const normalized = decodeCookieString(raw).trim().toLowerCase();
  return normalized === "granted" || normalized === "denied";
};

const deleteConsentCookie = (): void => {
  // cookies-next doesn't expose deleteCookie here; emulate it.
  setCookie(ANALYTICS_CONSENT_COOKIE, "", {
    maxAge: 0,
    path: "/",
    sameSite: "lax",
  });
};

const writeConsentCookie = (consent: AnalyticsConsent): void => {
  setCookie(ANALYTICS_CONSENT_COOKIE, JSON.stringify(consent), {
    maxAge: CONSENT_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
  });
};

const getGoogleAnalyticsScriptMeasurementId = (): string | null => {
  if (typeof document === "undefined") return null;
  const script = document.getElementById(GOOGLE_ANALYTICS_SCRIPT_ID);
  const value = script?.getAttribute("data-measurement-id")?.trim();
  return value && value.length > 0 ? value : null;
};

const loadGoogleAnalyticsScript = (measurementId: string): void => {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const existingId = getGoogleAnalyticsScriptMeasurementId();
  if (existingId && existingId !== measurementId) {
    unloadGoogleAnalyticsScript(existingId);
  }

  if (document.getElementById(GOOGLE_ANALYTICS_SCRIPT_ID)) {
    window[`ga-disable-${measurementId}`] = false;
    return;
  }

  const script = document.createElement("script");
  script.id = GOOGLE_ANALYTICS_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  script.setAttribute("data-measurement-id", measurementId);

  const bootstrap = document.createElement("script");
  bootstrap.id = GOOGLE_ANALYTICS_BOOTSTRAP_ID;
  bootstrap.text =
    "window.dataLayer = window.dataLayer || [];" +
    "window.gtag = window.gtag || function gtag(){window.dataLayer.push(arguments);};" +
    "window.gtag('js', new Date());" +
    `window.gtag('config', '${measurementId}', { anonymize_ip: true });`;

  document.head.appendChild(script);
  document.head.appendChild(bootstrap);
  window[`ga-disable-${measurementId}`] = false;
};

const unloadGoogleAnalyticsScript = (measurementId?: string): void => {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const resolvedMeasurementId =
    measurementId ?? getGoogleAnalyticsScriptMeasurementId();
  if (resolvedMeasurementId) {
    window[`ga-disable-${resolvedMeasurementId}`] = true;
    window.gtag?.("consent", "update", { analytics_storage: "denied" });
  }

  document.getElementById(GOOGLE_ANALYTICS_SCRIPT_ID)?.remove();
  document.getElementById(GOOGLE_ANALYTICS_BOOTSTRAP_ID)?.remove();
};

const getGoogleAdsScriptId = (): string | null => {
  if (typeof document === "undefined") return null;
  const script = document.getElementById(GOOGLE_ADS_SCRIPT_ID);
  const value = script?.getAttribute("data-ads-id")?.trim();
  return value && value.length > 0 ? value : null;
};

const loadGoogleAdsScript = (adsId: string): void => {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const existingId = getGoogleAdsScriptId();
  if (existingId && existingId !== adsId) {
    unloadGoogleAdsScript(existingId);
  }

  if (document.getElementById(GOOGLE_ADS_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement("script");
  script.id = GOOGLE_ADS_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(adsId)}`;
  script.setAttribute("data-ads-id", adsId);

  const bootstrap = document.createElement("script");
  bootstrap.id = GOOGLE_ADS_BOOTSTRAP_ID;
  bootstrap.text =
    "window.dataLayer = window.dataLayer || [];" +
    "window.gtag = window.gtag || function gtag(){window.dataLayer.push(arguments);};" +
    "window.gtag('js', new Date());" +
    `window.gtag('config', '${adsId}');`;

  document.head.appendChild(script);
  document.head.appendChild(bootstrap);
};

const unloadGoogleAdsScript = (adsId?: string): void => {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const resolvedAdsId = adsId ?? getGoogleAdsScriptId();
  if (resolvedAdsId) {
    window.gtag?.("consent", "update", { ad_storage: "denied" });
  }

  document.getElementById(GOOGLE_ADS_SCRIPT_ID)?.remove();
  document.getElementById(GOOGLE_ADS_BOOTSTRAP_ID)?.remove();
};

const getLinkedInInsightPartnerId = (): string | null => {
  if (typeof document === "undefined") return null;
  const bootstrap = document.getElementById(LINKEDIN_INSIGHT_BOOTSTRAP_ID);
  const value = bootstrap?.getAttribute("data-partner-id")?.trim();
  return value && value.length > 0 ? value : null;
};

const loadLinkedInInsightScript = (partnerId: string): void => {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const existingId = getLinkedInInsightPartnerId();
  if (existingId && existingId !== partnerId) {
    unloadLinkedInInsightScript(existingId);
  }

  if (document.getElementById(LINKEDIN_INSIGHT_SCRIPT_ID)) {
    return;
  }

  const bootstrap = document.createElement("script");
  bootstrap.id = LINKEDIN_INSIGHT_BOOTSTRAP_ID;
  bootstrap.setAttribute("data-partner-id", partnerId);
  bootstrap.text =
    `window._linkedin_partner_id='${partnerId}';` +
    "window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];" +
    "window._linkedin_data_partner_ids.push(window._linkedin_partner_id);" +
    "(function(l){" +
    "if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};" +
    "window.lintrk.q=[]}" +
    "var s=document.getElementsByTagName('script')[0];" +
    "var b=document.createElement('script');" +
    "b.type='text/javascript';b.async=true;" +
    `b.id='${LINKEDIN_INSIGHT_SCRIPT_ID}';` +
    "b.src='https://snap.licdn.com/li.lms-analytics/insight.min.js';" +
    "s.parentNode.insertBefore(b,s)})(window.lintrk);";

  document.head.appendChild(bootstrap);
};

const unloadLinkedInInsightScript = (partnerId?: string): void => {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const resolvedPartnerId = partnerId ?? getLinkedInInsightPartnerId();

  document.getElementById(LINKEDIN_INSIGHT_SCRIPT_ID)?.remove();
  document.getElementById(LINKEDIN_INSIGHT_BOOTSTRAP_ID)?.remove();

  if (resolvedPartnerId && Array.isArray(window._linkedin_data_partner_ids)) {
    window._linkedin_data_partner_ids =
      window._linkedin_data_partner_ids.filter(
        (id) => id !== resolvedPartnerId,
      );
  }

  window._linkedin_partner_id = undefined;
  window.lintrk = undefined;
};

const getApolloTrackerAppId = (): string | null => {
  if (typeof document === "undefined") return null;
  const script = document.getElementById(APOLLO_TRACKER_SCRIPT_ID);
  const value = script?.getAttribute("data-app-id")?.trim();
  return value && value.length > 0 ? value : null;
};

const loadApolloTrackerScript = (appId: string): void => {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const existingAppId = getApolloTrackerAppId();
  if (existingAppId && existingAppId !== appId) {
    unloadApolloTrackerScript(existingAppId);
  }

  if (document.getElementById(APOLLO_TRACKER_SCRIPT_ID)) {
    return;
  }

  const cacheBust = Math.random().toString(36).slice(2);
  const script = document.createElement("script");
  script.id = APOLLO_TRACKER_SCRIPT_ID;
  script.async = true;
  script.defer = true;
  script.src =
    "https://assets.apollo.io/micro/website-tracker/tracker.iife.js?nocache=" +
    encodeURIComponent(cacheBust);
  script.setAttribute("data-app-id", appId);
  script.onload = () => {
    window.trackingFunctions?.onLoad({ appId });
  };

  document.head.appendChild(script);
};

const unloadApolloTrackerScript = (_appId?: string): void => {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  document.getElementById(APOLLO_TRACKER_SCRIPT_ID)?.remove();
  window.trackingFunctions = undefined;
};

const getMetaPixelId = (): string | null => {
  if (typeof document === "undefined") return null;
  const bootstrap = document.getElementById(META_PIXEL_BOOTSTRAP_ID);
  const value = bootstrap?.getAttribute("data-pixel-id")?.trim();
  return value && value.length > 0 ? value : null;
};

const loadMetaPixelScript = (pixelId: string): void => {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const existingPixelId = getMetaPixelId();
  if (existingPixelId && existingPixelId !== pixelId) {
    unloadMetaPixelScript(existingPixelId);
  }

  if (document.getElementById(META_PIXEL_SCRIPT_ID)) {
    window.fbq?.("track", "PageView");
    return;
  }

  const script = document.createElement("script");
  script.id = META_PIXEL_SCRIPT_ID;
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";

  const bootstrap = document.createElement("script");
  bootstrap.id = META_PIXEL_BOOTSTRAP_ID;
  bootstrap.setAttribute("data-pixel-id", pixelId);
  bootstrap.text =
    "window.fbq=window.fbq||function(){if(window.fbq.callMethod){" +
    "window.fbq.callMethod.apply(window.fbq, arguments);" +
    "}else{" +
    "window.fbq.queue=window.fbq.queue||[];" +
    "window.fbq.queue.push(Array.from(arguments));" +
    "}};" +
    "window._fbq=window._fbq||window.fbq;" +
    "window.fbq.push=window.fbq.push||function(args){window.fbq.queue=window.fbq.queue||[];return window.fbq.queue.push(args);};" +
    "window.fbq.loaded=true;" +
    "window.fbq.version='2.0';" +
    "window.fbq.queue=window.fbq.queue||[];" +
    `window.fbq('init', '${pixelId}');` +
    "window.fbq('track', 'PageView');";

  document.head.appendChild(script);
  document.head.appendChild(bootstrap);
};

const unloadMetaPixelScript = (_pixelId?: string): void => {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  document.getElementById(META_PIXEL_SCRIPT_ID)?.remove();
  document.getElementById(META_PIXEL_BOOTSTRAP_ID)?.remove();
  window.fbq = undefined;
  window._fbq = undefined;
};

export const buildDefaultAnalyticsConsent = (options: {
  region: ConsentRegion;
  gpcSeen: boolean;
}): AnalyticsConsent => {
  const enabled = defaultCategoryEnabled(options.region, options.gpcSeen);
  return buildConsent({
    region: options.region,
    analytics: enabled,
    replay: enabled,
    gpcSeen: options.gpcSeen,
    decision: "default",
  });
};

export const readAnalyticsConsent = (): AnalyticsConsent | null => {
  if (typeof window === "undefined") return null;

  const raw = readRawConsentCookie();
  if (!raw) return null;

  return parseStructuredConsent(raw) ?? parseLegacyConsent(raw);
};

const getConsentRegion = (): ConsentRegion => {
  const rawRegion = normalizeCookieString(getCookie(ANALYTICS_REGION_COOKIE));
  return normalizeConsentRegion(rawRegion);
};

const isGlobalPrivacyControlEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  return navigator.globalPrivacyControl === true;
};

const writeAnalyticsConsent = (consent: AnalyticsConsent): AnalyticsConsent => {
  const normalized = buildConsent({
    region: normalizeConsentRegion(consent.region),
    analytics: consent.analytics,
    replay: consent.replay,
    gpcSeen: consent.gpcSeen,
    decision: consent.decision,
    ts: consent.ts,
  });

  writeConsentCookie({
    ...normalized,
    v: consent.v || ANALYTICS_CONSENT_VERSION,
  });
  return normalized;
};

const emitAnalyticsConsentChange = (consent: AnalyticsConsent | null): void => {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<AnalyticsConsentEventDetail>(ANALYTICS_CONSENT_EVENT, {
      detail: { consent },
    }),
  );
};

export const subscribeToAnalyticsConsent = (
  listener: (consent: AnalyticsConsent | null) => void,
): (() => void) => {
  if (typeof window === "undefined") return () => {};

  const handleEvent = (event: Event) => {
    const customEvent = event as CustomEvent<
      AnalyticsConsentEventDetail | AnalyticsConsent | string
    >;
    const detail = customEvent.detail;

    if (isObjectRecord(detail) && "consent" in detail) {
      const consentValue = (detail as AnalyticsConsentEventDetail).consent;
      listener(consentValue ?? null);
      return;
    }

    if (isObjectRecord(detail) && "analytics" in detail) {
      const fallbackRegion = getConsentRegion();
      const normalized = buildConsent({
        region: normalizeConsentRegion(
          typeof detail.region === "string" ? detail.region : fallbackRegion,
        ),
        analytics: normalizeBoolean(detail.analytics, false),
        replay: normalizeBoolean(detail.replay, false),
        gpcSeen: normalizeBoolean(detail.gpcSeen, false),
        decision: detail.decision === "explicit" ? "explicit" : "default",
        ts: typeof detail.ts === "string" ? detail.ts : undefined,
      });
      listener(normalized);
      return;
    }

    if (typeof detail === "string") {
      listener(parseLegacyConsent(detail));
      return;
    }

    listener(readAnalyticsConsent());
  };

  window.addEventListener(ANALYTICS_CONSENT_EVENT, handleEvent);
  return () => {
    window.removeEventListener(ANALYTICS_CONSENT_EVENT, handleEvent);
  };
};

export const reconcileAnalyticsConsentRegion = (options: {
  consent: AnalyticsConsent;
  region: ConsentRegion;
  gpcEnabled: boolean;
}): {
  consent: AnalyticsConsent;
  changed: boolean;
  requiresEuConsent: boolean;
} => {
  let next = options.consent;
  let changed = false;

  if (next.region !== options.region) {
    next = { ...next, region: options.region };
    changed = true;
  }

  if (options.gpcEnabled && (next.analytics || next.replay || !next.gpcSeen)) {
    next = buildConsent({
      region: options.region,
      analytics: false,
      replay: false,
      gpcSeen: true,
      decision: next.decision,
    });
    changed = true;
  }

  const requiresEuConsent =
    options.region === "EU_EEA_UK" &&
    !options.gpcEnabled &&
    next.decision === "default";

  if (requiresEuConsent && (next.analytics || next.replay || next.gpcSeen)) {
    next = buildConsent({
      region: options.region,
      analytics: false,
      replay: false,
      gpcSeen: false,
      decision: "default",
    });
    changed = true;
  }

  return { consent: next, changed, requiresEuConsent };
};

/**
 * Read the current consent decision without writing cookies. Settings must not
 * seed or reconcile cookies while a tab switch is in flight: Next.js 16 syncs
 * `history.replaceState` through ACTION_RESTORE, and a cookie mutation during
 * that restore can force a full document navigation.
 */
export const inspectAnalyticsConsent = (): {
  consent: AnalyticsConsent | null;
  region: ConsentRegion;
  gpcEnabled: boolean;
} => {
  const region = getConsentRegion();
  const gpcEnabled = isGlobalPrivacyControlEnabled();
  const consent = readAnalyticsConsent();

  if (!consent) {
    return { consent: null, region, gpcEnabled };
  }

  if (!gpcEnabled) {
    return { consent, region, gpcEnabled };
  }

  return {
    consent: buildConsent({
      region,
      analytics: false,
      replay: false,
      gpcSeen: true,
      decision: consent.decision,
      ts: consent.ts,
    }),
    region,
    gpcEnabled,
  };
};

export const bootstrapAnalyticsConsent = (): {
  consent: AnalyticsConsent | null;
  region: ConsentRegion;
  gpcEnabled: boolean;
  requiresEuConsent: boolean;
} => {
  const region = getConsentRegion();
  const gpcEnabled = isGlobalPrivacyControlEnabled();
  const rawConsent = readRawConsentCookie();
  const existing = readAnalyticsConsent();

  // EU/EEA/UK must not treat legacy "granted/denied" strings as explicit consent.
  // If a user arrives with an older cookie format, force a fresh explicit choice.
  if (
    region === "EU_EEA_UK" &&
    !gpcEnabled &&
    rawConsent &&
    isLegacyConsentCookieValue(rawConsent)
  ) {
    deleteConsentCookie();
    emitAnalyticsConsentChange(null);
    return {
      consent: null,
      region,
      gpcEnabled,
      requiresEuConsent: true,
    };
  }

  if (existing) {
    const reconciled = reconcileAnalyticsConsentRegion({
      consent: existing,
      region,
      gpcEnabled,
    });
    let next = reconciled.consent;

    if (reconciled.changed) {
      next = writeAnalyticsConsent(next);
    }

    return {
      consent: next,
      region,
      gpcEnabled,
      requiresEuConsent: reconciled.requiresEuConsent,
    };
  }

  if (region === "EU_EEA_UK" && !gpcEnabled) {
    return {
      consent: null,
      region,
      gpcEnabled,
      requiresEuConsent: true,
    };
  }

  const seeded = writeAnalyticsConsent(
    buildDefaultAnalyticsConsent({
      region,
      gpcSeen: gpcEnabled,
    }),
  );

  return {
    consent: seeded,
    region,
    gpcEnabled,
    requiresEuConsent: false,
  };
};

export const saveAnalyticsConsent = (options: {
  analytics: boolean;
  replay: boolean;
  region?: ConsentRegion;
}): AnalyticsConsent => {
  const region = normalizeConsentRegion(options.region ?? getConsentRegion());
  const gpcEnabled = isGlobalPrivacyControlEnabled();

  const next = writeAnalyticsConsent(
    buildConsent({
      region,
      analytics: gpcEnabled ? false : options.analytics,
      replay: gpcEnabled ? false : options.replay,
      gpcSeen: gpcEnabled,
      decision: "explicit",
    }),
  );

  emitAnalyticsConsentChange(next);
  return next;
};

export const isAllowed = (
  category: AnalyticsCategory,
  consent: AnalyticsConsent | null,
): boolean => {
  if (!consent) return false;

  if (category === "analytics") {
    return consent.analytics;
  }

  return consent.analytics && consent.replay;
};

export const hasGrantedAnalyticsConsent = (): boolean => {
  if (typeof window === "undefined") return false;
  return isAllowed("analytics", readAnalyticsConsent());
};

export const loadVendor = async (
  vendorId: AnalyticsVendorId,
  options?: LoadVendorOptions,
): Promise<void> => {
  if (vendorId === "google_analytics") {
    const measurementId = options?.measurementId?.trim();
    if (!measurementId) return;

    loadGoogleAnalyticsScript(measurementId);
    loadedVendors.add(vendorId);
    return;
  }

  if (vendorId === "google_ads") {
    const adsId = options?.adsId?.trim();
    if (!adsId) return;

    loadGoogleAdsScript(adsId);
    loadedVendors.add(vendorId);
    return;
  }

  if (vendorId === "linkedin_insight") {
    const partnerId = options?.partnerId?.trim();
    if (!partnerId) return;

    loadLinkedInInsightScript(partnerId);
    loadedVendors.add(vendorId);
    return;
  }

  if (vendorId === "apollo_tracker") {
    const appId = options?.appId?.trim();
    if (!appId) return;

    loadApolloTrackerScript(appId);
    loadedVendors.add(vendorId);
    return;
  }

  if (vendorId === "meta_pixel") {
    const pixelId = options?.pixelId?.trim();
    if (!pixelId) return;

    loadMetaPixelScript(pixelId);
    loadedVendors.add(vendorId);
    return;
  }

  await options?.handlers?.onLoad?.();
  loadedVendors.add(vendorId);
};

export const unloadVendor = async (
  vendorId: AnalyticsVendorId,
  options?: UnloadVendorOptions,
): Promise<void> => {
  if (vendorId === "google_analytics") {
    unloadGoogleAnalyticsScript(options?.measurementId?.trim());
    loadedVendors.delete(vendorId);
    return;
  }

  if (vendorId === "google_ads") {
    unloadGoogleAdsScript(options?.adsId?.trim());
    loadedVendors.delete(vendorId);
    return;
  }

  if (vendorId === "linkedin_insight") {
    unloadLinkedInInsightScript(options?.partnerId?.trim());
    loadedVendors.delete(vendorId);
    return;
  }

  if (vendorId === "apollo_tracker") {
    unloadApolloTrackerScript(options?.appId?.trim());
    loadedVendors.delete(vendorId);
    return;
  }

  if (vendorId === "meta_pixel") {
    unloadMetaPixelScript(options?.pixelId?.trim());
    loadedVendors.delete(vendorId);
    return;
  }

  await options?.handlers?.onUnload?.();
  loadedVendors.delete(vendorId);
};
