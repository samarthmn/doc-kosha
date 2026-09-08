import {
  defineConfig,
  devices,
  type PlaywrightTestConfig,
} from "@playwright/test";
import { DEFAULT_POSTHOG_HOST } from "./src/lib/analytics/posthogConfig";
import { PRIVATE_SAMPLE_BROWSER_TEST_PATHS } from "./scripts/private-sample-test-policy.mjs";

// Run the e2e app on :3000 (the app's default port). Override with
// PLAYWRIGHT_BASE_URL if you need a different origin. NOTE: because
// reuseExistingServer is true (below), a server already listening on :3000 is
// reused as-is — stop it before running e2e so the suite boots its own
// production build with the e2e env (analytics stub, …) instead of a stale
// server (which would fail the consent spec).
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
// Publish the resolved base URL so test workers (which inherit this process's
// env at spawn) and every helper that reads PLAYWRIGHT_BASE_URL agree with the
// server's port — otherwise their `?? "http://localhost:3000"` defaults would
// point at the wrong origin (e.g. marketing.ts's request allow-list, which
// would then abort the app's own navigation with net::ERR_FAILED).
process.env.PLAYWRIGHT_BASE_URL = baseURL;
// Keep the managed app-server port derived from the base URL so the two can never diverge.
const appPort = new URL(baseURL).port || "3000";

// Keep the managed E2E cache separate from the regular Next cache. A
// caller-set directory stays available for intentionally isolated one-off builds.
const nextDistDir = process.env.NEXT_DISTDIR ?? ".next-e2e";
const r2Endpoint = process.env.R2_ENDPOINT ?? "http://localhost:9000";
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST;
const privateSampleTestIgnore =
  process.env.DOCKOSHA_PRIVATE_SAMPLE_TESTS === "1"
    ? []
    : PRIVATE_SAMPLE_BROWSER_TEST_PATHS.map((filePath) => `**/${filePath}`);

const isLocalUrl = (rawUrl: string): boolean => {
  try {
    const url = new URL(rawUrl);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "0.0.0.0"
    );
  } catch {
    return false;
  }
};

const shouldStartStripeWebhook = Boolean(process.env.STRIPE_WEBHOOK_SECRET);

// MinIO for local R2 simulation (only if R2_ENDPOINT is localhost)
const shouldStartMinio = isLocalUrl(r2Endpoint);

type WebServerItem = Exclude<
  NonNullable<PlaywrightTestConfig["webServer"]>,
  unknown[]
>;

// Env vars to pass to the managed Next server (disable the Help widget for deterministic e2e)
const webServerEnv = {
  ...process.env,
  PLAYWRIGHT: "true",
  NEXT_PUBLIC_ENABLE_PRODUCT_GUIDES: "false",
  // Keep deterministic author hashes in e2e when local env doesn't define it.
  COMMENTS_AUTHOR_SECRET:
    process.env.COMMENTS_AUTHOR_SECRET ??
    "e2e-comments-author-secret-please-change-in-real-env",
  // Enable PostHog in e2e. Individual specs should stub https://s.dockosha.com requests to avoid outbound calls.
  NEXT_PUBLIC_POSTHOG_KEY:
    process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "phc_e2e_dummy",
  NEXT_PUBLIC_POSTHOG_HOST: POSTHOG_HOST,
  NEXT_PUBLIC_LINKEDIN_PARTNER_ID:
    process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID ?? "8924668",
  // Allow consent-gated vendor loading (PostHog/LinkedIn) in local e2e so the
  // AGENTS.md-mandated consent coverage can assert the positive path against
  // stubbed hosts without flipping NEXT_PUBLIC_APP_ENV to production.
  NEXT_PUBLIC_E2E_ANALYTICS_STUB: "true",
  // Keep app-generated absolute URLs (robots/sitemap/JSON-LD) on the test origin.
  NEXT_PUBLIC_APP_URL: baseURL,
  // Keep e2e's build cache in its own dist dir so it doesn't overwrite the
  // regular `.next` development cache.
  NEXT_DISTDIR: nextDistDir,
};

const webServers: WebServerItem[] = [
  {
    // Build and serve the same webpack artifact shape used for staging. A dev
    // server is unsuitable for this repository: both Turbopack and webpack can
    // exhaust low host watch limits, while polling reloads the app as Playwright
    // writes traces under the repository. Production mode needs no watchers.
    command: `node scripts/prepare-engine-assets.mjs && node scripts/sync-pdfjs-assets.mjs && pnpm exec next build --webpack && pnpm exec next start -H 127.0.0.1 -p ${appPort}`,
    // A first build in an isolated environment can exceed Playwright's default
    // 60-second web-server startup budget on constrained local hosts.
    timeout: 600_000,
    // Probe a DocKosha-unique route so an unrelated app squatting on the port
    // fails readiness loudly instead of being silently reused.
    url: new URL("/dockosha-facts", baseURL).toString(),
    reuseExistingServer: true,
    stdout: "pipe",
    stderr: "pipe",
    env: webServerEnv,
  },
];

if (shouldStartStripeWebhook) {
  webServers.push({
    command: "pnpm stripe:webhook",
    url: baseURL + "/stripe/webhook/v1",
    reuseExistingServer: true,
    stdout: "pipe",
    stderr: "pipe",
  });
}

if (shouldStartMinio) {
  webServers.push({
    command: "pnpm r2:up",
    url: `${r2Endpoint}/minio/health/live`,
    reuseExistingServer: true,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
}

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: privateSampleTestIgnore,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  // The core product suite is intentionally serial: it provisions one
  // workspace and walks the main regression spine in order.
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 1,
  workers: 1,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    // Keep room for slower local browser actions and processing routes.
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: webServers,
});
