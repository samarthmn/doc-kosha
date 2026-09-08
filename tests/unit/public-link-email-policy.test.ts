import assert from "node:assert/strict";
import test from "node:test";

import {
  requiresVerifiedViewerEmail,
  shouldPersistViewerEmail,
} from "@/lib/publicLinkEmailPolicy";
import { buildPublicViewTrackingIdentity } from "@/lib/analytics/publicViewerIdentity";

test("every email-dependent link feature requires a verified viewer", () => {
  for (const field of [
    "emailVerification",
    "ndaGate",
    "collectEmailForAnalytics",
    "dynamicWatermarkEmail",
    "allowlistActive",
  ] as const) {
    assert.equal(
      requiresVerifiedViewerEmail({ [field]: true }),
      true,
      `${field} must require verified access`,
    );
  }
  assert.equal(requiresVerifiedViewerEmail({}), false);
});

test("stored email verification stays enabled when collection or dynamic email is combined with NDA", async () => {
  const policyModule = await import("@/lib/publicLinkEmailPolicy");
  const resolveStoredEmailVerification = Reflect.get(
    policyModule,
    "resolveStoredEmailVerification",
  );
  assert.equal(typeof resolveStoredEmailVerification, "function");
  if (typeof resolveStoredEmailVerification !== "function") return;

  assert.equal(
    resolveStoredEmailVerification({
      ndaGate: true,
      collectEmailForAnalytics: true,
    }),
    true,
  );
  assert.equal(
    resolveStoredEmailVerification({
      ndaGate: true,
      dynamicWatermarkEmail: true,
    }),
    true,
  );
  assert.equal(resolveStoredEmailVerification({ ndaGate: true }), false);
});

test("viewer email is persisted only for a collect-enabled verified view", () => {
  assert.equal(
    shouldPersistViewerEmail({
      collectEmailForAnalytics: true,
      verifiedEmail: "viewer@example.com",
    }),
    true,
  );
  assert.equal(
    shouldPersistViewerEmail({
      collectEmailForAnalytics: false,
      verifiedEmail: "viewer@example.com",
    }),
    false,
  );
  assert.equal(
    shouldPersistViewerEmail({
      collectEmailForAnalytics: true,
      verifiedEmail: null,
    }),
    false,
  );
});

test("view de-duplication identity changes with link, resource, type, or session", () => {
  const base = {
    linkId: "link-a",
    resourceId: "resource-a",
    resourceType: "document",
    sessionId: "session-a",
  } as const;
  const identity = buildPublicViewTrackingIdentity(base);

  for (const changed of [
    { ...base, linkId: "link-b" },
    { ...base, resourceId: "resource-b" },
    { ...base, resourceType: "data_room" },
    { ...base, sessionId: "session-b" },
  ]) {
    assert.notEqual(buildPublicViewTrackingIdentity(changed), identity);
  }
});
