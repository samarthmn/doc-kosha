import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type Request,
} from "@playwright/test";
import { provisionCoreWorkspace } from "./helpers/provision";

type RailWidthSample = {
  elapsedMs: number;
  iconCenterX: number;
  width: number;
};

declare global {
  interface Window {
    __dkRailMotionObserver?: ResizeObserver;
    __dkRailMotionSamples?: RailWidthSample[];
    __dkRailMotionStartedAt?: number;
    __dkStartupRailWidths?: number[];
  }
}

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const GLOBAL_STORE_KEY = "dockosha-global-store";
const DESKTOP_RAIL_EXPANDED_WIDTH = 232;
const DESKTOP_RAIL_COLLAPSED_WIDTH = 68;
const WIDTH_TOLERANCE = 1;

const THEMES = [
  "System",
  "Light",
  "Dark",
  "Copper",
  "Forest",
  "Lavender",
  "Midnight",
  "Ocean",
  "Sunset",
] as const;

const VIEWPORTS = [
  { name: "mobile-320", width: 320, height: 844 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const absoluteUrl = (pathname: string): string =>
  new URL(pathname, BASE_URL).toString();

const getDesktopRail = (page: Page): Locator =>
  page
    .locator("aside")
    .filter({ has: page.getByRole("navigation", { name: "Primary" }) });

const expectNoHorizontalOverflow = async (page: Page): Promise<void> => {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return {
      body: body.scrollWidth - root.clientWidth,
      document: root.scrollWidth - root.clientWidth,
    };
  });

  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.body).toBeLessThanOrEqual(1);
};

const expectKeyboardFocusVisible = async (
  page: Page,
  target: Locator,
): Promise<void> => {
  await target.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(target).toBeFocused();

  const focusStyle = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focusVisible: element.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focusStyle.focusVisible).toBe(true);
  expect(focusStyle.outlineStyle).toBe("solid");
  expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);
};

const setPersistedSidebarState = (config: {
  collapsed: boolean;
  key: string;
  theme: string;
}): void => {
  localStorage.setItem(
    config.key,
    JSON.stringify({
      state: {
        isSidebarCollapsed: config.collapsed,
        theme: config.theme,
      },
      version: 0,
    }),
  );
};

const startRailMotionRecording = async (rail: Locator): Promise<void> => {
  await rail.evaluate((element) => {
    const startedAt = performance.now();
    const samples: RailWidthSample[] = [];
    const record = (): void => {
      const railRect = element.getBoundingClientRect();
      const icon = element.querySelector<SVGElement>(
        "[data-dk-primary-nav-icon]",
      );
      if (!icon) throw new Error("Primary navigation icon was not available");
      const iconRect = icon.getBoundingClientRect();
      samples.push({
        elapsedMs: performance.now() - startedAt,
        iconCenterX: iconRect.left + iconRect.width / 2 - railRect.left,
        width: railRect.width,
      });
    };
    const observer = new ResizeObserver(record);
    record();
    observer.observe(element);
    window.__dkRailMotionStartedAt = startedAt;
    window.__dkRailMotionSamples = samples;
    window.__dkRailMotionObserver = observer;
  });
};

const finishRailMotionRecording = async (
  rail: Locator,
  expectedWidth: number,
): Promise<RailWidthSample[]> =>
  rail.evaluate(
    async (element, config) => {
      let stableFrames = 0;

      for (let frame = 0; frame < 45; frame += 1) {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
        const width = element.getBoundingClientRect().width;
        if (Math.abs(width - config.finalWidth) <= config.tolerance) {
          stableFrames += 1;
        } else {
          stableFrames = 0;
        }
        if (stableFrames >= 3) break;
      }

      const startedAt = window.__dkRailMotionStartedAt ?? performance.now();
      const samples = window.__dkRailMotionSamples ?? [];
      const railRect = element.getBoundingClientRect();
      const icon = element.querySelector<SVGElement>(
        "[data-dk-primary-nav-icon]",
      );
      if (!icon) throw new Error("Primary navigation icon was not available");
      const iconRect = icon.getBoundingClientRect();
      samples.push({
        elapsedMs: performance.now() - startedAt,
        iconCenterX: iconRect.left + iconRect.width / 2 - railRect.left,
        width: railRect.width,
      });
      window.__dkRailMotionObserver?.disconnect();
      return samples;
    },
    { finalWidth: expectedWidth, tolerance: WIDTH_TOLERANCE },
  );

test.describe.serial("UI/UX consistency @core", () => {
  test.setTimeout(180_000);

  let setupContext: BrowserContext;
  let storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;

  test.beforeAll(async ({ browser }) => {
    setupContext = await browser.newContext({ baseURL: BASE_URL });
    const setupPage = await setupContext.newPage();
    await provisionCoreWorkspace(setupPage);
    storageState = await setupContext.storageState();
  });

  test.afterAll(async () => {
    await setupContext?.close();
  });

  test("switches Settings panels through native history without an RSC request or shell remount", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState,
      viewport: { width: 1440, height: 900 },
    });

    try {
      const page = await context.newPage();
      await page.goto(
        absoluteUrl(
          "/settings?tab=profile&filter=a&filter=b&redirect=%2Fdocuments%3Ffolder%3Dx#security",
        ),
        { waitUntil: "domcontentloaded" },
      );

      const profileTab = page.getByRole("tab", { name: "Profile" });
      const appearanceTab = page.getByRole("tab", { name: "Appearance" });
      const privacyTab = page.getByRole("tab", { name: "Privacy" });
      await expect(profileTab).toHaveAttribute("data-state", "active");
      await expect(page.locator("#fullName")).toBeVisible();

      const shellBefore = await page
        .locator(".dk-authenticated-shell")
        .elementHandle();
      const mainBefore = await page
        .locator(".dk-authenticated-main")
        .elementHandle();
      if (!shellBefore || !mainBefore) {
        throw new Error("Authenticated shell handles were not available");
      }

      const settingsRscRequests: string[] = [];
      const recordRscRequest = (request: Request): void => {
        const url = new URL(request.url());
        // The sidebar may prefetch unrelated destinations after first paint.
        // This assertion is scoped to the Settings route whose tab interaction
        // must remain native-history-only.
        if (
          url.pathname === "/settings" &&
          (url.searchParams.has("_rsc") || request.headers().rsc === "1")
        ) {
          settingsRscRequests.push(request.url());
        }
      };
      page.on("request", recordRscRequest);

      await expectKeyboardFocusVisible(page, appearanceTab);
      await page.keyboard.press("Enter");

      const immediateUrl = new URL(page.url());
      expect(immediateUrl.searchParams.get("tab")).toBe("appearance");
      expect(immediateUrl.searchParams.getAll("filter")).toEqual(["a", "b"]);
      expect(immediateUrl.searchParams.get("redirect")).toBe(
        "/documents?folder=x",
      );
      expect(immediateUrl.hash).toBe("#security");

      await expect(appearanceTab).toHaveAttribute("data-state", "active");
      await expect(
        page.getByRole("heading", { name: "Appearance", exact: true }),
      ).toBeVisible();

      await privacyTab.click();
      const privacyUrl = new URL(page.url());
      expect(privacyUrl.searchParams.get("tab")).toBe("privacy");
      expect(privacyUrl.searchParams.getAll("filter")).toEqual(["a", "b"]);
      expect(privacyUrl.hash).toBe("#security");
      await expect(privacyTab).toHaveAttribute("data-state", "active");
      await expect(
        page.getByRole("heading", { name: "Privacy", exact: true }),
      ).toBeVisible();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );

      const shellAfter = await page
        .locator(".dk-authenticated-shell")
        .elementHandle();
      const mainAfter = await page
        .locator(".dk-authenticated-main")
        .elementHandle();
      if (!shellAfter || !mainAfter) {
        throw new Error("Authenticated shell handles disappeared");
      }
      expect(
        await shellBefore.evaluate(
          (element, current) => element === current,
          shellAfter,
        ),
      ).toBe(true);
      expect(
        await mainBefore.evaluate(
          (element, current) => element === current,
          mainAfter,
        ),
      ).toBe(true);
      expect(settingsRscRequests).toEqual([]);
      page.off("request", recordRscRequest);
      await expectNoHorizontalOverflow(page);
    } finally {
      await context.close();
    }
  });

  test("keeps a recovery route fail-closed when switching to a protected Settings panel", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState,
      viewport: { width: 1440, height: 900 },
    });

    try {
      const page = await context.newPage();
      await page.goto(
        absoluteUrl("/settings?tab=subscription&from=checkout#recovery"),
        { waitUntil: "domcontentloaded" },
      );
      const subscriptionTab = page.getByRole("tab", {
        name: "Subscription & Usage",
      });
      await expect(subscriptionTab).toHaveAttribute("data-state", "active");

      await page.route(
        "**/rest/v1/rpc/workspace_has_entitlement",
        async (route) => {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({
              code: "E2E_ENTITLEMENT_UNAVAILABLE",
              message: "Injected entitlement outage",
            }),
          });
        },
      );

      await page.getByRole("tab", { name: "Profile" }).click();
      const protectedUrl = new URL(page.url());
      expect(protectedUrl.searchParams.get("tab")).toBe("profile");
      expect(protectedUrl.searchParams.get("from")).toBe("checkout");
      expect(protectedUrl.hash).toBe("#recovery");
      await expect(page.locator("#fullName")).toHaveCount(0);
      await expect(
        page.getByRole("heading", {
          name: "Unable to verify your subscription",
        }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.locator("#fullName")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("invalidates a prior Settings entitlement verdict across subscription recovery", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState,
      viewport: { width: 1440, height: 900 },
    });

    try {
      const page = await context.newPage();
      await page.goto(absoluteUrl("/settings?tab=profile&source=review"), {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator("#fullName")).toBeVisible();

      let releaseDelayedEntitlement!: () => void;
      const delayedEntitlementRelease = new Promise<void>((resolve) => {
        releaseDelayedEntitlement = resolve;
      });
      let markDelayedEntitlementStarted!: () => void;
      const delayedEntitlementStarted = new Promise<void>((resolve) => {
        markDelayedEntitlementStarted = resolve;
      });
      let entitlementAttempt = 0;
      await page.route(
        "**/rest/v1/rpc/workspace_has_entitlement",
        async (route) => {
          entitlementAttempt += 1;
          if (entitlementAttempt === 1) {
            markDelayedEntitlementStarted();
            await delayedEntitlementRelease;
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: "true",
            });
            return;
          }

          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({
              code: "E2E_ENTITLEMENT_UNAVAILABLE",
              message: "Injected entitlement outage after prior allow",
            }),
          });
        },
      );

      // Start an older same-path recheck and hold its allowed response until
      // recovery entry has synchronously invalidated the prior verdict.
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await delayedEntitlementStarted;

      const settingsRscRequests: string[] = [];
      const recordRscRequest = (request: Request): void => {
        const url = new URL(request.url());
        if (
          url.pathname === "/settings" &&
          (url.searchParams.has("_rsc") || request.headers().rsc === "1")
        ) {
          settingsRscRequests.push(request.url());
        }
      };
      page.on("request", recordRscRequest);

      const subscriptionClick = page
        .getByRole("tab", { name: "Subscription & Usage" })
        .click();
      await page.waitForFunction(
        () =>
          new URL(window.location.href).searchParams.get("tab") ===
          "subscription",
      );
      const staleAllowedResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            "/rest/v1/rpc/workspace_has_entitlement" &&
          response.status() === 200,
      );
      releaseDelayedEntitlement();
      await Promise.all([subscriptionClick, staleAllowedResponse]);
      await expect(
        page.getByRole("tab", { name: "Subscription & Usage" }),
      ).toHaveAttribute("data-state", "active");
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );

      await page.getByRole("tab", { name: "Profile" }).click();
      const protectedUrl = new URL(page.url());
      expect(protectedUrl.searchParams.get("tab")).toBe("profile");
      expect(protectedUrl.searchParams.get("source")).toBe("review");
      expect(await page.locator("#fullName").count()).toBe(0);
      await expect(
        page.getByRole("heading", {
          name: "Unable to verify your subscription",
        }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.locator("#fullName")).toHaveCount(0);
      expect(settingsRscRequests).toEqual([]);
      page.off("request", recordRscRequest);
    } finally {
      await context.close();
    }
  });

  test("animates only the desktop rail and preserves its stable keyboard toggle", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState,
      viewport: { width: 1440, height: 900 },
    });
    await context.addInitScript(setPersistedSidebarState, {
      collapsed: false,
      key: GLOBAL_STORE_KEY,
      theme: "system",
    });

    try {
      const page = await context.newPage();
      await page.goto(absoluteUrl("/settings?tab=profile"), {
        waitUntil: "domcontentloaded",
      });
      const rail = getDesktopRail(page);
      await expect(rail).toBeVisible();
      await expect
        .poll(() =>
          rail.evaluate((element) => element.getBoundingClientRect().width),
        )
        .toBe(DESKTOP_RAIL_EXPANDED_WIDTH);

      const toggle = rail.locator("button[aria-expanded]");
      await expect(toggle).toHaveAccessibleName("Collapse sidebar");
      await toggle.focus();
      await expect(toggle).toBeFocused();
      const toggleBefore = await toggle.elementHandle();
      if (!toggleBefore) throw new Error("Sidebar toggle was not available");

      await startRailMotionRecording(rail);
      await toggle.press("Enter");
      const samples = await finishRailMotionRecording(
        rail,
        DESKTOP_RAIL_COLLAPSED_WIDTH,
      );

      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAccessibleName("Expand sidebar");
      const toggleAfter = await toggle.elementHandle();
      if (!toggleAfter) throw new Error("Sidebar toggle disappeared");
      expect(
        await toggleBefore.evaluate(
          (element, current) => element === current,
          toggleAfter,
        ),
      ).toBe(true);

      expect(samples[0]?.width).toBeCloseTo(DESKTOP_RAIL_EXPANDED_WIDTH, 0);
      expect(
        samples.some(
          ({ width }) =>
            width > DESKTOP_RAIL_COLLAPSED_WIDTH + WIDTH_TOLERANCE &&
            width < DESKTOP_RAIL_EXPANDED_WIDTH - WIDTH_TOLERANCE,
        ),
      ).toBe(true);
      const settled = samples.find(
        ({ width }) =>
          Math.abs(width - DESKTOP_RAIL_COLLAPSED_WIDTH) <= WIDTH_TOLERANCE,
      );
      expect(settled).toBeDefined();
      if (!settled)
        throw new Error("Sidebar never reached its collapsed width");
      expect(settled.elapsedMs).toBeGreaterThanOrEqual(120);
      expect(settled.elapsedMs).toBeLessThanOrEqual(350);
      expect(samples.at(-1)?.width).toBeCloseTo(
        DESKTOP_RAIL_COLLAPSED_WIDTH,
        0,
      );
      const collapseIconCenters = samples.map(({ iconCenterX }) => iconCenterX);
      expect(
        Math.max(...collapseIconCenters) - Math.min(...collapseIconCenters),
      ).toBeLessThanOrEqual(1);

      await startRailMotionRecording(rail);
      await toggle.press("Enter");
      const expandSamples = await finishRailMotionRecording(
        rail,
        DESKTOP_RAIL_EXPANDED_WIDTH,
      );
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAccessibleName("Collapse sidebar");
      expect(
        expandSamples.some(
          ({ width }) =>
            width > DESKTOP_RAIL_COLLAPSED_WIDTH + WIDTH_TOLERANCE &&
            width < DESKTOP_RAIL_EXPANDED_WIDTH - WIDTH_TOLERANCE,
        ),
      ).toBe(true);
      const expanded = expandSamples.find(
        ({ width }) =>
          Math.abs(width - DESKTOP_RAIL_EXPANDED_WIDTH) <= WIDTH_TOLERANCE,
      );
      expect(expanded).toBeDefined();
      if (!expanded)
        throw new Error("Sidebar never reached its expanded width");
      expect(expanded.elapsedMs).toBeGreaterThanOrEqual(120);
      expect(expanded.elapsedMs).toBeLessThanOrEqual(350);
      const expandIconCenters = expandSamples.map(
        ({ iconCenterX }) => iconCenterX,
      );
      expect(
        Math.max(...expandIconCenters) - Math.min(...expandIconCenters),
      ).toBeLessThanOrEqual(1);
      const dashboardLink = rail.getByRole("link", { name: "Dashboard" });
      const dashboardIconBox = await dashboardLink
        .locator("[data-dk-primary-nav-icon]")
        .boundingBox();
      const dashboardLabelBox = await dashboardLink
        .getByText("Dashboard", { exact: true })
        .boundingBox();
      expect(dashboardIconBox).not.toBeNull();
      expect(dashboardLabelBox).not.toBeNull();
      if (!dashboardIconBox || !dashboardLabelBox) {
        throw new Error(
          "Expanded Dashboard icon and label were not measurable",
        );
      }
      expect(dashboardLabelBox.x).toBeGreaterThanOrEqual(
        dashboardIconBox.x + dashboardIconBox.width,
      );
    } finally {
      await context.close();
    }
  });

  test("skips startup and reduced-motion rail tweens while leaving mobile navigation intact", async ({
    browser,
  }) => {
    const persistedContext = await browser.newContext({
      baseURL: BASE_URL,
      storageState,
      viewport: { width: 1440, height: 900 },
    });
    await persistedContext.addInitScript(
      (config) => {
        localStorage.setItem(
          config.key,
          JSON.stringify({
            state: {
              isSidebarCollapsed: true,
              theme: "system",
            },
            version: 0,
          }),
        );
        window.__dkStartupRailWidths = [];
        let sampledRailFrames = 0;
        const sample = (): void => {
          const rail = document.querySelector<HTMLElement>(
            ".dk-authenticated-shell > aside",
          );
          if (rail) {
            window.__dkStartupRailWidths?.push(
              rail.getBoundingClientRect().width,
            );
            sampledRailFrames += 1;
          }
          if (sampledRailFrames < 30) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      },
      { key: GLOBAL_STORE_KEY },
    );

    try {
      const page = await persistedContext.newPage();
      await page.goto(absoluteUrl("/settings?tab=profile"), {
        waitUntil: "domcontentloaded",
      });
      const rail = getDesktopRail(page);
      await expect(rail).toBeVisible();
      await expect
        .poll(() =>
          rail.evaluate((element) => element.getBoundingClientRect().width),
        )
        .toBe(DESKTOP_RAIL_COLLAPSED_WIDTH);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );
      const startupWidths = await page.evaluate(
        () => window.__dkStartupRailWidths ?? [],
      );
      expect(startupWidths.length).toBeGreaterThan(0);
      expect(
        startupWidths.every(
          (width) =>
            Math.abs(width - DESKTOP_RAIL_COLLAPSED_WIDTH) <= WIDTH_TOLERANCE,
        ),
      ).toBe(true);
    } finally {
      await persistedContext.close();
    }

    const reducedContext = await browser.newContext({
      baseURL: BASE_URL,
      storageState,
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    await reducedContext.addInitScript(setPersistedSidebarState, {
      collapsed: false,
      key: GLOBAL_STORE_KEY,
      theme: "system",
    });

    try {
      const page = await reducedContext.newPage();
      await page.goto(absoluteUrl("/settings?tab=profile"), {
        waitUntil: "domcontentloaded",
      });
      expect(
        await page.evaluate(
          () => matchMedia("(prefers-reduced-motion: reduce)").matches,
        ),
      ).toBe(true);
      const rail = getDesktopRail(page);
      await expect(rail).toBeVisible();
      await expect
        .poll(() =>
          rail.evaluate((element) => element.getBoundingClientRect().width),
        )
        .toBe(DESKTOP_RAIL_EXPANDED_WIDTH);
      const toggle = rail.locator("button[aria-expanded]");
      await startRailMotionRecording(rail);
      await toggle.press("Enter");
      const samples = await finishRailMotionRecording(
        rail,
        DESKTOP_RAIL_COLLAPSED_WIDTH,
      );
      await expect(toggle).toHaveAccessibleName("Expand sidebar");
      expect(samples.at(-1)?.width).toBeCloseTo(
        DESKTOP_RAIL_COLLAPSED_WIDTH,
        0,
      );
      expect(
        samples.some(
          ({ width }) =>
            width > DESKTOP_RAIL_COLLAPSED_WIDTH + WIDTH_TOLERANCE &&
            width < DESKTOP_RAIL_EXPANDED_WIDTH - WIDTH_TOLERANCE,
        ),
      ).toBe(false);
    } finally {
      await reducedContext.close();
    }

    const mobileContext = await browser.newContext({
      baseURL: BASE_URL,
      storageState,
      viewport: { width: 390, height: 844 },
    });

    try {
      const page = await mobileContext.newPage();
      await page.goto(absoluteUrl("/settings?tab=profile"), {
        waitUntil: "domcontentloaded",
      });
      await expect(getDesktopRail(page)).toBeHidden();
      await expect(page.getByRole("banner")).toBeVisible();
      await expect(page.locator("nav.dk-mobile-bottom-nav")).toBeVisible();
      await page.getByRole("button", { name: "Open menu" }).click();
      const menu = page.getByRole("dialog");
      await expect(menu).toBeVisible();
      await expect(
        menu.getByRole("navigation", { name: "More" }),
      ).toBeVisible();
      await expect(menu.getByRole("button", { name: "Log out" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    } finally {
      await mobileContext.close();
    }
  });

  test("keeps NDA guidance and mobile actions visible at 320px and 390px", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState,
      viewport: { width: 320, height: 844 },
    });

    try {
      const page = await context.newPage();
      await page.goto(absoluteUrl("/nda-templates"), {
        waitUntil: "domcontentloaded",
      });
      const newTemplate = page.getByRole("button", { name: "New Template" });
      await expect(newTemplate).toBeVisible();

      for (const width of [320, 390] as const) {
        await page.setViewportSize({ width, height: 844 });
        await newTemplate.click();
        const dialog = page.getByRole("dialog", { name: "Create Template" });
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByRole("button", { name: "Bold" }),
        ).toBeVisible();
        await expect(
          dialog.getByText(/template editor controls only the body clauses/i),
        ).toBeVisible();

        const preview = dialog.getByRole("button", { name: "Preview" });
        const cancel = dialog.getByRole("button", { name: "Cancel" });
        const create = dialog.getByRole("button", {
          name: "Create Template",
        });
        const [previewBox, cancelBox, createBox] = await Promise.all([
          preview.boundingBox(),
          cancel.boundingBox(),
          create.boundingBox(),
        ]);
        if (!previewBox || !cancelBox || !createBox) {
          throw new Error(`NDA actions were not measurable at ${width}px`);
        }

        expect(previewBox.height).toBeGreaterThanOrEqual(44);
        expect(cancelBox.height).toBeGreaterThanOrEqual(44);
        expect(createBox.height).toBeGreaterThanOrEqual(44);
        expect(Math.abs(previewBox.y - cancelBox.y)).toBeLessThanOrEqual(1);
        expect(createBox.y).toBeGreaterThanOrEqual(
          previewBox.y + previewBox.height,
        );
        expect(createBox.x).toBeLessThanOrEqual(previewBox.x + 1);
        expect(createBox.x + createBox.width).toBeGreaterThanOrEqual(
          cancelBox.x + cancelBox.width - 1,
        );

        const dialogOverflow = await dialog.evaluate(
          (element) => element.scrollWidth - element.clientWidth,
        );
        expect(dialogOverflow).toBeLessThanOrEqual(1);
        await expectNoHorizontalOverflow(page);
        await cancel.click();
        await expect(dialog).toBeHidden();
      }
    } finally {
      await context.close();
    }
  });

  test("keeps every theme keyboard-visible and overflow-safe across representative widths", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState,
      viewport: { width: 320, height: 844 },
      colorScheme: "light",
    });

    try {
      const page = await context.newPage();
      await page.goto(absoluteUrl("/settings?tab=appearance"), {
        waitUntil: "domcontentloaded",
      });
      await expect(
        page.getByRole("group", { name: "Theme selection" }),
      ).toBeVisible();

      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });

        for (const theme of THEMES) {
          const button = page.getByRole("button", {
            name: `Select ${theme} theme`,
          });
          await button.scrollIntoViewIfNeeded();
          await expectKeyboardFocusVisible(page, button);
          await page.keyboard.press("Enter");
          await expect(button).toHaveAttribute("aria-pressed", "true");

          const expectedClass =
            theme === "System" ? "light" : theme.toLowerCase();
          await expect(page.locator("html")).toHaveClass(
            new RegExp(`(^|\\s)${expectedClass}(\\s|$)`),
          );
          await expectNoHorizontalOverflow(page);
        }
      }
    } finally {
      await context.close();
    }
  });
});
