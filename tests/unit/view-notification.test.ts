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
  SMTP_PORT: "1025",
  SENDER_EMAIL: "t@t.co",
  NOTIFICATION_SENDER_EMAIL: "t@t.co",
  FOUNDER_SENDER_EMAIL: "t@t.co",
  COOKIE_SECRET: "0123456789abcdef0123456789abcdef",
});

const viewNotification = import("@/server/viewNotification");

test("view notification tokens bind one unique viewer to one link and document", async () => {
  const { createViewNotificationToken, verifyViewNotificationToken } =
    await viewNotification;
  const token = createViewNotificationToken({
    linkId: "00000000-0000-4000-8000-000000000001",
    documentId: "00000000-0000-4000-8000-000000000002",
    viewerKey: "viewer@example.com",
  });

  const verified = verifyViewNotificationToken(token, {
    linkId: "00000000-0000-4000-8000-000000000001",
    documentId: "00000000-0000-4000-8000-000000000002",
  });
  assert.ok(verified);
  assert.equal(verified.viewerKeyHash.length, 64);
  assert.equal(
    verifyViewNotificationToken(token, {
      linkId: "00000000-0000-4000-8000-000000000003",
      documentId: "00000000-0000-4000-8000-000000000002",
    }),
    null,
  );
});

test("view notification dedupe keys are stable per viewer and recipient", async () => {
  const { getViewNotificationDedupeKey } = await viewNotification;
  const base = {
    linkId: "00000000-0000-4000-8000-000000000001",
    documentId: "00000000-0000-4000-8000-000000000002",
    viewerKeyHash: "a".repeat(64),
  };

  const first = getViewNotificationDedupeKey({
    ...base,
    recipientUserId: "00000000-0000-4000-8000-000000000003",
  });
  assert.equal(
    getViewNotificationDedupeKey({
      ...base,
      recipientUserId: "00000000-0000-4000-8000-000000000003",
    }),
    first,
  );
  assert.notEqual(
    getViewNotificationDedupeKey({
      ...base,
      recipientUserId: "00000000-0000-4000-8000-000000000004",
    }),
    first,
  );
});
