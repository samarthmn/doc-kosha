const CLOUDFLARE_COUNTRY_HEADER = "x-dockosha-cloudflare-country";
const CLOUDFLARE_SECRET_HEADER = "x-dockosha-cloudflare-origin-secret";
const VERCEL_COUNTRY_HEADER = "x-vercel-ip-country";
const REJECTED_COUNTRY_CODES = new Set(["T1", "XX"]);

const normalizeCountryCode = (value: string | null): string | null => {
  if (!value) return null;

  const candidate = value.trim();
  if (!/^[A-Za-z]{2}$/.test(candidate)) return null;

  const normalized = candidate.toUpperCase();
  return REJECTED_COUNTRY_CODES.has(normalized) ? null : normalized;
};

const normalizeCloudflareSecret = (
  expectedCloudflareSecret: string | undefined,
): string | null => {
  if (!expectedCloudflareSecret) return null;

  const normalized = expectedCloudflareSecret.trim();
  return normalized.length > 0 ? normalized : null;
};

const areSecretsEqual = (
  receivedSecret: string | null,
  expectedSecret: string,
): boolean => {
  const received = receivedSecret ?? "";
  let mismatch = expectedSecret.length ^ received.length;

  for (let index = 0; index < expectedSecret.length; index += 1) {
    mismatch |=
      expectedSecret.charCodeAt(index) ^ (received.charCodeAt(index) || 0);
  }

  return mismatch === 0;
};

const isTrustedCloudflareOriginRequest = (
  headers: Headers,
  expectedCloudflareSecret?: string,
): boolean => {
  const normalizedCloudflareSecret = normalizeCloudflareSecret(
    expectedCloudflareSecret,
  );
  return (
    normalizedCloudflareSecret !== null &&
    areSecretsEqual(
      headers.get(CLOUDFLARE_SECRET_HEADER),
      normalizedCloudflareSecret,
    )
  );
};

const normalizeHost = (value: string | null): string => {
  const candidate = (value ?? "").split(",", 1)[0]?.trim().toLowerCase() ?? "";
  if (candidate.startsWith("[")) {
    const closingBracket = candidate.indexOf("]");
    return closingBracket > 0 ? candidate.slice(1, closingBracket) : candidate;
  }

  const colonCount = [...candidate].filter(
    (character) => character === ":",
  ).length;
  return colonCount === 1 ? (candidate.split(":", 1)[0] ?? "") : candidate;
};

export const resolveTrustedRequestHost = (
  headers: Headers,
  expectedCloudflareSecret?: string,
): string | null => {
  const hasForwardedHost = headers.has("x-forwarded-host");
  const forwardedHost = headers.get("x-forwarded-host");
  if (hasForwardedHost) {
    if (
      forwardedHost &&
      isTrustedCloudflareOriginRequest(headers, expectedCloudflareSecret)
    ) {
      return normalizeHost(forwardedHost);
    }

    // A forwarded host paired with the Worker's internal header is a claim
    // about a custom-domain request. If authentication fails, never fall back
    // to the canonical Host header and accidentally grant base-host access.
    if (headers.has(CLOUDFLARE_SECRET_HEADER)) {
      return null;
    }
  }

  return normalizeHost(headers.get("host"));
};

export const resolveTrustedCountryCode = (
  headers: Headers,
  expectedCloudflareSecret?: string,
): string | null => {
  if (isTrustedCloudflareOriginRequest(headers, expectedCloudflareSecret)) {
    return normalizeCountryCode(headers.get(CLOUDFLARE_COUNTRY_HEADER));
  }

  return normalizeCountryCode(headers.get(VERCEL_COUNTRY_HEADER));
};
