import type { Properties } from "posthog-js";

const SENSITIVE_KEYWORDS = [
  "password",
  "pass",
  "secret",
  "token",
  "authorization",
  "cookie",
  "cookies",
  "credit",
  "card",
  "ssn",
  "email",
  "workspace_name",
  "document_title",
  "otp",
  "code",
  "api_key",
  "apikey",
];

const shouldRedactKey = (key: string): boolean => {
  const normalized = key.trim().toLowerCase();
  return SENSITIVE_KEYWORDS.some((kw) => normalized.includes(kw));
};

const sanitizeProperties = (
  props: Record<string, unknown> | undefined,
): Properties | undefined => {
  if (!props) return undefined;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (shouldRedactKey(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out as Properties;
};

const sanitizeUrlForAnalytics = (rawUrl: string): string => {
  try {
    const url = new URL(rawUrl);
    const sensitiveParams = [
      "token",
      "code",
      "otp",
      "invite",
      "redirect",
      "password",
    ];
    for (const key of sensitiveParams) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    // Strip query string on parse failure to avoid leaking sensitive params
    const queryIndex = rawUrl.indexOf("?");
    return queryIndex >= 0 ? rawUrl.substring(0, queryIndex) : rawUrl;
  }
};

type InitOptions = {
  apiKey: string;
  apiHost: string;
  appEnv: "local" | "staging" | "production";
  sessionRecordingBlockSelector: string;
  sessionRecordingEnabled: boolean;
};

type PostHogClient = (typeof import("posthog-js"))["default"] | null;

let initPromise: Promise<PostHogClient> | null = null;

export async function initPostHogOnce(
  options: InitOptions,
): Promise<PostHogClient> {
  if (typeof window === "undefined") return null;
  // E2E stub flag lets Playwright assert the consent-gated ingest path against
  // stubbed hosts without running the app as production.
  const e2eAnalyticsStubEnabled =
    process.env.NEXT_PUBLIC_E2E_ANALYTICS_STUB === "true";
  if (options.appEnv !== "production" && !e2eAnalyticsStubEnabled) return null;
  if (initPromise) return await initPromise;

  initPromise = (async () => {
    const { default: posthog } = await import("posthog-js");

    posthog.init(options.apiKey, {
      api_host: options.apiHost,
      defaults: "2026-01-30",
      person_profiles: "identified_only",
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: false,
      session_recording: {
        maskAllInputs: true,
        // Ensure sensitive information does not appear in recordings.
        // Mask all visible text in addition to input values.
        // (Types in `@posthog/types` support maskTextSelector; `maskAllText` is not available.)
        maskTextSelector: "*",
        blockSelector: options.sessionRecordingBlockSelector,
      },
      loaded: (ph) => {
        if (options.appEnv === "local") {
          ph.debug();
        }
      },
    });

    const captureController = posthog as unknown as PostHogCaptureController;
    captureController.opt_in_capturing?.();

    const replayController = posthog as unknown as PostHogReplayController;
    if (options.sessionRecordingEnabled) {
      replayController.startSessionRecording?.();
    } else {
      replayController.stopSessionRecording?.();
    }

    return posthog;
  })().catch(() => null);

  return await initPromise;
}

export async function resetPostHog(): Promise<void> {
  const posthog = initPromise ? await initPromise : null;
  posthog?.reset();
}

type PostHogCaptureController = {
  opt_in_capturing?: () => void;
  opt_out_capturing?: () => void;
};

type PostHogReplayController = {
  startSessionRecording?: () => void;
  stopSessionRecording?: () => void;
};

export async function setPostHogCaptureEnabled(
  enabled: boolean,
): Promise<void> {
  const posthog = initPromise ? await initPromise : null;
  if (!posthog) return;

  const captureController = posthog as unknown as PostHogCaptureController;
  if (enabled) {
    captureController.opt_in_capturing?.();
    return;
  }

  captureController.opt_out_capturing?.();
}

export async function setPostHogReplayEnabled(enabled: boolean): Promise<void> {
  const posthog = initPromise ? await initPromise : null;
  if (!posthog) return;

  const replayController = posthog as unknown as PostHogReplayController;
  if (enabled) {
    replayController.startSessionRecording?.();
    return;
  }

  replayController.stopSessionRecording?.();
}

export async function identifyPostHogUser(options: {
  distinctId: string;
  personProperties?: Record<string, unknown>;
  globalProperties?: Record<string, unknown>;
}): Promise<void> {
  const posthog = initPromise ? await initPromise : null;
  if (!posthog) return;

  posthog.identify(
    options.distinctId,
    sanitizeProperties(options.personProperties),
  );
  if (options.globalProperties) {
    posthog.register(sanitizeProperties(options.globalProperties) ?? {});
  }
}

export async function capturePostHogEvent(options: {
  event: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  const posthog = initPromise ? await initPromise : null;
  if (!posthog) return;
  posthog.capture(options.event, sanitizeProperties(options.properties));
}

export async function capturePostHogPageview(options: {
  url: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  const posthog = initPromise ? await initPromise : null;
  if (!posthog) return;

  const safeUrl = sanitizeUrlForAnalytics(options.url);
  posthog.capture("$pageview", {
    $current_url: safeUrl,
    ...(sanitizeProperties(options.properties) ?? {}),
  });
}
