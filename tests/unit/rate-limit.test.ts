import assert from "node:assert/strict";
import test from "node:test";

import {
  computeWindowStart,
  consumeRateLimit,
  hashRateLimitIdentifier,
  type RateLimitDecision,
} from "@/server/rateLimit";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/generated/supabase";

type RpcResult = {
  data: number | null;
  error: unknown;
};

const createRpcStubClient = (
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<RpcResult>,
): SupabaseClient<Database> => {
  const client = createClient<Database>(
    "http://127.0.0.1:54321",
    "test-service-role-key",
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  Object.defineProperty(client, "rpc", { value: rpc });
  return client;
};

const withoutConsoleError = async <T>(run: () => Promise<T>): Promise<T> => {
  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    return await run();
  } finally {
    console.error = originalConsoleError;
  }
};

test("computeWindowStart floors UTC milliseconds to the window boundary", () => {
  const nowMs = Date.UTC(2026, 6, 29, 10, 5, 59, 999);

  assert.equal(
    computeWindowStart(nowMs, 60).toISOString(),
    "2026-07-29T10:05:00.000Z",
  );
});

test("computeWindowStart is stable throughout one window", () => {
  const first = computeWindowStart(Date.UTC(2026, 6, 29, 10, 5, 0, 1), 300);
  const last = computeWindowStart(Date.UTC(2026, 6, 29, 10, 9, 59, 999), 300);

  assert.equal(first.toISOString(), "2026-07-29T10:05:00.000Z");
  assert.equal(last.toISOString(), first.toISOString());
});

test("hashRateLimitIdentifier normalizes and deterministically hashes identifiers", () => {
  const expected =
    "b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514";

  assert.equal(hashRateLimitIdentifier("  User@Example.COM \n"), expected);
  assert.equal(hashRateLimitIdentifier("user@example.com"), expected);
});

test("consumeRateLimit fails closed when the RPC returns an error", async () => {
  const client = createRpcStubClient(async () => ({
    data: null,
    error: new Error("RPC unavailable"),
  }));

  const decision: RateLimitDecision = await withoutConsoleError(() =>
    consumeRateLimit(client, {
      bucket: "otp-link",
      identifier: "link-1",
      limit: 5,
      windowSeconds: 60,
    }),
  );

  assert.deepEqual(decision, { allowed: false, count: null });
});

test("consumeRateLimit fails closed when the RPC throws", async () => {
  const client = createRpcStubClient(async () => {
    throw new Error("network failure");
  });

  const decision: RateLimitDecision = await withoutConsoleError(() =>
    consumeRateLimit(client, {
      bucket: "otp-link",
      identifier: "link-1",
      limit: 5,
      windowSeconds: 60,
    }),
  );

  assert.deepEqual(decision, { allowed: false, count: null });
});

test("consumeRateLimit allows the limit boundary and denies the next attempt", async () => {
  const atLimit = createRpcStubClient(async () => ({
    data: 5,
    error: null,
  }));
  const overLimit = createRpcStubClient(async () => ({
    data: 6,
    error: null,
  }));

  assert.deepEqual(
    await consumeRateLimit(atLimit, {
      bucket: "otp-link",
      identifier: "link-1",
      limit: 5,
      windowSeconds: 60,
    }),
    { allowed: true, count: 5 },
  );
  assert.deepEqual(
    await consumeRateLimit(overLimit, {
      bucket: "otp-link",
      identifier: "link-1",
      limit: 5,
      windowSeconds: 60,
    }),
    { allowed: false, count: 6 },
  );
});

test("consumeRateLimit passes the increment and computed window to the RPC", async () => {
  let observedFunctionName: string | null = null;
  let observedArgs: Record<string, unknown> | null = null;
  const client = createRpcStubClient(async (functionName, args) => {
    observedFunctionName = functionName;
    observedArgs = args;
    return { data: 4, error: null };
  });
  const originalDateNow = Date.now;
  Date.now = () => Date.UTC(2026, 6, 29, 10, 7, 42, 123);

  try {
    const decision: RateLimitDecision = await consumeRateLimit(client, {
      bucket: "otp-email",
      identifier: "hashed-email",
      limit: 10,
      windowSeconds: 300,
      increment: 4,
    });

    assert.deepEqual(decision, { allowed: true, count: 4 });
    assert.equal(observedFunctionName, "record_rate_limit_attempt");
    assert.deepEqual(observedArgs, {
      p_bucket: "otp-email",
      p_identifier: "hashed-email",
      p_window_start: "2026-07-29T10:05:00.000Z",
      p_increment: 4,
    });
  } finally {
    Date.now = originalDateNow;
  }
});
