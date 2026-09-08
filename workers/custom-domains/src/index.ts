/**
 * DocKosha Custom Domains Cloudflare Worker
 *
 * This worker handles traffic for custom domains configured via Cloudflare for SaaS.
 * It proxies requests to the main DocKosha app origin while:
 * - Preserving the original custom domain hostname via x-forwarded-host header
 * - Intercepting R2 redirect responses and streaming the content directly
 *   to avoid cross-origin issues with presigned R2 URLs
 *
 * @see https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/
 */

export interface Env {
  /**
   * The origin URL for the DocKosha app (e.g., https://dockosha.com)
   */
  APP_ORIGIN: string;

  /**
   * Shared secret that proves the request was forwarded by this Worker.
   */
  CLOUDFLARE_WORKER_ORIGIN_SECRET: string;

  /**
   * Environment identifier for logging
   */
  ENVIRONMENT: string;
}

/**
 * Allowed paths for custom domains.
 * All other paths will redirect to the canonical app origin.
 */
const ALLOWED_PATH_PREFIXES = [
  "/d/", // Document share links
  "/r/", // Data room share links
  "/api/public/", // Public API endpoints (resolve, file, download, analytics, etc.)
  "/_next/", // Next.js static assets
  "/assets/", // Static assets
  "/favicon", // Favicon files
  "/robots.txt",
  "/sitemap.xml",
];

const SHARE_SLUG_MAX_LENGTH = 64;
const SHARE_SLUG_REGEX = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const RESERVED_WORKSPACE_SEGMENTS = new Set<string>([
  "_next",
  "about",
  "api",
  "auth",
  "blog",
  "branding",
  "cookie-policy",
  "custom-domain",
  "custom-watermarks",
  "d",
  "dashboard",
  "data-rooms",
  "documents",
  "favicon.ico",
  "features",
  "hosted-vs-self-hosted",
  "onboarding",
  "pricing",
  "privacy-policy",
  "r",
  "robots.txt",
  "security",
  "settings",
  "sitemap.xml",
  "terms",
]);

/**
 * Paths that may return R2 redirects that need to be intercepted and streamed.
 */
const R2_REDIRECT_PATHS = [
  "/api/public/links/file",
  "/api/public/links/download",
];

/**
 * Default trusted host suffixes for Cloudflare R2 presigned URLs.
 */
const DEFAULT_TRUSTED_R2_HOST_SUFFIXES = ["r2.cloudflarestorage.com", "r2.dev"];

/**
 * Content types that should never be rendered inline from public delivery paths.
 */
const ACTIVE_CONTENT_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "application/javascript",
  "text/javascript",
  "image/svg+xml",
  "application/xml",
  "text/xml",
]);

/**
 * Check if a path is allowed on custom domains.
 */
const isValidShareSlug = (value: string): boolean => {
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue || normalizedValue.length > SHARE_SLUG_MAX_LENGTH) {
    return false;
  }
  return SHARE_SLUG_REGEX.test(normalizedValue);
};

export const isPotentialShortSharePath = (pathname: string): boolean => {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 2) return false;
  const [workspaceSlug, linkSlug] = segments;
  if (
    !workspaceSlug ||
    !linkSlug ||
    RESERVED_WORKSPACE_SEGMENTS.has(workspaceSlug.toLowerCase())
  ) {
    return false;
  }
  return isValidShareSlug(workspaceSlug) && isValidShareSlug(linkSlug);
};

export function isPathAllowed(pathname: string): boolean {
  return (
    ALLOWED_PATH_PREFIXES.some(
      (prefix) =>
        pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix),
    ) || isPotentialShortSharePath(pathname)
  );
}

/**
 * Check if a path may return R2 redirects that need interception.
 */
function isR2RedirectPath(pathname: string): boolean {
  return R2_REDIRECT_PATHS.some((path) => pathname.startsWith(path));
}

/**
 * Resolve trusted R2 host suffixes from defaults + optional env overrides.
 */
function getTrustedR2HostSuffixes(): string[] {
  return DEFAULT_TRUSTED_R2_HOST_SUFFIXES;
}

/**
 * Check if a redirect location is a trusted, signed R2 URL.
 */
function parseTrustedR2Url(
  location: string,
  trustedHostSuffixes: string[],
): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(location);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  const trustedHost = trustedHostSuffixes.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
  if (!trustedHost) {
    return null;
  }

  // Basic signed URL checks: do not fetch unsigned targets.
  if (
    !parsed.searchParams.has("X-Amz-Algorithm") ||
    !parsed.searchParams.has("X-Amz-Signature")
  ) {
    return null;
  }

  return parsed;
}

/**
 * Normalize content-type and check whether it can execute active content.
 */
function isActiveContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() || "";
  return ACTIVE_CONTENT_TYPES.has(normalized);
}

/**
 * Apply security and anti-caching headers to streamed file responses.
 */
function applyStreamSecurityHeaders(headers: Headers): void {
  headers.set("Cache-Control", "private, no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Content-Type-Options", "nosniff");
}

/**
 * Get Set-Cookie values from headers.
 * Cloudflare Workers provides `Headers.getSetCookie()` at runtime, but the
 * type definition may not include it. Use a safe fallback for typings.
 */
function getSetCookieValues(headers: Headers): string[] {
  const maybe = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof maybe.getSetCookie === "function") {
    return maybe.getSetCookie();
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

/**
 * Copy headers from source to target, with special handling for Set-Cookie.
 */
function copyHeaders(
  source: Headers,
  target: Headers,
  excludeHeaders: string[] = [],
): void {
  const exclude = new Set(excludeHeaders.map((h) => h.toLowerCase()));

  source.forEach((value, key) => {
    if (exclude.has(key.toLowerCase())) {
      return;
    }

    // Special handling for Set-Cookie (can have multiple values)
    if (key.toLowerCase() === "set-cookie") {
      const cookies = getSetCookieValues(source);
      for (const cookie of cookies) {
        target.append("Set-Cookie", cookie);
      }
    } else {
      target.set(key, value);
    }
  });
}

/**
 * Return a country code only when Cloudflare's runtime metadata provides one.
 */
function getCloudflareCountry(request: Request): string | null {
  const cloudflareMetadata: unknown = Reflect.get(request, "cf");
  if (typeof cloudflareMetadata !== "object" || cloudflareMetadata === null) {
    return null;
  }

  const country: unknown = Reflect.get(cloudflareMetadata, "country");
  if (typeof country !== "string") {
    return null;
  }

  if (!/^[A-Za-z]{2}$/.test(country)) {
    return null;
  }

  const normalizedCountry = country.toUpperCase();
  if (normalizedCountry === "XX") return null;

  return normalizedCountry;
}

/**
 * Replace caller-controlled Worker headers with authenticated metadata.
 */
function buildAuthenticatedHeaders(
  request: Request,
  cloudflareWorkerOriginSecret: string,
): Headers {
  const headers = new Headers(request.headers);

  // Never forward a caller-supplied host claim. The real custom host is set by
  // buildOriginRequest after this sanitization step.
  headers.delete("x-forwarded-host");
  headers.delete("x-dockosha-cloudflare-country");
  headers.delete("x-dockosha-cloudflare-origin-secret");
  headers.set(
    "x-dockosha-cloudflare-origin-secret",
    cloudflareWorkerOriginSecret,
  );

  const country = getCloudflareCountry(request);
  if (country) {
    headers.set("x-dockosha-cloudflare-country", country);
  }

  return headers;
}

/**
 * Build a request to the app origin with proper headers.
 */
function buildOriginRequest(
  request: Request,
  appOrigin: string,
  originalHost: string,
  cloudflareWorkerOriginSecret: string,
): Request {
  const url = new URL(request.url);
  const originUrl = new URL(appOrigin);

  // Replace protocol and host with the app origin
  url.protocol = originUrl.protocol;
  url.host = originUrl.host;

  // Clone headers and modify for proxying.
  const headers = buildAuthenticatedHeaders(
    request,
    cloudflareWorkerOriginSecret,
  );

  // Set Host to the app origin so Vercel accepts the request
  headers.set("Host", originUrl.host);

  // Pass the original custom domain via x-forwarded-host
  headers.set("x-forwarded-host", originalHost);

  // Preserve Cloudflare headers for origin validation
  // (cf-ray, cf-connecting-ip are already present from Cloudflare)

  return new Request(url.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual", // We handle redirects ourselves for R2 interception
  });
}

/**
 * Fetch R2 content and stream it back to the client.
 * This is used when the origin returns a redirect to a presigned R2 URL.
 */
async function streamR2Content(
  r2Url: string,
  originalRequest: Request,
  originResponse: Response,
): Promise<Response> {
  // Determine the method for the R2 request
  // For 303 redirects, the follow-up must be GET regardless of original method
  const redirectStatus = originResponse.status;
  const method = redirectStatus === 303 ? "GET" : originalRequest.method;

  // For HEAD requests, we need to fetch with GET and return headers only
  // because R2 presigned URLs are method-specific (GET-signed won't work with HEAD)
  const isHead = method === "HEAD";
  const fetchMethod = isHead ? "GET" : method;

  // Build headers for R2 request
  const r2Headers = new Headers();

  // Forward Range header for partial content requests (PDF viewers use this)
  const rangeHeader = originalRequest.headers.get("Range");
  if (rangeHeader && !isHead) {
    r2Headers.set("Range", rangeHeader);
  }

  // Forward Accept headers
  const acceptHeader = originalRequest.headers.get("Accept");
  if (acceptHeader) {
    r2Headers.set("Accept", acceptHeader);
  }

  // Fetch from R2
  const r2Response = await fetch(r2Url, {
    method: fetchMethod,
    headers: r2Headers,
    redirect: "manual",
  });

  // Build response headers
  const responseHeaders = new Headers();

  // Copy relevant headers from R2 response
  const headersToForward = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
    "cache-control",
    "content-disposition",
  ];

  for (const header of headersToForward) {
    const value = r2Response.headers.get(header);
    if (value) {
      responseHeaders.set(header, value);
    }
  }

  // Copy Set-Cookie headers from the origin response
  // This preserves access cookies that the app sets
  const originCookies = getSetCookieValues(originResponse.headers);
  for (const cookie of originCookies) {
    responseHeaders.append("Set-Cookie", cookie);
  }

  // Never cache streamed private file responses.
  applyStreamSecurityHeaders(responseHeaders);

  // Force download for active content types to prevent script/html execution
  // under trusted customer custom domains.
  if (isActiveContentType(responseHeaders.get("content-type"))) {
    const currentDisposition = (
      responseHeaders.get("content-disposition") || ""
    ).toLowerCase();
    if (!currentDisposition.includes("attachment")) {
      responseHeaders.set("content-disposition", "attachment");
    }
  }

  // For HEAD requests, return headers only (no body)
  if (isHead) {
    return new Response(null, {
      status: r2Response.ok ? 200 : r2Response.status,
      headers: responseHeaders,
    });
  }

  // Return the streamed response
  return new Response(r2Response.body, {
    status: r2Response.status,
    statusText: r2Response.statusText,
    headers: responseHeaders,
  });
}

/**
 * Handle requests to the worker.
 */
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const originalHost = url.host;
  const pathname = url.pathname;

  // Get the app origin hostname for comparison
  const appOriginUrl = new URL(env.APP_ORIGIN);
  const appHost = appOriginUrl.host.toLowerCase();
  const trustedR2HostSuffixes = getTrustedR2HostSuffixes();

  // If request is already to the app origin, pass through
  // (This shouldn't happen with proper routing, but handle it gracefully)
  if (originalHost.toLowerCase() === appHost) {
    return fetch(
      new Request(request, {
        headers: buildAuthenticatedHeaders(
          request,
          env.CLOUDFLARE_WORKER_ORIGIN_SECRET,
        ),
      }),
    );
  }

  // Check if this path is allowed on custom domains
  if (!isPathAllowed(pathname)) {
    // Redirect to canonical app origin for non-allowed paths
    const redirectUrl = new URL(request.url);
    redirectUrl.protocol = appOriginUrl.protocol;
    redirectUrl.host = appOriginUrl.host;
    return Response.redirect(redirectUrl.toString(), 308);
  }

  // Build request to origin
  const originRequest = buildOriginRequest(
    request,
    env.APP_ORIGIN,
    originalHost,
    env.CLOUDFLARE_WORKER_ORIGIN_SECRET,
  );

  // Check if this path might return R2 redirects
  const mayRedirectToR2 = isR2RedirectPath(pathname);

  // Fetch from origin
  const originResponse = await fetch(originRequest);

  // If this is a redirect response from an R2 path, intercept and stream
  if (
    mayRedirectToR2 &&
    [301, 302, 303, 307, 308].includes(originResponse.status)
  ) {
    const location = originResponse.headers.get("Location");

    if (location) {
      const r2Url = parseTrustedR2Url(location, trustedR2HostSuffixes);
      if (r2Url) {
        // Stream R2 content directly
        return streamR2Content(r2Url.toString(), request, originResponse);
      }
    }
  }

  // For non-redirect responses or non-R2 redirects, pass through with header modifications
  const responseHeaders = new Headers();
  copyHeaders(originResponse.headers, responseHeaders);

  // Ensure redirects stay on the custom domain.
  // Next.js / middleware may emit absolute redirects to APP_ORIGIN because the worker
  // sets the Host header to the app origin for Vercel. Rewrite those back to the
  // original custom domain host when the target path is allowed on custom domains.
  if ([301, 302, 303, 307, 308].includes(originResponse.status)) {
    const location = originResponse.headers.get("Location");
    if (location) {
      // Never rewrite trusted R2 redirects: those are either streamed (above) or
      // should be followed as-is if encountered unexpectedly.
      const maybeR2 = parseTrustedR2Url(location, trustedR2HostSuffixes);
      if (!maybeR2) {
        try {
          const parsed = new URL(location);
          if (parsed.host.toLowerCase() === appOriginUrl.host.toLowerCase()) {
            if (isPathAllowed(parsed.pathname)) {
              parsed.protocol = url.protocol;
              parsed.host = originalHost;
              responseHeaders.set("Location", parsed.toString());
            }
          }
        } catch {
          // Relative redirects are already safe (they remain on the custom domain).
        }
      }
    }
  }

  return new Response(originResponse.body, {
    status: originResponse.status,
    statusText: originResponse.statusText,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      // Log error in non-production environments
      if (env.ENVIRONMENT !== "production") {
        console.error("[DocKosha Worker] Error:", error);
      }

      // Return a generic error response
      return new Response("Internal Server Error", {
        status: 500,
        headers: {
          "Content-Type": "text/plain",
        },
      });
    }
  },
};
