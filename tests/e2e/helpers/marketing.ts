import { expect, type Page } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const appOrigin = new URL(baseUrl).origin;

// Marketing/SEO specs must not hit third-party hosts (analytics stubs, fonts).
export const blockExternalRequests = async (page: Page): Promise<void> => {
  await page.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (!requestUrl.startsWith("http")) {
      await route.continue();
      return;
    }

    const url = new URL(requestUrl);
    if (url.origin === appOrigin) {
      await route.continue();
      return;
    }

    await route.abort();
  });
};

export const readJsonLdById = async <T>(
  page: Page,
  scriptId: string,
): Promise<T> => {
  const rawJson = await page.locator(`#${scriptId}`).textContent();
  expect(rawJson, `JSON-LD script #${scriptId} should exist`).toBeTruthy();
  return JSON.parse(rawJson ?? "{}") as T;
};
