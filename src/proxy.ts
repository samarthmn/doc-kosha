import type { NextRequest } from "next/server";
import { proxy as handleRequest } from "./request-middleware";

export function proxy(req: NextRequest) {
  return handleRequest(req);
}

// Next.js requires `config` to be statically analyzable in this file (no re-exports).
export const config = {
  // Authenticated routes are listed explicitly so filenames/folder slugs that
  // contain dots still pass through the trusted request-path header boundary.
  // The broad matcher continues to skip Next internals, API routes, and assets.
  matcher: [
    "/billing/:path*",
    "/branding/:path*",
    // Host routing grants nothing without a configured workspace domain.
    "/custom-domain/:path*",
    "/custom-watermarks/:path*",
    "/dashboard/:path*",
    "/data-rooms/:path*",
    "/documents/:path*",
    "/nda-templates/:path*",
    "/settings/:path*",
    "/testimonial/:path*",
    "/user-groups/:path*",
    "/((?!_next|api|.*\\..*).*)",
  ],
};
