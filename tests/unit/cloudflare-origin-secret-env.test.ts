import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const baseEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  NEXT_PUBLIC_APP_URL: "https://dockosha.com",
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-google-client-id",
  R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "test-r2-access-key",
  R2_SECRET_ACCESS_KEY: "test-r2-secret-key",
  SMTP_HOST: "localhost",
  SMTP_USER: "smtp-user",
  SMTP_PASS: "smtp-pass",
  SENDER_EMAIL: "sender@example.com",
  NOTIFICATION_SENDER_EMAIL: "notifications@example.com",
  FOUNDER_SENDER_EMAIL: "founder@example.com",
  COOKIE_SECRET: "01234567890123456789012345678901",
  CLOUDFLARE_API_TOKEN: "cloudflare-api-token",
  CLOUDFLARE_ZONE_ID: "cloudflare-zone-id",
  CLOUDFLARE_CUSTOM_HOSTNAME_FALLBACK_ORIGIN: "custom.dockosha.com",
};

const validateEnvironment = (
  values: NodeJS.ProcessEnv,
): { output: string; status: number | null } => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      'await import("./src/lib/env.ts")',
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: values,
    },
  );

  return {
    output: `${result.stdout}${result.stderr}`,
    status: result.status,
  };
};

test("local environment permits an omitted Cloudflare Worker origin secret", () => {
  const result = validateEnvironment({
    ...baseEnv,
    NEXT_PUBLIC_APP_ENV: "local",
  });

  assert.equal(result.status, 0);
  assert.equal(result.output, "");
});

test("environment validation rejects a Cloudflare Worker origin secret shorter than 32 characters", () => {
  const result = validateEnvironment({
    ...baseEnv,
    NEXT_PUBLIC_APP_ENV: "local",
    CLOUDFLARE_WORKER_ORIGIN_SECRET: "too-short",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.output, /CLOUDFLARE_WORKER_ORIGIN_SECRET/);
  assert.match(result.output, /32/);
});

test("staging and production can boot without the optional Cloudflare integration", () => {
  for (const appEnvironment of ["staging", "production"]) {
    const result = validateEnvironment({
      ...baseEnv,
      NEXT_PUBLIC_APP_ENV: appEnvironment,
    });

    assert.equal(result.status, 0, appEnvironment);
    assert.equal(result.output, "", appEnvironment);
  }
});
