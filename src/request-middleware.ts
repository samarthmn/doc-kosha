import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  hasSupabaseAuthCookies,
  updateSession,
} from "@/lib/supabase/middleware";
import { isPotentialShortSharePath } from "@/lib/publicLinkPaths";
import {
  ANALYTICS_REGION_COOKIE,
  classifyRegionFromCountryCode,
} from "@/lib/analytics/consent-region";
import { SUBSCRIPTION_REQUEST_PATH_HEADER } from "@/modules/billing/subscriptionAccess";
import {
  resolveTrustedCountryCode,
  resolveTrustedRequestHost,
} from "@/server/trustedCountryResolver";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/documents",
  "/data-rooms",
  "/branding",
  // Host routing grants nothing without a configured workspace domain.
  "/custom-domain",
  "/custom-watermarks",
  "/settings",
  "/onboarding",
];

const resolveCountryCodeFromHeaders = (req: NextRequest): string | null => {
  return resolveTrustedCountryCode(
    req.headers,
    process.env.CLOUDFLARE_WORKER_ORIGIN_SECRET,
  );
};

const withAnalyticsRegionCookie = (
  req: NextRequest,
  response: NextResponse,
): NextResponse => {
  const region = classifyRegionFromCountryCode(
    resolveCountryCodeFromHeaders(req),
  );

  response.cookies.set(ANALYTICS_REGION_COOKIE, region, {
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
  });

  return response;
};

const isDocumentRequest = (req: NextRequest): boolean => {
  const dest = req.headers.get("sec-fetch-dest");
  if (dest === "document") return true;
  const mode = req.headers.get("sec-fetch-mode");
  if (mode === "navigate") return true;
  return false;
};

const isNextInternalRequest = (req: NextRequest): boolean => {
  const rsc = req.headers.get("rsc") === "1";
  const prefetch = req.headers.get("next-router-prefetch") === "1";
  const purpose = req.headers.get("purpose") === "prefetch";
  const secPurpose = req.headers.get("sec-purpose") === "prefetch";
  return rsc || prefetch || purpose || secPurpose;
};

export async function proxy(req: NextRequest) {
  const url = req.nextUrl;
  const forwardedRequestHeaders = new Headers(req.headers);
  // Never trust a caller-provided value for this internal routing signal.
  forwardedRequestHeaders.set(
    SUBSCRIPTION_REQUEST_PATH_HEADER,
    `${url.pathname}${url.search}`,
  );
  const hostHeader = req.headers.get("host") || "";
  const host = resolveTrustedRequestHost(
    req.headers,
    process.env.CLOUDFLARE_WORKER_ORIGIN_SECRET,
  );
  const isProtected = PROTECTED_PREFIXES.some((p) =>
    url.pathname.startsWith(p),
  );
  const shouldUseSession =
    isDocumentRequest(req) && !isNextInternalRequest(req);
  const { response, isAuthenticated } = shouldUseSession
    ? await updateSession(req, forwardedRequestHeaders)
    : {
        response: NextResponse.next({
          request: {
            headers: forwardedRequestHeaders,
          },
        }),
        isAuthenticated: hasSupabaseAuthCookies(req),
      };

  if (host === null) {
    return withAnalyticsRegionCookie(
      req,
      NextResponse.json(
        { error: "Invalid host", code: "INVALID_HOST" },
        { status: 400 },
      ),
    );
  }

  // Localhost subdomain rule:
  // Any <sub>.localhost:{port} should redirect to localhost:{port} for all paths
  // except the public sharing path /d/<docId>/<linkId>
  const isLocalhostBase = host === "localhost" || host === "127.0.0.1";
  const isLocalhostSubdomain =
    host.endsWith(".localhost") || host.endsWith(".127.0.0.1");
  const isPublicSharePath =
    url.pathname.startsWith("/d/") ||
    url.pathname.startsWith("/r/") ||
    isPotentialShortSharePath(url.pathname);
  if (!isLocalhostBase && isLocalhostSubdomain && !isPublicSharePath) {
    const port = hostHeader.includes(":") ? hostHeader.split(":")[1] : "";
    const redirectHost = `localhost${port ? `:${port}` : ""}`;
    const redirectUrl = new URL(req.url);
    redirectUrl.host = redirectHost;
    return withAnalyticsRegionCookie(
      req,
      NextResponse.redirect(redirectUrl, 308),
    );
  }

  // Production host rule:
  // - Base hosts (dockosha.com, www.dockosha.com, staging.dockosha.com) serve the full app
  // - Custom domains (any other host) only serve public share paths (/d/, /r/)
  // Note: Wildcard *.dockosha.com is no longer used - custom domains are full hostnames
  if (!isLocalhostBase && !isLocalhostSubdomain) {
    const { appHost, rootHost } = (() => {
      try {
        const raw = process.env.NEXT_PUBLIC_APP_URL || "";
        const u = new URL(raw);
        const h = u.hostname.toLowerCase();
        const parts = h.split(".");
        const root = parts.length >= 2 ? parts.slice(-2).join(".") : h;
        return { appHost: h, rootHost: root };
      } catch {
        return { appHost: "dockosha.com", rootHost: "dockosha.com" };
      }
    })();

    // Base hosts that serve the full application
    const baseHosts = new Set([
      rootHost, // dockosha.com
      `www.${rootHost}`, // www.dockosha.com
      `staging.${rootHost}`, // staging.dockosha.com
      appHost, // whatever NEXT_PUBLIC_APP_URL points to
    ]);
    const isBaseHost = baseHosts.has(host);

    // Any host not in baseHosts is treated as a custom domain
    if (!isBaseHost) {
      // Custom domains only serve public share paths
      if (isPublicSharePath) {
        return withAnalyticsRegionCookie(req, response);
      }
      // Redirect all other paths to the canonical app host
      const redirectUrl = new URL(req.url);
      redirectUrl.host = appHost;
      return withAnalyticsRegionCookie(
        req,
        NextResponse.redirect(redirectUrl, 308),
      );
    }
  }

  if (shouldUseSession && isProtected && !isAuthenticated) {
    const redirectUrl = new URL("/auth/sign-in", req.url);
    redirectUrl.searchParams.set("redirect", url.pathname + url.search);
    return withAnalyticsRegionCookie(req, NextResponse.redirect(redirectUrl));
  }

  return withAnalyticsRegionCookie(req, response);
}
