import { expect, type Page } from "@playwright/test";
import {
  dismissCookieBannerIfPresent,
  seedDeniedAnalyticsConsentCookie,
} from "./cookies";
import { generateEmailOtpOrLink } from "./db";
import { waitForOtpCode } from "./mailpit";

export const signInWithEmailOtp = async (
  page: Page,
  args: { email: string; redirectPath?: string },
): Promise<void> => {
  await seedDeniedAnalyticsConsentCookie(page.context());

  const redirect = args.redirectPath ?? "/dashboard";
  const params = new URLSearchParams({ redirect });
  await page.goto(`/auth/sign-in?${params.toString()}`, {
    waitUntil: "domcontentloaded",
  });
  await dismissCookieBannerIfPresent(page);

  if (new URL(page.url()).pathname !== "/auth/sign-in") return;

  await expect(page.locator("#email")).toBeVisible({ timeout: 30_000 });

  // The regex excludes the "Continue with Google" OAuth button; the role
  // locator keeps Playwright actionability checks that an evaluate-click skips.
  const submitButton = page.getByRole("button", {
    name: /Sign In with Email|Continue with Email/,
  });
  // Dev-mode hydration race: filling before React hydrates leaves the
  // controlled input's state empty (submit stays disabled) even though the
  // DOM shows the value. Re-fill until the submit enables.
  //
  // Clear before each fill so React's controlled-input value tracker always
  // sees a real transition. Without the reset, a pre-hydration fill can leave
  // the DOM value equal to what we re-fill; React then suppresses `onChange`,
  // the `email` state stays empty, and the button never enables for the whole
  // budget (observed as a FREE-001 flake).
  const emailInput = page.locator("#email");
  await expect(async () => {
    await emailInput.fill("");
    await emailInput.fill(args.email);
    await expect(submitButton).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });

  const sinceMs = Date.now();
  await submitButton.click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible({
    timeout: 30_000,
  });

  let code: string | null = null;
  try {
    code = await waitForOtpCode({
      to: args.email,
      sinceMs,
      timeoutMs: 45_000,
    });
  } catch {
    const generated = await generateEmailOtpOrLink({
      email: args.email,
      redirectTo: new URL(page.url()).origin,
    });
    code = generated.emailOtp;
  }

  if (!code) throw new Error("Could not resolve login OTP for test user");

  await page.locator("#otp").fill(code);
  await page.getByRole("button", { name: "Verify Code" }).click();
  await page.waitForURL(
    (url) =>
      url.pathname === redirect ||
      url.pathname === "/dashboard" ||
      url.pathname === "/onboarding" ||
      url.pathname === "/plan",
    { timeout: 45_000, waitUntil: "domcontentloaded" },
  );
};
