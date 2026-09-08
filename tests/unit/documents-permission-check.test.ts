import assert from "node:assert/strict";
import test from "node:test";

import { resolvePermissionWithRetry } from "@/lib/permissionCheck";

test("document edit permission recovers from transient errors", async () => {
  const transientError = new Error("temporary PostgREST failure");
  const results = [
    { data: null, error: transientError },
    { data: null, error: new Error("connection reset") },
    { data: true, error: null },
  ];
  const delays: number[] = [];
  let calls = 0;

  const resolution = await resolvePermissionWithRetry(
    async () => {
      const result = results[calls];
      calls += 1;
      if (!result) throw new Error("unexpected permission check");
      return result;
    },
    {
      attempts: 3,
      delayMs: 20,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    },
  );

  assert.deepEqual(resolution, { status: "allowed" });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [20, 40]);
});

test("document edit permission preserves an explicit denial", async () => {
  let calls = 0;

  const resolution = await resolvePermissionWithRetry(
    async () => {
      calls += 1;
      return { data: false, error: null };
    },
    { attempts: 3, delayMs: 0 },
  );

  assert.deepEqual(resolution, { status: "denied" });
  assert.equal(calls, 1);
});

test("document edit permission preserves the final error after retries", async () => {
  const finalError = new Error("permission service unavailable");
  let calls = 0;

  const resolution = await resolvePermissionWithRetry(
    async () => {
      calls += 1;
      if (calls === 1) throw new Error("connection reset");
      return { data: null, error: finalError };
    },
    { attempts: 2, delayMs: 0 },
  );

  assert.equal(resolution.status, "error");
  if (resolution.status === "error") {
    assert.equal(resolution.error, finalError);
  }
  assert.equal(calls, 2);
});
