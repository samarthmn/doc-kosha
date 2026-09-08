import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/generated/supabase";

export const computeWindowStart = (
  nowMs: number,
  windowSeconds: number,
): Date => {
  const windowMs = windowSeconds * 1_000;
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
};

export const hashRateLimitIdentifier = (value: string): string =>
  createHash("sha256").update(value.trim().toLowerCase()).digest("hex");

export type RateLimitDecision = {
  allowed: boolean;
  count: number | null;
};

type ConsumeRateLimitOptions = {
  bucket: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
  increment?: number;
};

const RATE_LIMIT_ERROR_PREFIX = "[rate-limit] failed to consume";

// Identifiers are link IDs, normalized email hashes, or sentinel strings.
// Never use raw or hashed IP addresses: hashes are trivially re-identifiable,
// while per-link caps bound total guess volume regardless of botnet size.
export const consumeRateLimit = async (
  client: SupabaseClient<Database>,
  {
    bucket,
    identifier,
    limit,
    windowSeconds,
    increment = 1,
  }: ConsumeRateLimitOptions,
): Promise<RateLimitDecision> => {
  try {
    const windowStart = computeWindowStart(Date.now(), windowSeconds);
    const { data: count, error } = await client.rpc(
      "record_rate_limit_attempt",
      {
        p_bucket: bucket,
        p_identifier: identifier,
        p_window_start: windowStart.toISOString(),
        p_increment: increment,
      },
    );

    if (error || typeof count !== "number") {
      console.error(RATE_LIMIT_ERROR_PREFIX, error);
      return { allowed: false, count: null };
    }

    return { allowed: count <= limit, count };
  } catch (error) {
    // Unlike trackWorkspaceBandwidth's deliberate swallow (usage tracking
    // must never fail a request), an abuse limiter must never fail open.
    console.error(RATE_LIMIT_ERROR_PREFIX, error);
    return { allowed: false, count: null };
  }
};
