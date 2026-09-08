import assert from "node:assert/strict";
import test from "node:test";

const CLOUDFLARE_SECRET = "01234567890123456789012345678901";

Object.assign(process.env, {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  NEXT_PUBLIC_APP_URL: "https://dockosha.com",
  NEXT_PUBLIC_APP_ENV: "local",
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-google-client-id",
  R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "test-r2-access-key",
  R2_SECRET_ACCESS_KEY: "test-r2-secret-key",
  SMTP_HOST: "localhost",
  SENDER_EMAIL: "sender@example.com",
  NOTIFICATION_SENDER_EMAIL: "notifications@example.com",
  FOUNDER_SENDER_EMAIL: "founder@example.com",
  COOKIE_SECRET: "01234567890123456789012345678901",
  CLOUDFLARE_WORKER_ORIGIN_SECRET: ` ${CLOUDFLARE_SECRET} `,
});

test("login activity uses the validated Cloudflare secret to resolve country", async () => {
  const { resolveLoginActivityCountryCode } =
    await import("@/server/loginActivityCountry");

  const cloudflareHeaders = new Headers({
    "x-dockosha-cloudflare-origin-secret": CLOUDFLARE_SECRET,
    "x-dockosha-cloudflare-country": "IN",
    "x-vercel-ip-country": "US",
  });
  assert.equal(resolveLoginActivityCountryCode(cloudflareHeaders), "IN");

  const missingCountryHeaders = new Headers({
    "x-dockosha-cloudflare-origin-secret": CLOUDFLARE_SECRET,
    "x-vercel-ip-country": "US",
  });
  assert.equal(resolveLoginActivityCountryCode(missingCountryHeaders), null);
});
