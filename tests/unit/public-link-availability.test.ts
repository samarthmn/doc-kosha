import assert from "node:assert/strict";
import test from "node:test";

import { getPublicLinkAvailabilityError } from "@/server/publicLinkAvailability";

test("revoked public links are denied even when a session cookie remains valid", () => {
  assert.deepEqual(
    getPublicLinkAvailabilityError({
      open_once: false,
      revoked_at: "2026-08-01T00:00:00.000Z",
      expires_at: null,
    }),
    { status: 410, error: "Link revoked", code: "REVOKED" },
  );
});

test("open-once self-consumption permits its cookie holder but expiry still denies", () => {
  const consumedAt = "2026-08-01T00:00:00.000Z";
  const now = new Date("2026-08-01T01:00:00.000Z");

  assert.equal(
    getPublicLinkAvailabilityError(
      {
        open_once: true,
        revoked_at: consumedAt,
        expires_at: null,
      },
      now,
    ),
    null,
  );
  assert.deepEqual(
    getPublicLinkAvailabilityError(
      {
        open_once: true,
        revoked_at: consumedAt,
        expires_at: "2026-08-01T00:30:00.000Z",
      },
      now,
    ),
    { status: 410, error: "Link expired", code: "EXPIRED" },
  );
});

test("expired public links are denied while active links remain available", () => {
  assert.deepEqual(
    getPublicLinkAvailabilityError(
      {
        open_once: false,
        revoked_at: null,
        expires_at: "2026-07-31T00:00:00.000Z",
      },
      new Date("2026-08-01T00:00:00.000Z"),
    ),
    { status: 410, error: "Link expired", code: "EXPIRED" },
  );
  assert.equal(
    getPublicLinkAvailabilityError(
      {
        open_once: false,
        revoked_at: null,
        expires_at: "2026-08-02T00:00:00.000Z",
      },
      new Date("2026-08-01T00:00:00.000Z"),
    ),
    null,
  );
});
