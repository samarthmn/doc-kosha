"use client";

import { isVendorLoaded } from "@/lib/analytics/consent";
import { isGoogleAdsEnabled } from "@/lib/deployment";
import {
  GoogleAdsPurchaseConversionSchema,
  type GoogleAdsPurchaseConversion,
} from "@/modules/billing/googleAdsPurchase";

const PURCHASE_SEND_TO = "AW-17991945932/N0wKCOWFn-YcEMydnYND";
const PURCHASE_DEDUPE_PREFIX = "dk-google-ads-purchase:";
const FUNNEL_DEDUPE_PREFIX = "dk-google-ads-funnel:";
const FUNNEL_SEND_TO = {
  signup: "AW-17991945932/Pd1ACILQs-YcEMydnYND",
  trial_started: "AW-17991945932/iPCUCKX-seYcEMydnYND",
  checkout_started: "AW-17991945932/s2ziCNKlsuYcEMydnYND",
} as const;

type GoogleTag = (...args: unknown[]) => void;
type ConversionSessionStorage = Pick<Storage, "getItem" | "setItem">;
const NOOP_CONVERSION_SESSION_STORAGE: ConversionSessionStorage = {
  getItem: () => null,
  setItem: () => undefined,
};
type GoogleAdsFunnelConversionName = keyof typeof FUNNEL_SEND_TO;
type GoogleAdsFunnelConversion = {
  conversion: GoogleAdsFunnelConversionName;
  dedupeId: string;
};
type GoogleAdsPurchaseTracker = (
  conversion: GoogleAdsPurchaseConversion,
) => boolean;

type GoogleAdsPurchaseRetryOptions = {
  signal: AbortSignal;
  maxAttempts: number;
  retryDelayMs: number;
  track?: GoogleAdsPurchaseTracker;
};

const readEventProperty = (
  properties: Record<string, unknown> | undefined,
  key: string,
): string | null => {
  const value = properties?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
};

export const resolveGoogleAdsFunnelConversion = (
  event: string,
  properties?: Record<string, unknown>,
): GoogleAdsFunnelConversion | null => {
  const workspaceId = readEventProperty(properties, "workspace_id");
  if (!workspaceId) return null;

  if (
    event === "onboarding_completed" &&
    readEventProperty(properties, "flow") === "new_workspace"
  ) {
    return { conversion: "signup", dedupeId: workspaceId };
  }

  if (event === "trial_started") {
    return { conversion: "trial_started", dedupeId: workspaceId };
  }

  if (event === "checkout_started") {
    const planId = readEventProperty(properties, "plan_id");
    const billingInterval = readEventProperty(properties, "billing_interval");
    if (!planId || !billingInterval) return null;

    return {
      conversion: "checkout_started",
      dedupeId: `${workspaceId}:${planId}:${billingInterval}`,
    };
  }

  return null;
};

export const emitGoogleAdsFunnelConversion = (
  conversion: GoogleAdsFunnelConversionName,
  dedupeId: string,
  gtag: GoogleTag,
  storage: ConversionSessionStorage,
): boolean => {
  const dedupeKey = `${FUNNEL_DEDUPE_PREFIX}${conversion}:${dedupeId}`;

  try {
    if (storage.getItem(dedupeKey) === "1") return false;
  } catch {
    // Continue when session storage is unavailable.
  }

  gtag("event", "conversion", { send_to: FUNNEL_SEND_TO[conversion] });

  try {
    storage.setItem(dedupeKey, "1");
  } catch {
    // Keep the successful event when session storage is unavailable.
  }

  return true;
};

export const trackGoogleAdsFunnelConversion = (
  conversion: GoogleAdsFunnelConversionName,
  dedupeId: string,
): boolean => {
  if (!isGoogleAdsEnabled()) return false;
  if (typeof window === "undefined") return false;
  if (!isVendorLoaded("google_ads")) return false;
  if (typeof window.gtag !== "function") return false;

  let storage = NOOP_CONVERSION_SESSION_STORAGE;
  try {
    storage = window.sessionStorage;
  } catch {
    // Storage can be blocked while Google Ads remains available.
  }

  return emitGoogleAdsFunnelConversion(
    conversion,
    dedupeId,
    window.gtag,
    storage,
  );
};

export const emitGoogleAdsPurchaseConversion = (
  conversion: GoogleAdsPurchaseConversion,
  gtag: GoogleTag,
  storage: ConversionSessionStorage,
): boolean => {
  const dedupeKey = `${PURCHASE_DEDUPE_PREFIX}${conversion.transactionId}`;

  try {
    if (storage.getItem(dedupeKey) === "1") return false;
  } catch {
    // Google Ads also deduplicates purchases by transaction_id.
  }

  gtag("event", "conversion", {
    send_to: PURCHASE_SEND_TO,
    value: conversion.value,
    currency: conversion.currency,
    transaction_id: conversion.transactionId,
  });

  try {
    storage.setItem(dedupeKey, "1");
  } catch {
    // Keep the successful event even when session storage is unavailable.
  }

  return true;
};

export const trackGoogleAdsPurchase = (
  conversion: GoogleAdsPurchaseConversion,
): boolean => {
  if (!isGoogleAdsEnabled()) return false;
  if (typeof window === "undefined") return false;
  if (!isVendorLoaded("google_ads")) return false;
  if (typeof window.gtag !== "function") return false;

  const parsed = GoogleAdsPurchaseConversionSchema.safeParse(conversion);
  if (!parsed.success) return false;

  return emitGoogleAdsPurchaseConversion(
    parsed.data,
    window.gtag,
    window.sessionStorage,
  );
};

const waitForRetryDelay = (
  delayMs: number,
  signal: AbortSignal,
): Promise<boolean> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }

    const handleAbort = (): void => {
      globalThis.clearTimeout(timeoutId);
      resolve(false);
    };
    const timeoutId = globalThis.setTimeout(
      () => {
        signal.removeEventListener("abort", handleAbort);
        resolve(true);
      },
      Math.max(0, delayMs),
    );

    signal.addEventListener("abort", handleAbort, { once: true });
  });

export const retryGoogleAdsPurchaseTracking = async (
  conversion: GoogleAdsPurchaseConversion,
  {
    signal,
    maxAttempts,
    retryDelayMs,
    track = trackGoogleAdsPurchase,
  }: GoogleAdsPurchaseRetryOptions,
): Promise<boolean> => {
  const attemptLimit = Math.max(1, Math.floor(maxAttempts));

  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    if (signal.aborted) return false;
    if (track(conversion)) return true;
    if (attempt === attemptLimit - 1) return false;

    const completedWait = await waitForRetryDelay(retryDelayMs, signal);
    if (!completedWait) return false;
  }

  return false;
};
