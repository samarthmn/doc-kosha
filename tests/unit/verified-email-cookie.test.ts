import assert from "node:assert/strict";
import test from "node:test";

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
});

test("a verified-email cookie is bound to its exact link and resource", async () => {
  const cookieModule = await import("@/server/cookieHelper");
  const signVerifiedEmailCookie = Reflect.get(
    cookieModule,
    "signVerifiedEmailCookie",
  );
  const verifyVerifiedEmailCookie = Reflect.get(
    cookieModule,
    "verifyVerifiedEmailCookie",
  );

  assert.equal(typeof signVerifiedEmailCookie, "function");
  assert.equal(typeof verifyVerifiedEmailCookie, "function");
  if (
    typeof signVerifiedEmailCookie !== "function" ||
    typeof verifyVerifiedEmailCookie !== "function"
  ) {
    return;
  }

  const expected = {
    resourceType: "document",
    resourceId: "document-a",
    linkId: "link-a",
  } as const;
  const cookie = signVerifiedEmailCookie({
    ...expected,
    email: "viewer@example.com",
    exp: Date.now() + 60_000,
  });

  assert.equal(
    verifyVerifiedEmailCookie(cookie, expected)?.email,
    "viewer@example.com",
  );
  assert.equal(
    verifyVerifiedEmailCookie(cookie, { ...expected, linkId: "link-b" }),
    null,
  );
  assert.equal(
    verifyVerifiedEmailCookie(cookie, {
      ...expected,
      resourceId: "document-b",
    }),
    null,
  );
  assert.equal(
    verifyVerifiedEmailCookie(cookie, {
      ...expected,
      resourceType: "data_room",
    }),
    null,
  );
});

test("legacy email-only signed payloads are rejected", async () => {
  const cookieModule = await import("@/server/cookieHelper");
  const signCookie = Reflect.get(cookieModule, "signCookie");
  const verifyVerifiedEmailCookie = Reflect.get(
    cookieModule,
    "verifyVerifiedEmailCookie",
  );

  assert.equal(typeof signCookie, "function");
  assert.equal(typeof verifyVerifiedEmailCookie, "function");
  if (
    typeof signCookie !== "function" ||
    typeof verifyVerifiedEmailCookie !== "function"
  ) {
    return;
  }

  const legacyCookie = signCookie({
    email: "viewer@example.com",
    exp: Date.now() + 60_000,
  });

  assert.equal(
    verifyVerifiedEmailCookie(legacyCookie, {
      resourceType: "document",
      resourceId: "document-a",
      linkId: "link-a",
    }),
    null,
  );
});
