import { expect, type Page } from "@playwright/test";
import { dismissCookieBannerIfPresent } from "./cookies";
import {
  upsertActiveWorkspaceSubscription,
  waitForWorkspaceByName,
} from "./db";
import { uniqueEmail, uniqueLettersName } from "./random";
import { signInWithEmailOtp } from "./auth";

const primaryUseCaseLabel = "Secure Sharing";

// Ends on the plan-picker heading, so callers can either seed entitlement
// directly (core spine) or continue through the plan-picker UI (free plan).
export const completeOnboarding = async (
  page: Page,
  args: { fullName: string; workspaceName: string },
): Promise<void> => {
  await page.waitForURL(/\/onboarding/, { timeout: 45_000 });
  await dismissCookieBannerIfPresent(page);

  await expect(
    page.getByRole("heading", { name: "Welcome to DocKosha" }),
  ).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("#fullName").fill(args.fullName);
  await page.locator("#role").click();
  await page.getByRole("option", { name: "Other" }).click();
  await page.locator("#company").fill(args.workspaceName);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "Personalize Experience" }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: primaryUseCaseLabel }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: /Pick a Plan|Choose your plan/i }),
  ).toBeVisible({ timeout: 45_000 });
};

export const provisionCoreWorkspace = async (
  page: Page,
): Promise<{ email: string; workspaceId: string; workspaceName: string }> => {
  const email = uniqueEmail("core");
  const workspaceName = uniqueLettersName("Core Flow Workspace");

  await signInWithEmailOtp(page, { email, redirectPath: "/documents" });
  await completeOnboarding(page, {
    fullName: "Core Flow Tester",
    workspaceName,
  });

  const workspace = await waitForWorkspaceByName({ name: workspaceName });
  await upsertActiveWorkspaceSubscription(workspace.id);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard/);

  return { email, workspaceId: workspace.id, workspaceName };
};
