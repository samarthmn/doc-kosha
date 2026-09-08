import { NextRequest, NextResponse } from "next/server";
import {
  getAccessCookieKey,
  getEmailCookieKey,
  type PublicResourceType,
} from "@/server/cookieConstants";

const CLEAR_SESSION_QUERY_SCHEMA = {
  linkId: (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null),
  resourceType: (v: unknown) =>
    v === "document" || v === "data_room" ? (v as PublicResourceType) : null,
  resourceId: (v: unknown) =>
    typeof v === "string" && v.length > 0 ? v : null,
  returnUrl: (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null),
};

/** Allowed path prefixes for redirect to prevent open redirect */
const ALLOWED_RETURN_PREFIXES = ["/d/", "/r/"];

function isAllowedReturnUrl(path: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  if (!decoded.startsWith("/")) return false;
  const hasAllowedPrefix = ALLOWED_RETURN_PREFIXES.some((p) =>
    decoded.startsWith(p),
  );
  if (!hasAllowedPrefix) return false;
  try {
    new URL(decoded, "https://example.com");
    return true;
  } catch {
    return false;
  }
}

/**
 * GET /api/public/links/clear-session
 * Clears link viewer session cookies (email + access) and redirects to returnUrl
 * so the user can try with a different email/account.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const linkId = CLEAR_SESSION_QUERY_SCHEMA.linkId(
    url.searchParams.get("linkId"),
  );
  const resourceType = CLEAR_SESSION_QUERY_SCHEMA.resourceType(
    url.searchParams.get("resourceType"),
  );
  const resourceId = CLEAR_SESSION_QUERY_SCHEMA.resourceId(
    url.searchParams.get("resourceId"),
  );
  const returnUrl = CLEAR_SESSION_QUERY_SCHEMA.returnUrl(
    url.searchParams.get("returnUrl"),
  );

  if (!linkId || !resourceType || !resourceId || !returnUrl) {
    return NextResponse.json(
      { error: "Missing linkId, resourceType, resourceId, or returnUrl" },
      { status: 400 },
    );
  }

  if (!isAllowedReturnUrl(returnUrl)) {
    return NextResponse.json({ error: "Invalid return URL" }, { status: 400 });
  }

  const emailCookieName = getEmailCookieKey(resourceType, resourceId, linkId);
  const accessCookieName = getAccessCookieKey(resourceType, resourceId, linkId);

  const response = NextResponse.redirect(new URL(returnUrl, req.url), 302);

  const clearOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  };

  response.cookies.set(emailCookieName, "", clearOpts);
  response.cookies.set(accessCookieName, "", clearOpts);

  return response;
}
