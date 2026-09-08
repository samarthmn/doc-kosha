import { resolveTrustedCountryCode } from "@/server/trustedCountryResolver";

export const resolveCountryFromHeaders = async (
  headers: Headers,
): Promise<string | null> =>
  Promise.resolve(
    resolveTrustedCountryCode(
      headers,
      process.env.CLOUDFLARE_WORKER_ORIGIN_SECRET,
    ),
  );
