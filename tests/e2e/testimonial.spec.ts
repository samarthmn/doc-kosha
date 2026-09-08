import { expect, test, type Page } from "@playwright/test";
import { provisionCoreWorkspace } from "./helpers/provision";

const observeHeadshotCleanup = (page: Page) => {
  const deletedPaths: string[] = [];
  const statuses: number[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/storage/delete") {
      deletedPaths.push(request.postDataJSON().path);
    }
  });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/storage/delete") {
      statuses.push(response.status());
    }
  });
  return { deletedPaths, statuses };
};

test("TESTIMONIAL-002 preserves input when a deployment no longer recognizes the action @core", async ({
  page,
}) => {
  await provisionCoreWorkspace(page);
  await page.goto("/testimonial", { waitUntil: "domcontentloaded" });
  await page.locator("#testimonial-name").fill("Taylor Rivera");
  await page.locator("#testimonial-role-title").fill("Operations Director");
  await page.locator("#testimonial-company").fill("Northwind Advisory");
  const testimonial =
    "DocKosha made secure sharing predictable for our client review process.";
  await page.locator("#testimonial-body").fill(testimonial);
  await page
    .locator("#testimonial-headshot")
    .setInputFiles("public/assets/blog-placeholder.png");
  const cleanup = observeHeadshotCleanup(page);
  const upload = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/storage/upload-url" &&
      response.request().method() === "POST",
  );
  let submissions = 0;
  await page.route("**/testimonial", async (route) => {
    if (
      route.request().method() !== "POST" ||
      !route.request().headers()["next-action"]
    ) {
      await route.continue();
      return;
    }
    submissions += 1;
    await route.fulfill({
      status: 404,
      headers: { "x-nextjs-action-not-found": "1" },
      contentType: "text/plain",
      body: "Server action not found.",
    });
  });
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "The app was updated" }),
  ).toBeVisible();
  await expect(page.locator("#testimonial-name")).toHaveValue("Taylor Rivera");
  await expect(page.locator("#testimonial-body")).toHaveValue(testimonial);
  await expect(
    page.getByRole("button", { name: "Reload page", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit", exact: true }),
  ).toBeEnabled();
  const { storagePath } = await (await upload).json();
  expect(storagePath).toBeTruthy();
  await expect.poll(() => cleanup.deletedPaths).toEqual([storagePath]);
  await expect.poll(() => cleanup.statuses).toEqual([200]);
  expect(
    await page
      .locator("#testimonial-headshot")
      .evaluate((input: HTMLInputElement) => input.files?.length),
  ).toBe(1);
  const reload = page.getByRole("button", { name: "Reload page", exact: true });
  await reload.focus();
  await expect(reload).toBeFocused();
  expect(submissions).toBe(1);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    reload.press("Enter"),
  ]);
  await expect(
    page.getByRole("heading", { name: "Share a testimonial" }),
  ).toBeVisible();
  await expect(reload).toHaveCount(0);
  expect(submissions).toBe(1);
});

test("TESTIMONIAL-003 preserves input and settles pending state when submission loses its connection @core", async ({
  page,
}) => {
  await provisionCoreWorkspace(page);
  await page.goto("/testimonial", { waitUntil: "domcontentloaded" });
  const values = {
    name: "Taylor Rivera",
    roleTitle: "Operations Director",
    company: "Northwind Advisory",
    testimonial:
      "DocKosha made secure sharing predictable for our client review process.",
  };
  await page.locator("#testimonial-name").fill(values.name);
  await page.locator("#testimonial-role-title").fill(values.roleTitle);
  await page.locator("#testimonial-company").fill(values.company);
  await page.locator("#testimonial-body").fill(values.testimonial);
  await page
    .locator("#testimonial-headshot")
    .setInputFiles("public/assets/blog-placeholder.png");
  const cleanup = observeHeadshotCleanup(page);
  const upload = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/storage/upload-url" &&
      response.request().method() === "POST",
  );
  let submissions = 0;
  await page.route("**/testimonial", async (route) => {
    if (
      route.request().method() !== "POST" ||
      !route.request().headers()["next-action"]
    ) {
      await route.continue();
      return;
    }
    submissions += 1;
    await route.abort("connectionfailed");
  });
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "We couldn't confirm your submission" }),
  ).toBeVisible();
  await expect(page.locator("#testimonial-name")).toHaveValue(values.name);
  await expect(page.locator("#testimonial-role-title")).toHaveValue(
    values.roleTitle,
  );
  await expect(page.locator("#testimonial-company")).toHaveValue(
    values.company,
  );
  await expect(page.locator("#testimonial-body")).toHaveValue(
    values.testimonial,
  );
  await expect(
    page.getByRole("button", { name: "Submit", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Reload page", exact: true }),
  ).toHaveCount(0);
  expect(submissions).toBe(1);
  const { storagePath } = await (await upload).json();
  expect(storagePath).toBeTruthy();
  expect(cleanup.deletedPaths).toEqual([]);
  expect(cleanup.statuses).toEqual([]);
});

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
