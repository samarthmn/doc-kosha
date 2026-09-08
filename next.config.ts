import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { DEFAULT_POSTHOG_HOST } from "./src/lib/analytics/posthogConfig";

type SecurityHeader = {
  key: string;
  value: string;
};

const getHttpOrigin = (rawUrl: string | undefined): string | null => {
  const candidate = rawUrl?.trim();
  if (!candidate) return null;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
};

const getWebSocketOrigin = (httpOrigin: string): string => {
  const parsed = new URL(httpOrigin);
  const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${parsed.host}`;
};

const buildContentSecurityPolicyReportOnly = (): string => {
  const configuredPostHogHost =
    process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST;
  const postHogOrigin = getHttpOrigin(configuredPostHogHost);
  const supabaseOrigin = getHttpOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const sentryIngestOrigin = getHttpOrigin(process.env.SENTRY_DSN);
  const r2EndpointOrigin = getHttpOrigin(process.env.R2_ENDPOINT);

  const scriptSources = new Set([
    "'self'",
    // Next.js App Router currently requires inline bootstrap scripts. Moving to
    // nonces would force dynamic rendering across the app, which is outside
    // Phase 0; Report-Only lets us measure before that later migration.
    "'unsafe-inline'",
    // pdf.js and the packaged browser document engines compile WebAssembly.
    "'wasm-unsafe-eval'",
  ]);
  const connectSources = new Set(["'self'"]);

  if (postHogOrigin) {
    scriptSources.add(postHogOrigin);
    connectSources.add(postHogOrigin);
  }

  if (supabaseOrigin) {
    connectSources.add(supabaseOrigin);
    connectSources.add(getWebSocketOrigin(supabaseOrigin));
  }

  if (sentryIngestOrigin) {
    connectSources.add(sentryIngestOrigin);
  }

  if (r2EndpointOrigin) {
    connectSources.add(r2EndpointOrigin);
  }
  connectSources.add("https://*.r2.cloudflarestorage.com");

  if (process.env.NODE_ENV !== "production") {
    // Keep local Supabase Realtime and MinIO traffic out of development/e2e
    // violation reports without broadening the production policy.
    [
      "http://localhost:54321",
      "ws://localhost:54321",
      "http://127.0.0.1:54321",
      "ws://127.0.0.1:54321",
      "http://localhost:9000",
      "http://127.0.0.1:9000",
    ].forEach((source) => connectSources.add(source));
  }

  return [
    ["default-src", "'self'"],
    ["script-src", ...scriptSources],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "blob:", "data:", "https:"],
    ["font-src", "'self'", "data:"],
    ["connect-src", ...connectSources],
    ["worker-src", "'self'", "blob:"],
    ["media-src", "'self'", "blob:"],
    ["frame-src", "'self'", "data:", "https://demo.arcade.software"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'self'"],
  ]
    .map((directive) => directive.join(" "))
    .join("; ");
};

const SECURITY_HEADERS: SecurityHeader[] = [
  {
    key: "Strict-Transport-Security",
    // The custom-domain worker forwards this verbatim. A bare max-age binds
    // only the exact customer host; includeSubDomains/preload would bind
    // domains DocKosha does not own. Upgrading the canonical host remains a
    // separate deliberate decision.
    value: "max-age=31536000",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    // NDA signing is canvas-based and does not need device APIs.
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Content-Security-Policy-Report-Only",
    // Directly streamed R2 bytes on custom domains bypass this policy: the
    // worker builds fresh response headers for those bytes.
    value: buildContentSecurityPolicyReportOnly(),
  },
];

const ENGINE_TRACE_PACKAGES = [
  "@samarthmn/dockosha-provider-docyantra",
  "@samarthmn/doc-yantra",
  "@samarthmn/doc-yantra-office",
  "@samarthmn/doc-yantra-fonts",
  "zod",
] as const;

// Fixed DocYantra engine packages are traced through BOTH node_modules layouts,
// because local and deployment installs can differ:
//  - pnpm's isolated layout stores the real package under
//    .pnpm/<name>@<version> (the version wildcard survives bumps);
//  - node-linker=hoisted uses the plain ./node_modules path. Vercel's
//    serverless packager previously rejected functions whose traces crossed
//    pnpm's symlinked directories ("The framework produced an invalid
//    deployment package…"), so both layouts remain explicit.
// A glob that matches nothing adds nothing, so listing both is safe. Recursive
// globs include package-owned wasm, worker, font, and browser assets. This keeps
// tracing EXPLICIT for routes that would otherwise rely on @vercel/nft
// following a runtime createRequire — exactly the implicit mechanism W-1
// taught us not to trust.
const ENGINE_TRACE_GLOBS = ENGINE_TRACE_PACKAGES.flatMap((packageName) => {
  const pnpmDirectoryName = packageName.replaceAll("/", "+");
  return [
    `./node_modules/.pnpm/${pnpmDirectoryName}@*/node_modules/${packageName}/**`,
    `./node_modules/${packageName}/**`,
  ];
});

// The Office engine is loaded through the same runtime adapter boundary (W-2),
// so @vercel/nft cannot see it either. Every required engine package is traced
// onto each route that can convert, validate, merge, watermark, or redact.
const ENGINE_OUTPUT_FILE_TRACING_INCLUDES = {
  "/api/convert/document": ENGINE_TRACE_GLOBS,
  "/api/documents/redaction": ENGINE_TRACE_GLOBS,
  "/api/public/links/download": ENGINE_TRACE_GLOBS,
  "/api/public/links/download-zip": ENGINE_TRACE_GLOBS,
  "/api/public/links/download-merged": ENGINE_TRACE_GLOBS,
  // file + signed-url force-repair missing converted assets, which runs the
  // same office conversion path as the download routes.
  "/api/public/links/file": ENGINE_TRACE_GLOBS,
  "/api/public/links/signed-url": ENGINE_TRACE_GLOBS,
  "/api/watermarks/preview": ENGINE_TRACE_GLOBS,
};

const nextConfig: NextConfig & { turbopack?: any } = {
  /* config options here */
  // Keep response headers in Next config, not middleware: the middleware
  // matcher excludes /api, /_next, and dotted paths. The custom-domain worker
  // rewrites Host to the app origin before Vercel, so host-aware rules are
  // unreliable; this host-agnostic set is safe when forwarded verbatim to
  // customer domains.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
  // Keep the e2e build cache separate from `pnpm dev` so its test build
  // (analytics stub, …) doesn't overwrite your `.next` dev cache. Defaults to
  // ".next" for normal dev/build; only e2e sets it.
  distDir: process.env.NEXT_DISTDIR || ".next",
  allowedDevOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],
  // Keep provider-owned packages external so wasm loads from node_modules at
  // runtime. The fixed graph is explicit because the adapter is initialized
  // through a package boundary that @vercel/nft cannot infer reliably.
  serverExternalPackages: [...ENGINE_TRACE_PACKAGES],
  outputFileTracingIncludes: ENGINE_OUTPUT_FILE_TRACING_INCLUDES,
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://s.dockosha.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://s.dockosha.com/:path*",
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

const appEnv = process.env.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase();
const isProductionAppEnv =
  appEnv != null
    ? appEnv === "production"
    : process.env.NODE_ENV === "production";
const sentryEnabled = isProductionAppEnv && Boolean(process.env.SENTRY_DSN);

const sentryConfig = withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "sublime-innovation-technologie",

  project: "dockosha",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Keep Sentry focused on error tracking only.
    automaticVercelMonitors: false,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});

export default sentryEnabled ? sentryConfig : nextConfig;
