import type { BrowserContext, Page } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const ANALYTICS_CONSENT_COOKIE = "dk_analytics_consent";

export const dismissCookieBannerIfPresent = async (
  page: Page,
): Promise<void> => {
  const button = page.getByRole("button", {
    name: /accept|agree|got it/i,
  });
  if (
    await button
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    await button
      .first()
      .click()
      .catch(() => {});
  }
};

// Pre-seed an explicit "denied" consent choice. With the e2e analytics stub
// flag enabled (playwright.config.ts), the EU consent banner would otherwise
// mount on a 600ms delay and overlay gate/sign-in flows; seeding a denied
// cookie keeps those flows deterministic without granting any consent.
export const seedDeniedAnalyticsConsentCookie = async (
  context: BrowserContext,
): Promise<void> => {
  await context.addCookies([
    {
      name: ANALYTICS_CONSENT_COOKIE,
      value: encodeURIComponent(
        JSON.stringify({
          v: 1,
          ts: new Date().toISOString(),
          region: "EU_EEA_UK",
          analytics: false,
          replay: false,
          gpcSeen: false,
        }),
      ),
      url: `${new URL(baseUrl).origin}/`,
    },
  ]);
};
