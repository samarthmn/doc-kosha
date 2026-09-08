import * as Sentry from "@sentry/nextjs";
import { isSentryEnabled } from "@/lib/deployment";
import { getServerActionFailureTags } from "@/lib/sentryErrorClassification";

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
  const tags = getServerActionFailureTags(
    args[0],
    args[1],
    process.env.NEXT_DEPLOYMENT_ID,
  );
  return Sentry.withScope((scope) => {
    if (tags) scope.setTags(tags);
    return Sentry.captureRequestError(...args);
  });
};
