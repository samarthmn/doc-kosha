// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { isSentryEnabled } from "@/lib/deployment";

const sentryEnabled = isSentryEnabled();
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * Error messages known to originate from browser extensions, hydration
 * mismatches caused by injected DOM nodes, or other non-actionable sources.
 * Dropping them keeps the Sentry feed focused on real application bugs.
 */
const IGNORED_ERROR_PATTERNS: RegExp[] = [
  // React DOM mutation errors triggered by browser extensions injecting/removing nodes
  /insertBefore.*not a child of this node/i,
  /removeChild.*not a child of this node/i,
  // Common browser-extension ghost objects (e.g. 1Password, Grammarly, Kaspersky)
  /Object Not Found Matching Id:\d+/i,
  // ResizeObserver noise (benign, browser-level)
  /ResizeObserver loop/i,
];

const PUBLIC_SHARE_PATH_PATTERN = /\/r\/[^/]+\/[^/]+(?:\/|$)/i;
const TRANSLATION_MUTATION_PATTERN =
  /translated-ltr|font > font|google translate|not be found here/i;

const getEventMessage = (event: Sentry.ErrorEvent): string => {
  return event.exception?.values?.[0]?.value ?? event.message ?? "";
};

const isPublicShareRouteEvent = (event: Sentry.ErrorEvent): boolean => {
  const url = event.request?.url;
  if (typeof url === "string" && PUBLIC_SHARE_PATH_PATTERN.test(url)) {
    return true;
  }

  const transaction = event.tags?.transaction;
  return typeof transaction === "string" && transaction.startsWith("/r/");
};

const hasTranslationMutationSignal = (event: Sentry.ErrorEvent): boolean => {
  for (const breadcrumb of event.breadcrumbs ?? []) {
    const breadcrumbData =
      breadcrumb.data && typeof breadcrumb.data === "object"
        ? JSON.stringify(breadcrumb.data)
        : "";
    const haystack = [breadcrumb.category, breadcrumb.message, breadcrumbData]
      .filter(Boolean)
      .join(" ");
    if (TRANSLATION_MUTATION_PATTERN.test(haystack)) {
      return true;
    }
  }

  return false;
};

const shouldIgnoreTranslationMutationError = (
  event: Sentry.ErrorEvent,
): boolean => {
  const message = getEventMessage(event);
  if (!isPublicShareRouteEvent(event)) {
    return false;
  }

  if (
    /Maximum call stack size exceeded/i.test(message) &&
    hasTranslationMutationSignal(event)
  ) {
    return true;
  }

  if (/The object can not be found here/i.test(message)) {
    return hasTranslationMutationSignal(event);
  }

  return false;
};

Sentry.init({
  dsn: sentryDsn,
  enabled: sentryEnabled,

  // Sentry is used for error tracking only.
  integrations: [],

  // Disable performance/profiling/replay so only errors are sent.
  tracesSampleRate: 0,
  profilesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  enableLogs: false,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: false,

  beforeSend(event) {
    // Drop non-actionable errors (browser extensions, hydration noise, etc.)
    const message = getEventMessage(event);
    if (IGNORED_ERROR_PATTERNS.some((re) => re.test(message))) {
      return null;
    }
    if (shouldIgnoreTranslationMutationError(event)) {
      return null;
    }

    event.user = undefined;

    if (event.request) {
      event.request.cookies = undefined;
      event.request.headers = undefined;

      if (typeof event.request.url === "string") {
        event.request.url = event.request.url.split("?")[0];
      }
    }

    return event;
  },
});

// Required by @sentry/nextjs App Router integration.
// With tracesSampleRate/profiles/replay all set to 0, Sentry remains error-only.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
