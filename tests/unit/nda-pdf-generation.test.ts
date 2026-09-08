import assert from "node:assert/strict";
import test from "node:test";

import { generateSignedNdaPdf } from "@/modules/nda/server/pdf";
import { PDFDocument } from "pdf-lib";

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("signed NDA generation parses the supported rich HTML contract", async () => {
  const bytes = await generateSignedNdaPdf({
    workspaceName: "Acme",
    documentTitle: "Proposal.pdf",
    receivingPartyName: "Viewer",
    receivingPartyEmail: "viewer@example.com",
    effectiveDate: "2026-07-10T00:00:00.000Z",
    signedDateTime: "2026-07-10T12:00:00.000Z",
    signatureDataUrl: ONE_PIXEL_PNG,
    bodyHtml:
      "<h2>Terms &amp; scope</h2><p><strong>Keep</strong> this <em>private</em>.<br />No redistribution.</p><ol><li>First</li><li><u>Second</u></li></ol>",
  });

  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  const document = await PDFDocument.load(bytes);
  assert.ok(document.getPageCount() >= 1);
});

test("signed NDA generation rejects an empty template body", async () => {
  await assert.rejects(
    generateSignedNdaPdf({
      workspaceName: "Acme",
      documentTitle: "Proposal.pdf",
      receivingPartyName: "Viewer",
      receivingPartyEmail: "viewer@example.com",
      effectiveDate: "2026-07-10T00:00:00.000Z",
      signedDateTime: "2026-07-10T12:00:00.000Z",
      signatureDataUrl: ONE_PIXEL_PNG,
      bodyHtml: "   ",
    }),
    /template body is required/i,
  );
});
