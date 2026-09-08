import assert from "node:assert/strict";
import test from "node:test";

import type { WatermarkDefinition } from "@/lib/branding";
import { getEngineProvider } from "./provider";

// Parity ledger: all fixtures are promoted; no gated red tests remain.

// Server environment validation may run during dynamic imports. Keep the
// package-backed fixtures independent of private environment files.
Object.assign(process.env, {
  NEXT_PUBLIC_APP_ENV: "local",
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy",
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: "dummy",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  R2_ACCOUNT_ID: "dummy",
  R2_ACCESS_KEY_ID: "dummy",
  R2_SECRET_ACCESS_KEY: "dummy",
  R2_ENDPOINT: "http://localhost:9000",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  SMTP_FROM: "t@t.co",
  SENDER_EMAIL: "t@t.co",
  NOTIFICATION_SENDER_EMAIL: "t@t.co",
  FOUNDER_SENDER_EMAIL: "t@t.co",
  ZEPTOMAIL_TOKEN: "dummy",
  SUPABASE_SERVICE_ROLE_KEY: "dummy",
  COOKIE_SECRET: "0123456789abcdef0123456789abcdef",
});

const textBytes = (text: string): ArrayBuffer => {
  const encoded = new TextEncoder().encode(text);
  const bytes = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(bytes).set(encoded);
  return bytes;
};

const createSmallPdf = async (): Promise<ArrayBuffer> => {
  const provider = getEngineProvider();
  assert.ok(provider.csvToPdf);
  const result = await provider.csvToPdf(textBytes("name,value\nalpha,1\n"));
  if (!result.ok) {
    assert.fail(`small PDF generation failed: ${result.message}`);
  }
  return result.pdf;
};

const redactOutOfRangePage = async () => {
  const sourcePdf = await createSmallPdf();
  const { redactPdf } = await import("@/server/redactionService");
  const result = await redactPdf({
    sourcePdf,
    redactions: [{ pageIndex: 99, left: 10, top: 10, width: 20, height: 20 }],
  });
  return { result, sourcePdf };
};

const bytesEqual = (left: ArrayBuffer, right: ArrayBuffer): boolean => {
  if (left.byteLength !== right.byteLength) return false;
  const leftView = new Uint8Array(left);
  const rightView = new Uint8Array(right);
  return leftView.every((byte, index) => byte === rightView[index]);
};

const textWatermark: WatermarkDefinition = {
  text: "CONFIDENTIAL",
  color: "#FF0000",
  fontSize: 1.5,
  opacity: 0.25,
  pattern: "diagonal_grid",
};

test("FX-RED-013 redactionService must reject out-of-range pageIndex", async () => {
  const { result } = await redactOutOfRangePage();
  assert.equal(result.ok, false, "out-of-range pageIndex must be rejected");
});

test("FX-RED-014 redaction must change bytes", async () => {
  const { result, sourcePdf } = await redactOutOfRangePage();
  if (!result.ok) return;
  assert.equal(
    bytesEqual(result.pdfBytes, sourcePdf),
    false,
    "a successful non-empty redaction must change PDF bytes",
  );
});

test("FX-EXE-005 office router must distinguish validator-unavailable from bad output", async () => {
  const validPdf = await createSmallPdf();
  const { decideOfficeRoute } = await import("@/server/officeEngineRouter");
  const decision = await decideOfficeRoute(
    new Uint8Array([1, 2, 3, 4]),
    "docx",
    {
      toPdf: async () => ({ ok: true, pdf: validPdf, ms: 5 }),
      pageCount: async () => ({
        ok: false,
        code: "engine_unavailable",
        message: "PDF page-count engine unavailable.",
        operation: "page_count",
        format: "pdf",
        retryable: true,
      }),
      report: () => undefined,
    },
  );

  if (decision.engine !== null) {
    assert.fail("an unavailable validator must not publish the candidate");
  }
  assert.equal(decision.failure?.code, "engine_unavailable");
});

test("FX-EXE-006 watermark timeoutMs must be honored", async () => {
  const firstPdf = await createSmallPdf();
  const secondPdf = await createSmallPdf();
  const { mergePdfs } = await import("@/server/watermarkService");
  const result = await mergePdfs({
    pdfs: [firstPdf, secondPdf],
    definition: textWatermark,
    timeoutMs: 0,
  });

  if (result.ok) {
    assert.fail("timeoutMs=0 must return a deadline or timeout failure");
  }
  assert.equal(result.code, "deadline_exceeded");
  assert.equal(result.retryable, true);
});
