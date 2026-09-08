import { expect, test } from "@playwright/test";
import { provisionCoreWorkspace } from "./helpers/provision";

test("TESTIMONIAL-001 submits and revalidates the testimonial Server Action @core", async ({
  page,
}) => {
  await provisionCoreWorkspace(page);

  await page.goto("/testimonial", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Share a testimonial" }),
  ).toBeVisible();

  await page.locator("#testimonial-name").fill("Taylor Rivera");
  await page.locator("#testimonial-role-title").fill("Operations Director");
  await page.locator("#testimonial-company").fill("Northwind Advisory");
  await page
    .locator("#testimonial-body")
    .fill(
      "DocKosha made secure sharing predictable for our client review process.",
    );
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(
    page.getByRole("heading", { name: "Submission received" }),
  ).toBeVisible({ timeout: 45_000 });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Submission received" }),
  ).toBeVisible({ timeout: 45_000 });
});
