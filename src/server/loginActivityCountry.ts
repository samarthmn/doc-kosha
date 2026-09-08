import { serverEnv } from "@/lib/env";
import { resolveTrustedCountryCode } from "@/server/trustedCountryResolver";

export const resolveLoginActivityCountryCode = (
  headers: Headers,
): string | null =>
  resolveTrustedCountryCode(headers, serverEnv.CLOUDFLARE_WORKER_ORIGIN_SECRET);
