import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { dismissCookieBannerIfPresent } from "./cookies";

const waitForUploadQueueDone = async (page: Page): Promise<void> => {
  const manager = page.getByRole("region", { name: "Upload manager" });
  if (!(await manager.isVisible().catch(() => false))) return;
  await expect(manager.getByText("Done")).toBeVisible({ timeout: 90_000 });
};

const continueDuplicateReplaceIfPresent = async (
  page: Page,
  modal: Locator,
): Promise<void> => {
  const continueButton = page.getByRole("button", {
    name: /Continue upload/i,
  });
  const nextState = await Promise.race([
    modal
      .waitFor({ state: "hidden", timeout: 15_000 })
      .then(() => "closed" as const)
      .catch(() => "modal-timeout" as const),
    continueButton
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => "duplicate" as const)
      .catch(() => "duplicate-timeout" as const),
  ]);
  if (nextState !== "duplicate") return;
  await continueButton.click();
  await expect(continueButton).toBeHidden({ timeout: 30_000 });
};

export const uploadDocumentViaModal = async (
  page: Page,
  absoluteFilePath: string,
  options: {
    destinationUrl?: string;
    uploadButtonGuide?: "documents-upload-button" | "data-room-upload-button";
    waitForQueueDone?: boolean;
  } = {},
): Promise<void> => {
  await uploadDocumentsViaModal(page, [absoluteFilePath], options);
};

export const uploadDocumentsViaModal = async (
  page: Page,
  absoluteFilePaths: string[],
  options: {
    destinationUrl?: string;
    uploadButtonGuide?: "documents-upload-button" | "data-room-upload-button";
    waitForQueueDone?: boolean;
  } = {},
): Promise<void> => {
  if (absoluteFilePaths.length === 0) {
    throw new Error("At least one file is required for upload");
  }

  const destinationUrl = options.destinationUrl ?? "/documents";
  const uploadButtonGuide =
    options.uploadButtonGuide ?? "documents-upload-button";
  await page.goto(destinationUrl, { waitUntil: "domcontentloaded" });
  const uploadButton = page.locator(`[data-guide="${uploadButtonGuide}"]`);
  await expect(uploadButton).toBeVisible({
    timeout: 30_000,
  });
  await dismissCookieBannerIfPresent(page);
  const modal = page.locator('[data-guide="documents-upload-modal"]');
  // A cold Next.js route can paint the SSR button before hydration attaches
  // its click handler. Retry the click until the modal proves the handler ran.
  await expect(async () => {
    if (await modal.isVisible().catch(() => false)) return;
    await uploadButton.click();
    await expect(modal).toBeVisible({ timeout: 3_000 });
  }).toPass({
    timeout: 30_000,
    intervals: [250, 500, 1_000],
  });
  await modal
    .locator('input[type="file"]')
    .first()
    .setInputFiles(absoluteFilePaths);
  await expect(
    modal.locator('[data-guide="documents-upload-start"]'),
  ).toBeEnabled({
    timeout: 30_000,
  });
  await modal.locator('[data-guide="documents-upload-start"]').click();
  await continueDuplicateReplaceIfPresent(page, modal);
  await expect(modal).toBeHidden({ timeout: 60_000 });
  if (options.waitForQueueDone ?? true) {
    await waitForUploadQueueDone(page);
  }
};

export const expectUnsupportedUploadRejected = async (
  page: Page,
  absoluteFilePath: string,
): Promise<void> => {
  await page.goto("/documents", { waitUntil: "domcontentloaded" });
  await page.locator('[data-guide="documents-upload-button"]').click();
  const modal = page.locator('[data-guide="documents-upload-modal"]');
  await expect(modal).toBeVisible();
  await modal
    .locator('input[type="file"]')
    .first()
    .setInputFiles(absoluteFilePath);
  await expect(
    modal.locator('[data-guide="documents-upload-start"]'),
  ).toBeDisabled();
  await expect(
    modal.getByText(path.basename(absoluteFilePath), { exact: true }),
  ).toHaveCount(0);
  await modal.getByRole("button", { name: "Cancel" }).click();
  await expect(modal).toBeHidden();
};
