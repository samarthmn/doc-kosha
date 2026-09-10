import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  insertDataRoom,
  insertDocumentFixture,
  insertLink,
  insertWatermark,
  waitForDocumentByTitle,
  type DocumentRow,
} from "./helpers/db";
import { uploadDocumentsViaModal } from "./helpers/documents";
import { verifyPublicDocumentEmail } from "./helpers/links";
import {
  createPdfMigrationFixtures,
  type PdfMigrationFixtures,
} from "./helpers/pdf-fixtures";
import { provisionCoreWorkspace } from "./helpers/provision";
import { getNewestMailpitMessageId, waitForOtpCode } from "./helpers/mailpit";
import { uniqueEmail, uniqueName } from "./helpers/random";

type Point = { x: number; y: number };

const expectPdfReady = async (page: Page): Promise<void> => {
  const ready = page.locator('[data-dk-pdf-state="ready"]');
  const retrySubscription = page.getByRole("button", { name: "Try again" });
  await expect(ready.or(retrySubscription)).toBeVisible({
    timeout: 45_000,
  });
  if (await retrySubscription.isVisible().catch(() => false)) {
    await retrySubscription.click();
  }
  await expect(ready).toBeVisible({ timeout: 45_000 });
};

const targetWordDragPoints = async (
  page: Page,
  pageIndex: number,
): Promise<{
  start: Point;
  end: Point;
}> => {
  const textLayer = page.locator(`[data-dk-text-layer="${pageIndex}"]`);
  // Scrolling the page first lets pdf.js repaint a hidden/offscreen text layer
  // after a zoom or a comment panel's initial navigation.
  await page
    .locator(`.pdfViewer [data-page-number="${pageIndex + 1}"]`)
    .scrollIntoViewIfNeeded();
  await expect(textLayer).toBeVisible({ timeout: 30_000 });
  await textLayer.scrollIntoViewIfNeeded();
  return textLayer.evaluate((layer) => {
    const target = "TARGETWORD";
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    let textNode: Node | null = walker.nextNode();
    while (textNode && !textNode.textContent?.toUpperCase().includes(target)) {
      textNode = walker.nextNode();
    }
    if (!textNode?.textContent) {
      throw new Error(`PDF text layer does not contain ${target}`);
    }

    textNode.parentElement?.scrollIntoView({
      block: "center",
      inline: "center",
    });
    const startOffset = textNode.textContent.toUpperCase().indexOf(target);
    const startRange = document.createRange();
    startRange.setStart(textNode, startOffset);
    startRange.setEnd(textNode, startOffset + 1);
    const endRange = document.createRange();
    endRange.setStart(textNode, startOffset + target.length - 1);
    endRange.setEnd(textNode, startOffset + target.length);
    const startRect = startRange.getBoundingClientRect();
    const endRect = endRange.getBoundingClientRect();
    return {
      start: {
        x: startRect.left + startRect.width / 2,
        y: startRect.top + startRect.height / 2,
      },
      end: {
        x: endRect.left + endRect.width / 2,
        y: endRect.top + endRect.height / 2,
      },
    };
  });
};

const dragTargetWord = async (page: Page, pageIndex: number): Promise<void> => {
  const points = await targetWordDragPoints(page, pageIndex);
  const dx = points.end.x - points.start.x;
  const dy = points.end.y - points.start.y;
  const magnitude = Math.hypot(dx, dy) || 1;
  const startInset = 3;
  const endInset = 3;
  const start = {
    x: points.start.x - (dx / magnitude) * startInset,
    y: points.start.y - (dy / magnitude) * startInset,
  };
  const end = {
    x: points.end.x + (dx / magnitude) * endInset,
    y: points.end.y + (dy / magnitude) * endInset,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ""))
    .toContain("TARGETWORD");
};

// Use browser Range geometry for the high-DPR regression: transformed PDF text
// can quantize drag endpoints to the adjacent glyph. Dispatching mouse release
// on the actual layer exercises the listener a detail pagerender must preserve.
const selectTargetWordRange = async (
  page: Page,
  pageIndex: number,
): Promise<void> => {
  await targetWordDragPoints(page, pageIndex);
  await page
    .locator(`[data-dk-text-layer="${pageIndex}"]`)
    .dispatchEvent("mousedown");
  await page
    .locator(`[data-dk-text-layer="${pageIndex}"]`)
    .evaluate((layer) => {
      const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const offset = node.textContent?.indexOf("TARGETWORD") ?? -1;
        if (offset < 0) continue;
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + "TARGETWORD".length);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        return;
      }
      throw new Error("Missing target text");
    });
  await page
    .locator(`[data-dk-text-layer="${pageIndex}"]`)
    .dispatchEvent("mouseup");
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("TARGETWORD");
};

const expectCommentHighlightOnTarget = async (
  page: Page,
  threadId: string,
  pageIndex: number,
): Promise<void> => {
  const highlight = page.locator(`[data-dk-comment-thread-id="${threadId}"]`);
  await expect(highlight).toBeVisible({ timeout: 30_000 });
  const points = await targetWordDragPoints(page, pageIndex);
  const box = await highlight.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const targetCenter = {
    x: (points.start.x + points.end.x) / 2,
    y: (points.start.y + points.end.y) / 2,
  };
  const glyphTolerancePx = 5;
  expect(targetCenter.x).toBeGreaterThanOrEqual(box.x - glyphTolerancePx);
  expect(targetCenter.x).toBeLessThanOrEqual(
    box.x + box.width + glyphTolerancePx,
  );
  expect(targetCenter.y).toBeGreaterThanOrEqual(box.y - glyphTolerancePx);
  expect(targetCenter.y).toBeLessThanOrEqual(
    box.y + box.height + glyphTolerancePx,
  );
};

test.describe.serial("PDF migration verification @engine", () => {
  test.setTimeout(240_000);

  let context: BrowserContext;
  let page: Page;
  let workspaceId: string;
  let largeDocument: DocumentRow;
  let outlinedDocument: DocumentRow;
  let rotatedDocument: DocumentRow;
  let rotatedLinkId: string;
  let rotatedThreadId: string;
  let roomId: string;
  let roomLinkId: string;
  let roomDocument: DocumentRow;
  let detailDocument: DocumentRow;
  let detailLinkId: string;
  let fixtures: PdfMigrationFixtures | null = null;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    fixtures = await createPdfMigrationFixtures();
    context = await browser.newContext();
    page = await context.newPage();
    const workspace = await provisionCoreWorkspace(page);
    workspaceId = workspace.workspaceId;

    await uploadDocumentsViaModal(page, [
      fixtures.large320Path,
      fixtures.outlinedPath,
      fixtures.rotatedPath,
    ]);
    [largeDocument, outlinedDocument, rotatedDocument] = await Promise.all([
      waitForDocumentByTitle({
        workspaceId,
        title: "large-320.pdf",
        dataRoomId: null,
      }),
      waitForDocumentByTitle({
        workspaceId,
        title: "outlined.pdf",
        dataRoomId: null,
      }),
      waitForDocumentByTitle({
        workspaceId,
        title: "rotated.pdf",
        dataRoomId: null,
      }),
    ]);

    const watermarkId = await insertWatermark(workspaceId, {
      text: "ROTATED VERIFY",
    });
    const rotatedLink = await insertLink({
      workspace_id: workspaceId,
      document_id: rotatedDocument.id,
      created_by: rotatedDocument.created_by,
      name: uniqueName("Rotated comments and watermark"),
      apply_watermark: true,
      watermark_id: watermarkId,
      can_download: true,
      comments_enabled: true,
      curated_qas: [],
    });
    rotatedLinkId = rotatedLink.id;
    const room = await insertDataRoom({
      workspaceId,
      userId: rotatedDocument.created_by,
      name: uniqueName("PDF detail room"),
    });
    roomId = room.id;
    await uploadDocumentsViaModal(page, [fixtures.rotatedPath], {
      destinationUrl: `/data-rooms/${roomId}/documents`,
      uploadButtonGuide: "data-room-upload-button",
    });
    roomDocument = await waitForDocumentByTitle({
      workspaceId,
      title: "rotated.pdf",
      dataRoomId: roomId,
    });
    const roomLink = await insertLink({
      workspace_id: workspaceId,
      data_room_id: roomId,
      created_by: rotatedDocument.created_by,
      comments_enabled: true,
      apply_watermark: true,
      watermark_id: watermarkId,
      name: uniqueName("PDF detail room link"),
    });
    roomLinkId = roomLink.id;
    detailDocument = await insertDocumentFixture({
      workspaceId,
      createdBy: rotatedDocument.created_by,
      title: "Detail-render PDF",
      storagePath: rotatedDocument.storage_path,
    });
    const detailLink = await insertLink({
      workspace_id: workspaceId,
      document_id: detailDocument.id,
      created_by: rotatedDocument.created_by,
      comments_enabled: true,
      apply_watermark: true,
      watermark_id: watermarkId,
      name: uniqueName("Detail-render link"),
    });
    detailLinkId = detailLink.id;
  });

  test.afterAll(async () => {
    try {
      await context?.close();
    } finally {
      await fixtures?.cleanup();
    }
  });

  test("virtualizes 320 pages and finds page 275 without a long scroll stall", async () => {
    await page.goto(`/documents/view/${largeDocument.id}`, {
      waitUntil: "domcontentloaded",
    });
    await expectPdfReady(page);

    const loadedPages = page.locator(
      '.pdfViewer [data-page-number][data-loaded="true"]',
    );
    await expect.poll(() => loadedPages.count()).toBeGreaterThan(0);
    const mountedPageCount = await loadedPages.count();
    console.info(
      `[pdf-migration] mounted-page-count-at-rest=${mountedPageCount}`,
    );
    expect(mountedPageCount).toBeLessThan(320);

    const frameLatencyMs = await page.locator(".dk-pdf-scroll").evaluate(
      (scroller) =>
        new Promise<number>((resolve) => {
          const start = performance.now();
          scroller.scrollTop = scroller.scrollHeight / 2;
          requestAnimationFrame(() => resolve(performance.now() - start));
        }),
    );
    console.info(
      `[pdf-migration] large-scroll-frame-latency-ms=${frameLatencyMs.toFixed(2)}`,
    );
    expect(frameLatencyMs).toBeLessThan(500);

    await page.getByRole("button", { name: "Search" }).click();
    await page
      .getByRole("textbox", { name: "Search document" })
      .fill("NEEDLEWORD");
    await expect(page.getByText("1/1", { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByLabel("Current page")).toHaveValue("275", {
      timeout: 60_000,
    });
    await expect(
      page.locator('.pdfViewer [data-page-number="275"][data-loaded="true"]'),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("lists a real outline, navigates it, and restores internal-link history", async () => {
    await page.goto(`/documents/view/${outlinedDocument.id}`, {
      waitUntil: "domcontentloaded",
    });
    await expectPdfReady(page);

    await page.getByRole("button", { name: "Show sidebar" }).click();
    await page.getByRole("tab", { name: "Outline" }).click();
    for (const title of [
      "Chapter One",
      "Chapter Two",
      "Chapter Three",
      "Chapter Four",
    ]) {
      await expect(page.getByRole("button", { name: title })).toBeVisible();
    }
    await page.getByRole("button", { name: "Chapter Four" }).click();
    await expect(page.getByLabel("Current page")).toHaveValue("4");

    await page.getByLabel("Current page").fill("1");
    await page.getByLabel("Current page").press("Enter");
    await expect(page.getByLabel("Current page")).toHaveValue("1");
    await expect(
      page.locator('[data-page-number="1"][data-loaded="true"]'),
    ).toBeVisible({ timeout: 30_000 });
    const internalLink = page
      .locator('[data-page-number="1"] .annotationLayer .linkAnnotation a')
      .first();
    await expect(internalLink).toBeVisible({ timeout: 30_000 });
    await internalLink.click();
    await expect(page.getByLabel("Current page")).toHaveValue("4");
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(page.getByLabel("Current page")).toHaveValue("1");
    await page.keyboard.press("Alt+ArrowRight");
    await expect(page.getByLabel("Current page")).toHaveValue("4");
  });

  test("re-measures mobile PageFit without a scale-factor console error", async ({
    browser,
  }) => {
    const mobileContext = await browser.newContext({
      storageState: await context.storageState(),
      viewport: { width: 390, height: 844 },
    });
    const scaleFactorErrors: string[] = [];
    try {
      const mobilePage = await mobileContext.newPage();
      mobilePage.on("console", (message) => {
        if (
          message.type() === "error" &&
          message.text().includes("--scale-factor")
        ) {
          scaleFactorErrors.push(message.text());
        }
      });
      await mobilePage.goto(`/documents/view/${outlinedDocument.id}`, {
        waitUntil: "domcontentloaded",
      });
      await expectPdfReady(mobilePage);
      await mobilePage.getByRole("button", { name: "Zoom level" }).click();
      await mobilePage.getByRole("menuitem", { name: "Page fit" }).click();
      await expect(
        mobilePage.locator('[data-dk-text-layer="0"]'),
      ).toBeVisible();

      const readScaleFactor = (): Promise<string> =>
        mobilePage
          .locator(".pdfViewer")
          .evaluate((viewer) =>
            getComputedStyle(viewer).getPropertyValue("--scale-factor").trim(),
          );
      const initialScaleFactor = await readScaleFactor();
      expect(initialScaleFactor).toMatch(/^\d+(?:\.\d+)?$/);

      await mobilePage.setViewportSize({ width: 320, height: 844 });
      await expect.poll(readScaleFactor).not.toBe(initialScaleFactor);
      await mobilePage.setViewportSize({ width: 390, height: 844 });
      await expect.poll(readScaleFactor).toBe(initialScaleFactor);

      console.info(
        `[pdf-migration] mobile-page-fit-scale-factor-errors=${JSON.stringify(scaleFactorErrors)}`,
      );
      expect(scaleFactorErrors).toEqual([]);
    } finally {
      await mobileContext.close();
    }
  });

  test("keeps a public comment anchored to TARGETWORD on an intrinsic 90-degree page", async ({
    browser,
  }) => {
    const publicContext = await browser.newContext();
    const viewerEmail = uniqueEmail("rotated-comment");
    try {
      await verifyPublicDocumentEmail({
        request: publicContext.request,
        linkId: rotatedLinkId,
        documentId: rotatedDocument.id,
        email: viewerEmail,
      });
      const publicPage = await publicContext.newPage();
      await publicPage.goto(`/d/${rotatedDocument.id}/${rotatedLinkId}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(publicPage).toHaveURL(
        new RegExp(`/d/${rotatedDocument.id}/${rotatedLinkId}$`),
      );
      await expectPdfReady(publicPage);
      await publicPage.getByRole("switch", { name: "Show comments" }).click();
      await publicPage.getByLabel("Current page").fill("2");
      await publicPage.getByLabel("Current page").press("Enter");
      await expect(publicPage.getByLabel("Current page")).toHaveValue("2");
      await expect(
        publicPage.locator('[data-dk-text-layer="1"]'),
      ).toContainText("ROTATED VERIFY");

      await dragTargetWord(publicPage, 1);
      await publicPage.getByRole("button", { name: "Add comment" }).click();
      await publicPage
        .getByRole("textbox", { name: "Add a comment…" })
        .fill("Rotated anchor verification");
      await publicPage
        .getByRole("button", { name: "Comment", exact: true })
        .click();

      const highlight = publicPage
        .locator("[data-dk-comment-thread-id]")
        .first();
      await expect(highlight).toBeVisible({ timeout: 30_000 });
      const threadId = await highlight.getAttribute(
        "data-dk-comment-thread-id",
      );
      expect(threadId).toBeTruthy();
      if (!threadId) throw new Error("Created comment has no thread id");
      rotatedThreadId = threadId;
      await expectCommentHighlightOnTarget(publicPage, threadId, 1);

      await publicPage.reload({ waitUntil: "domcontentloaded" });
      await expectPdfReady(publicPage);
      await publicPage.getByRole("switch", { name: "Show comments" }).click();
      await expectCommentHighlightOnTarget(publicPage, threadId, 1);
      await publicPage.getByRole("button", { name: "Zoom in" }).click();
      await expectCommentHighlightOnTarget(publicPage, threadId, 1);
    } finally {
      await publicContext.close();
    }
  });

  test("renders the same stored rotated anchor in the internal comments path", async () => {
    await page.goto(`/documents/view/${rotatedDocument.id}/comments`, {
      waitUntil: "domcontentloaded",
    });
    await expectPdfReady(page);
    await page.getByLabel("Current page").fill("2");
    await page.getByLabel("Current page").press("Enter");
    await expect(page.getByLabel("Current page")).toHaveValue("2");

    await expectCommentHighlightOnTarget(page, rotatedThreadId, 1);
    await page
      .locator(`[data-dk-comment-thread-id="${rotatedThreadId}"]`)
      .click();
    await expect(page.getByText("Rotated anchor verification")).toBeVisible();
  });

  test("preserves selection and overlays through real detail redraws in internal, /d and /r viewers", async ({
    browser,
  }) => {
    // At 200% and DPR 4, a Letter page exceeds pdf.js's 2^25 pixel
    // canvas budget. This exercises its real detail renderer without hooks.
    const detailContext = await browser.newContext({
      storageState: await context.storageState(),
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 4,
    });
    const errors: string[] = [];
    try {
      const detailPage = await detailContext.newPage();
      detailPage.on("pageerror", (error) => errors.push(error.message));
      detailPage.on("console", (message) => {
        if (
          message.type() === "error" &&
          /viewport|rotation|pagerender/i.test(message.text())
        )
          errors.push(message.text());
      });
      await verifyPublicDocumentEmail({
        request: detailContext.request,
        linkId: detailLinkId,
        documentId: detailDocument.id,
        email: uniqueEmail("detail-document"),
      });
      const email = uniqueEmail("detail-room");
      const baselineMessageId = await getNewestMailpitMessageId({
        to: email,
        subjectIncludes: "Verification Code",
      });
      const sinceMs = Date.now();
      const send = await detailContext.request.post("/api/public/links/otp", {
        data: { action: "send", linkId: roomLinkId, dataRoomId: roomId, email },
      });
      expect(send.status()).toBe(200);
      const code = await waitForOtpCode({
        to: email,
        sinceMs,
        subjectIncludes: "Verification Code",
        baselineMessageId,
      });
      const verify = await detailContext.request.post("/api/public/links/otp", {
        data: {
          action: "verify",
          linkId: roomLinkId,
          dataRoomId: roomId,
          email,
          code,
        },
      });
      expect(verify.status()).toBe(200);

      for (const { route, pageIndex } of [
        {
          route: `/documents/view/${rotatedDocument.id}/comments`,
          pageIndex: 0,
        },
        { route: `/d/${detailDocument.id}/${detailLinkId}`, pageIndex: 0 },
        {
          route: `/r/${roomId}/${roomLinkId}/${roomDocument.id}`,
          pageIndex: 1,
        },
      ]) {
        await detailPage.goto(route, { waitUntil: "domcontentloaded" });
        await expectPdfReady(detailPage);
        const comments = detailPage.getByRole("switch", {
          name: "Show comments",
        });
        if (await comments.isVisible()) await comments.check();
        await detailPage.getByLabel("Current page").fill(String(pageIndex + 1));
        await detailPage.getByLabel("Current page").press("Enter");
        await detailPage.getByRole("button", { name: "Zoom level" }).click();
        await detailPage
          .getByRole("menuitem", { name: "200%", exact: true })
          .click();
        await targetWordDragPoints(detailPage, pageIndex);
        const detailCanvas = detailPage.locator(
          `[data-page-number="${pageIndex + 1}"] .canvasWrapper canvas[aria-hidden="true"]`,
        );
        await expect(detailCanvas).toBeVisible({ timeout: 30_000 });
        await expect
          .poll(() =>
            detailCanvas.evaluate(
              (canvas) => (canvas as HTMLCanvasElement).width,
            ),
          )
          .toBeGreaterThan(0);
        // Scroll far enough to replace the visible detail crop, then return to
        // the target. Detail redraws do not emit textlayerrendered.
        const originalDetail = await detailCanvas.elementHandle();
        if (!originalDetail) throw new Error("Missing detail canvas");
        await detailPage.locator(".dk-pdf-scroll").evaluate((scroller) => {
          const maximum = scroller.scrollWidth - scroller.clientWidth;
          scroller.scrollLeft = scroller.scrollLeft < maximum / 2 ? maximum : 0;
        });
        await expect
          .poll(() => originalDetail.evaluate((canvas) => canvas.isConnected))
          .toBe(false);
        await originalDetail.dispose();
        await targetWordDragPoints(detailPage, pageIndex);
        await expect(detailCanvas).toBeVisible();
        await selectTargetWordRange(detailPage, pageIndex);
        await expect(
          detailPage.getByRole("button", { name: "Add comment" }),
        ).toBeVisible();
        const previousThreadIds = await detailPage
          .locator("[data-dk-comment-thread-id]")
          .evaluateAll((elements) =>
            elements.map((element) =>
              element.getAttribute("data-dk-comment-thread-id"),
            ),
          );
        await detailPage
          .getByRole("button", { name: "Add comment" })
          .press("Enter");
        await detailPage
          .getByRole("textbox", {
            name: route.startsWith("/documents/")
              ? "Write a comment…"
              : "Add a comment…",
          })
          .fill("Detail redraw anchor verification");
        if (route.startsWith("/r/")) {
          // Existing room-comment persistence returns LINK_NOT_FOUND because
          // the comments service requires a document link. This viewer test
          // covers the real detail redraw and retained selection/composer;
          // internal and /d cases below verify persisted anchor alignment.
          await expect(
            detailPage.locator(
              `[data-page-number="${pageIndex + 1}"] [data-dk-pdf-overlay-host="over-text:${pageIndex}"]`,
            ),
          ).toHaveAttribute("data-dk-page-rotation", "0");
          await expect(
            detailPage.locator(`[data-dk-text-layer="${pageIndex}"]`),
          ).toContainText("ROTATED VERIFY");
          continue;
        }
        await detailPage
          .getByRole("button", { name: "Comment", exact: true })
          .click();
        let threadId: string | null | undefined;
        await expect
          .poll(async () => {
            const threadIds = await detailPage
              .locator("[data-dk-comment-thread-id]")
              .evaluateAll((elements) =>
                elements.map((element) =>
                  element.getAttribute("data-dk-comment-thread-id"),
                ),
              );
            threadId = threadIds.find(
              (id) => id && !previousThreadIds.includes(id),
            );
            return threadId;
          })
          .toBeTruthy();
        if (!threadId)
          throw new Error("Detail-render comment has no thread id");
        await expectCommentHighlightOnTarget(detailPage, threadId, pageIndex);
        await expect(
          detailPage.locator(
            `[data-page-number="${pageIndex + 1}"] [data-dk-pdf-overlay-host="over-text:${pageIndex}"]`,
          ),
        ).toHaveAttribute("data-dk-page-rotation", "0");
        if (!route.startsWith("/documents/"))
          await expect(
            detailPage.locator(`[data-dk-text-layer="${pageIndex}"]`),
          ).toContainText("ROTATED VERIFY");
      }
      expect(errors).toEqual([]);
    } finally {
      await detailContext.close();
    }
  });
});
