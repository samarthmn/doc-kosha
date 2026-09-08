import assert from "node:assert/strict";
import test from "node:test";

Object.assign(process.env, {
  NEXT_PUBLIC_APP_ENV: "local",
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy",
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: "dummy",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  R2_ACCESS_KEY_ID: "dummy",
  R2_SECRET_ACCESS_KEY: "dummy",
  R2_ENDPOINT: "http://localhost:9000",
  SMTP_HOST: "localhost",
  SMTP_PORT: "54325",
  SENDER_EMAIL: "e2e@example.com",
  NOTIFICATION_SENDER_EMAIL: "e2e@example.com",
  FOUNDER_SENDER_EMAIL: "e2e@example.com",
  COOKIE_SECRET: "0123456789abcdef0123456789abcdef",
});

const localProcessor =
  import("@/modules/lifecycle-email/server/localProcessor");

test("Playwright polling claims queued lifecycle jobs without sweeping historical fixtures", async () => {
  const { resolveLocalLifecycleProcessorJobScope } = await localProcessor;
  const actual = resolveLocalLifecycleProcessorJobScope("true");

  assert.deepEqual(actual, {
    includeBackfills: false,
    includeInactiveSweep: false,
  });
});

test("ordinary local polling retains lifecycle backfills and inactivity sweeps", async () => {
  const { resolveLocalLifecycleProcessorJobScope } = await localProcessor;
  const actual = resolveLocalLifecycleProcessorJobScope(undefined);

  assert.deepEqual(actual, {
    includeBackfills: true,
    includeInactiveSweep: true,
  });
});
