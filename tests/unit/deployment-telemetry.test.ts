import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { isApolloTrackerEnabled, isSentryEnabled } from "@/lib/deployment";

const TELEMETRY_ENV_KEYS = [
  "NEXT_PUBLIC_APP_ENV",
  "NEXT_PUBLIC_APOLLO_TRACKER_APP_ID",
  "NEXT_PUBLIC_SENTRY_DSN",
  "SENTRY_DSN",
] as const;

const originalEnv = Object.fromEntries(
  TELEMETRY_ENV_KEYS.map((key) => [key, process.env[key]]),
);

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_ENV = "production";
  delete process.env.NEXT_PUBLIC_APOLLO_TRACKER_APP_ID;
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  delete process.env.SENTRY_DSN;
});

afterEach(() => {
  for (const key of TELEMETRY_ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("production leaves Sentry disabled until a deployment configures a DSN", () => {
  assert.equal(isSentryEnabled(), false);

  process.env.SENTRY_DSN = "https://public@example.com/1";
  assert.equal(isSentryEnabled(), true);

  delete process.env.SENTRY_DSN;
  process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public@example.com/2";
  assert.equal(isSentryEnabled(), true);
});

test("production leaves Apollo disabled until a deployment configures an app id", () => {
  assert.equal(isApolloTrackerEnabled(), false);

  process.env.NEXT_PUBLIC_APOLLO_TRACKER_APP_ID = "configured-app-id";
  assert.equal(isApolloTrackerEnabled(), true);
});
