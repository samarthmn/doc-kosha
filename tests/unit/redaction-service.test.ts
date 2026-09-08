import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { PDF_PROCESSING_MAX_INPUT_BYTES } from "@/lib/constants";
import type { RedactionServiceDependencies } from "@/server/redactionService";
import { createEngineFailure, toFailureResult } from "@/server/engineErrors";

Object.assign(process.env, {
  NEXT_PUBLIC_APP_ENV: "local",
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy",
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: "dummy",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  R2_ACCESS_KEY_ID: "dummy",
  R2_SECRET_ACCESS_KEY: "dummy",
  R2_ENDPOINT: "http://localhost:9000",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  SENDER_EMAIL: "t@t.co",
  NOTIFICATION_SENDER_EMAIL: "t@t.co",
  FOUNDER_SENDER_EMAIL: "t@t.co",
  SUPABASE_SERVICE_ROLE_KEY: "dummy",
  COOKIE_SECRET: "0123456789abcdef0123456789abcdef",
});

const loadRedactionService = async () =>
  await import("@/server/redactionService");

const sourceBytes = Uint8Array.of(1, 2, 3, 4);

const successfulDependencies = (
  pageCount: number,
): RedactionServiceDependencies => ({
  pageCount: async () => ({ ok: true, pageCount }),
  redact: async () => ({
    ok: true,
    pdf: new ArrayBuffer(8),
    pageCount,
    warnings: [],
  }),
});

test("accepts the last zero-based redaction page", async () => {
  const { redactPdf } = await loadRedactionService();
  let redactCalls = 0;
  const output = new ArrayBuffer(8);
  const dependencies: RedactionServiceDependencies = {
    pageCount: async () => ({ ok: true, pageCount: 3 }),
    redact: async () => {
      redactCalls += 1;
      return { ok: true, pdf: output, pageCount: 3, warnings: [] };
    },
  };

  const result = await redactPdf(
    {
      sourcePdf: sourceBytes,
      redactions: [{ pageIndex: 2, left: 10, top: 10, width: 20, height: 20 }],
    },
    dependencies,
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.pdfBytes, output);
  assert.equal(result.pageCount, 3);
  assert.equal(redactCalls, 1);
});

test("rejects a redaction page equal to the document page count", async () => {
  const { redactPdf } = await loadRedactionService();
  let redactCalls = 0;
  const dependencies = successfulDependencies(3);
  dependencies.redact = async () => {
    redactCalls += 1;
    return {
      ok: true,
      pdf: new ArrayBuffer(8),
      pageCount: 3,
      warnings: [],
    };
  };

  const result = await redactPdf(
    {
      sourcePdf: sourceBytes,
      redactions: [{ pageIndex: 3, left: 10, top: 10, width: 20, height: 20 }],
    },
    dependencies,
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "invalid_input");
    assert.equal(result.status, 400);
    assert.equal(
      result.message,
      "Redaction page 3 is out of range: this document has 3 page(s).",
    );
  }
  assert.equal(redactCalls, 0);
});

test("returns 503 when the page-count engine is unavailable", async () => {
  const { redactPdf } = await loadRedactionService();
  let redactCalls = 0;
  const result = await redactPdf(
    {
      sourcePdf: sourceBytes,
      redactions: [{ pageIndex: 0, left: 10, top: 10, width: 20, height: 20 }],
    },
    {
      pageCount: async () =>
        toFailureResult(
          createEngineFailure({
            code: "engine_unavailable",
            message: "PDF engine unavailable.",
            operation: "page_count",
            format: "pdf",
          }),
        ),
      redact: async () => {
        redactCalls += 1;
        return {
          ok: true,
          pdf: new ArrayBuffer(8),
          pageCount: 1,
          warnings: [],
        };
      },
    },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "engine_unavailable");
    assert.equal(result.status, 503);
    assert.equal(
      result.message,
      "The redaction engine is temporarily unavailable. Please try again.",
    );
  }
  assert.equal(redactCalls, 0);
});

test("rejects an empty redaction request before calling the engine", async () => {
  const { redactPdf } = await loadRedactionService();
  let pageCountCalls = 0;
  let redactCalls = 0;
  const result = await redactPdf(
    { sourcePdf: sourceBytes, redactions: [] },
    {
      pageCount: async () => {
        pageCountCalls += 1;
        return { ok: true, pageCount: 1 };
      },
      redact: async () => {
        redactCalls += 1;
        return {
          ok: true,
          pdf: new ArrayBuffer(8),
          pageCount: 1,
          warnings: [],
        };
      },
    },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "invalid_input");
    assert.equal(result.status, 400);
    assert.equal(result.message, "At least one redaction is required.");
  }
  assert.equal(pageCountCalls, 0);
  assert.equal(redactCalls, 0);
});

test("maps invalid redaction engine input to 400", async () => {
  const { redactPdf } = await loadRedactionService();
  const result = await redactPdf(
    {
      sourcePdf: sourceBytes,
      redactions: [{ pageIndex: 0, left: 10, top: 10, width: 20, height: 20 }],
    },
    {
      ...successfulDependencies(1),
      redact: async () =>
        toFailureResult(
          createEngineFailure({
            code: "invalid_input",
            message: "The redaction area is malformed.",
            operation: "redaction",
            format: "pdf",
          }),
        ),
    },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "invalid_input");
    assert.equal(result.status, 400);
    assert.equal(result.message, "The redaction area is malformed.");
  }
});

test("maps an over-limit redaction source to 413", async () => {
  const { redactPdf } = await loadRedactionService();
  const result = await redactPdf({
    sourcePdf: new Uint8Array(PDF_PROCESSING_MAX_INPUT_BYTES + 1),
    redactions: [{ pageIndex: 0, left: 10, top: 10, width: 20, height: 20 }],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "resource_limit");
    assert.equal(result.status, 413);
    assert.equal(result.message, "This PDF is too large to redact.");
  }
});

test("page count and redaction consume one aggregate deadline", async () => {
  const { redactPdf } = await loadRedactionService();
  let now = 1_000;
  const observedTimeouts: number[] = [];

  const result = await redactPdf(
    {
      sourcePdf: sourceBytes,
      redactions: [{ pageIndex: 0, left: 10, top: 10, width: 20, height: 20 }],
      deadlineAt: 2_000,
    },
    {
      now: () => now,
      pageCount: async (_bytes, timeoutMs) => {
        observedTimeouts.push(timeoutMs ?? -1);
        now = 1_400;
        return { ok: true, pageCount: 1 };
      },
      redact: async (_bytes, _areas, timeoutMs) => {
        observedTimeouts.push(timeoutMs ?? -1);
        return {
          ok: true,
          pdf: new ArrayBuffer(8),
          pageCount: 1,
          warnings: [],
        };
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(observedTimeouts, [1_000, 600]);
});

test("structured redaction warnings expose only stable allowlisted codes and warning kinds", async () => {
  const { redactPdf } = await loadRedactionService();
  const reports: Array<{
    count: number;
    codes: string[];
    otherCount: number;
    kindCounts: Record<string, number>;
  }> = [];

  const result = await redactPdf(
    {
      sourcePdf: sourceBytes,
      redactions: [{ pageIndex: 0, left: 10, top: 10, width: 20, height: 20 }],
    },
    {
      now: () => 1_000,
      pageCount: async () => ({ ok: true, pageCount: 2 }),
      redact: async () => ({
        ok: true,
        pdf: new ArrayBuffer(8),
        pageCount: 2,
        warnings: [
          {
            code: "over_redaction",
            page: 1,
            kind: "text",
            message: "document-derived prose must not escape",
          },
          { code: "future_warning", page: 2, kind: "vector_path" },
          "legacy warning prose",
          { code: "over_redaction", page: 1, kind: "private-unknown-shape" },
          { code: "over_redaction", page: 1, kind: "image_xobject" },
        ],
      }),
      reportWarning: (report) => reports.push(report),
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.warningCodes, ["over_redaction"]);
  assert.deepEqual(reports, [
    {
      count: 5,
      kindCounts: { text: 1, unknown: 3, image_xobject: 1 },
      codes: ["over_redaction", "other"],
      otherCount: 2,
    },
  ]);
});

test("redaction warning header is unique, enum-validated, and bounded", async () => {
  const { buildRedactionWarningsHeader } = await loadRedactionService();
  const header = buildRedactionWarningsHeader([
    "over_redaction",
    "unknown",
    "over_redaction",
  ]);

  assert.equal(header, "over_redaction");
  assert.ok((header?.length ?? 0) <= 256);
  assert.equal(buildRedactionWarningsHeader(["unknown"]), null);
  assert.equal(
    buildRedactionWarningsHeader(
      Array.from({ length: 1_025 }, () => "over_redaction"),
    ),
    null,
  );
});

test("the redaction route and studio use the product-owned page-count header", () => {
  const routeSource = readFileSync(
    path.join(
      process.cwd(),
      "src",
      "app",
      "api",
      "documents",
      "redaction",
      "route.ts",
    ),
    "utf8",
  );
  const studioSource = readFileSync(
    path.join(
      process.cwd(),
      "src",
      "components",
      "documents",
      "redaction",
      "DocumentRedactionStudio.tsx",
    ),
    "utf8",
  );
  const serviceSource = readFileSync(
    path.join(process.cwd(), "src", "server", "redactionService.ts"),
    "utf8",
  );

  assert.match(routeSource, /X-Redaction-Page-Count/);
  assert.match(routeSource, /REDACTION_WARNINGS_HEADER/);
  assert.match(serviceSource, /X-DocKosha-Redaction-Warnings/);
  assert.match(studioSource, /x-redaction-page-count/);
});

test("the redaction route bounds source reads and maps oversized PDFs to 413", () => {
  const routeSource = readFileSync(
    path.join(
      process.cwd(),
      "src",
      "app",
      "api",
      "documents",
      "redaction",
      "route.ts",
    ),
    "utf8",
  );

  assert.doesNotMatch(routeSource, /\bdownloadToBuffer\(/);
  assert.match(routeSource, /downloadToBufferBounded/);
  assert.match(routeSource, /PDF_PROCESSING_MAX_INPUT_BYTES/);
  assert.match(routeSource, /maxBytes:\s*PDF_PROCESSING_MAX_INPUT_BYTES/);
  for (const field of ["left", "top", "width", "height"]) {
    assert.match(
      routeSource,
      new RegExp(`${field}: z\\.number\\(\\)\\.finite\\(\\)`),
    );
  }
  assert.match(
    routeSource,
    /source\.status\s*===\s*413[\s\S]*This PDF is too large to redact\.[\s\S]*status:\s*413/,
  );
});

test("redaction defaults route through the provider facade", () => {
  const serviceSource = readFileSync(
    path.join(process.cwd(), "src/server/redactionService.ts"),
    "utf8",
  );

  assert.match(serviceSource, /@\/server\/documentProcessing\/provider/);
  assert.doesNotMatch(serviceSource, /@\/server\/pdfCoreWasm/);
});
