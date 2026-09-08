// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

import { isSentryEnabled } from "./src/lib/deployment";

const sentryDsn = process.env.SENTRY_DSN;
let sentryEnabled = false;
try {
  sentryEnabled = Boolean(sentryDsn) && isSentryEnabled();
} catch {
  sentryEnabled = false;
}

Sentry.init({
  dsn: sentryDsn,
  enabled: sentryEnabled,

  // Disable performance/profiling so Sentry remains error-only.
  tracesSampleRate: 0,
  profilesSampleRate: 0,

  // Enable logs to be sent to Sentry
  enableLogs: false,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: false,

  beforeSend(event) {
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
