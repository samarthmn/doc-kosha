import * as Sentry from "@sentry/nextjs";
import { isSentryEnabled } from "@/lib/deployment";

const sentryEnabled = isSentryEnabled();

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (sentryEnabled) {
      await import("../sentry.server.config");
    }

    const { startLocalLifecycleEmailProcessor } =
      await import("@/modules/lifecycle-email/server");

    startLocalLifecycleEmailProcessor();
  }

  if (process.env.NEXT_RUNTIME === "edge" && sentryEnabled) {
    await import("../sentry.edge.config");
  }
}

export const onRequestError: typeof Sentry.captureRequestError = (...args) => {
  if (!sentryEnabled) return;
  return Sentry.captureRequestError(...args);
};
