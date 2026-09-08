import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  countWorkspaceDocuments,
  waitForDocumentByTitle,
  waitForPreviousVersion,
} from "./helpers/db";
import { uploadDocumentsViaModal } from "./helpers/documents";
import { createRotatedRedactionFixture } from "./helpers/pdf-fixtures";
import { provisionCoreWorkspace } from "./helpers/provision";

const selectTargetText = async (page: Page): Promise<void> => {
  const layer = page.locator('[data-dk-text-layer="0"]');
  await expect(layer).toContainText("TARGETWORD", { timeout: 45_000 });
  const points = await layer.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const offset = node.textContent?.indexOf("TARGETWORD") ?? -1;
      if (offset < 0) continue;
      node.parentElement?.scrollIntoView({ block: "center", inline: "center" });
      const range = document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, offset + "TARGETWORD".length);
      const rect = range.getBoundingClientRect();
      return {
        x: rect.left + 1,
        y: rect.top + rect.height / 2,
        endX: rect.right - 1,
      };
    }
    throw new Error("Missing synthetic selection target");
  });
  await page.mouse.move(points.x, points.y);
  await page.mouse.down();
  await page.mouse.move(points.endX, points.y, { steps: 12 });
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Add redaction", exact: true })
    .click();
  await expect(page.getByTestId("redaction-selection")).toHaveCount(1);
};

for (const mode of ["replace", "new"] as const) {
  test(`over-redaction warning gates ${mode} persistence and preserves selections on Cancel and Escape @core`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const fixture = await createRotatedRedactionFixture();
    try {
      const { workspaceId } = await provisionCoreWorkspace(page);
      await uploadDocumentsViaModal(page, [fixture.rotatedPath]);
      const original = await waitForDocumentByTitle({
        workspaceId,
        title: "rotated.pdf",
        dataRoomId: null,
      });
      const initialCount = await countWorkspaceDocuments(workspaceId);
      await page.goto(`/documents/redaction/${original.id}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator('[data-dk-pdf-state="ready"]')).toBeVisible({
        timeout: 45_000,
      });
      await selectTargetText(page);
      const selectionText = await page
        .getByTestId("redaction-selection")
        .innerText();

      // Only the provider response is controlled: uploads and document writes
      // use the normal local backend. Distinct valid PDFs identify which
      // generated result the confirmation actually persists.
      const generated: Buffer[] = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const pdf = await PDFDocument.create();
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        pdf
          .addPage([612, 792])
          .drawText(`Synthetic redacted result ${attempt + 1}`, {
            x: 60,
            y: 700,
            font,
            size: 18,
          });
        generated.push(Buffer.from(await pdf.save()));
      }
      let generations = 0;
      let uploadPreparations = 0;
      let replacements = 0;
      let insertions = 0;
      const uploadedBytes: Buffer[] = [];
      page.on("request", (request) => {
        const pathname = new URL(request.url()).pathname;
        if (
          request.method() === "POST" &&
          pathname === "/api/storage/upload-url"
        )
          uploadPreparations += 1;
        if (
          request.method() === "POST" &&
          pathname === "/api/documents/versioning/replace"
        )
          replacements += 1;
        if (request.method() === "POST" && pathname === "/rest/v1/documents")
          insertions += 1;
        if (
          request.method() === "PUT" &&
          request.headers()["content-type"] === "application/pdf"
        ) {
          const bytes = request.postDataBuffer();
          if (bytes) uploadedBytes.push(bytes);
        }
      });
      await page.route("**/api/documents/redaction", async (route) => {
        const body = route.request().postDataJSON();
        expect(body.documentId).toBe(original.id);
        expect(body.redactions).toHaveLength(1);
        generations += 1;
        expect(generations).toBeLessThanOrEqual(3);
        await route.fulfill({
          status: 200,
          contentType: "application/pdf",
          headers: {
            "X-DocKosha-Redaction-Warnings": "over_redaction",
            "x-redaction-page-count": "1",
          },
          body: generated[generations - 1],
        });
      });
      const beginSave = async (): Promise<void> => {
        await page
          .getByRole("button", { name: "Apply redaction", exact: true })
          .click();
        await page
          .getByRole("menuitem", {
            name:
              mode === "replace"
                ? "Replace current document"
                : "Save as new document",
            exact: true,
          })
          .click();
        if (mode === "new") {
          const naming = page.getByRole("dialog", {
            name: "Name redacted document",
          });
          await naming
            .getByLabel("Document name")
            .fill("Confirmed redaction.pdf");
          await naming
            .getByRole("button", { name: "Done", exact: true })
            .click();
        }
        await expect(
          page.getByRole("dialog", { name: "Review redaction result" }),
        ).toBeVisible();
      };
      const warning = page.getByRole("dialog", {
        name: "Review redaction result",
      });
      const assertNoWrites = (): void => {
        expect(uploadPreparations).toBe(0);
        expect(uploadedBytes).toHaveLength(0);
        expect(replacements).toBe(0);
        expect(insertions).toBe(0);
      };
      for (const dismissal of ["cancel", "escape"] as const) {
        await beginSave();
        await expect(
          warning.getByRole("button", { name: "Cancel", exact: true }),
        ).toBeFocused();
        assertNoWrites();
        if (dismissal === "cancel")
          await warning
            .getByRole("button", { name: "Cancel", exact: true })
            .click();
        else await page.keyboard.press("Escape");
        await expect(warning).toBeHidden();
        await expect(page.getByTestId("redaction-selection")).toHaveText(
          selectionText,
          { useInnerText: true },
        );
        await expect(
          page.getByRole("button", { name: "Apply redaction", exact: true }),
        ).toBeEnabled();
        assertNoWrites();
      }
      expect(generations).toBe(2);
      await beginSave();
      assertNoWrites();
      await warning
        .getByRole("button", { name: "Confirm", exact: true })
        .click();
      await expect(page).toHaveURL(/\/documents\/view\/[a-f0-9-]+$/, {
        timeout: 45_000,
      });
      const saved = await waitForDocumentByTitle({
        workspaceId,
        title: mode === "replace" ? original.title : "Confirmed redaction.pdf",
        dataRoomId: null,
      });
      expect(saved.num_pages).toBe(1);
      expect(saved.storage_path).not.toBe(original.storage_path);
      expect(saved.size_bytes).toBe(generated[2].length);
      expect(await countWorkspaceDocuments(workspaceId)).toBe(
        initialCount + (mode === "new" ? 1 : 0),
      );
      if (mode === "replace") {
        expect(saved.id).toBe(original.id);
        await waitForPreviousVersion(original.id);
      } else expect(saved.id).not.toBe(original.id);
      expect(generations).toBe(3);
      expect(uploadPreparations).toBe(1);
      expect(uploadedBytes).toHaveLength(1);
      expect(uploadedBytes[0].equals(generated[2])).toBe(true);
      expect(replacements).toBe(mode === "replace" ? 1 : 0);
      expect(insertions).toBe(mode === "new" ? 1 : 0);
    } finally {
      await fixture.cleanup();
    }
  });
}
