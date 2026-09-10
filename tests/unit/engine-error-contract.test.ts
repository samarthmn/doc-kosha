import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  PROVIDER_ERROR_CODES,
  PROVIDER_OPERATIONS,
} from "@dockosha/provider-interface";
import {
  ENGINE_ERROR_CODES,
  ENGINE_OPERATIONS,
  createEngineFailure,
  engineErrorHttpStatus,
  normalizeEngineError,
  toPublicEngineErrorResponse,
  toPublicEngineFailure,
} from "@/server/engineErrors";
import {
  logEngineRuntimeFailure,
  toSafeEngineRuntimeLog,
} from "@/server/engineRuntimeDiagnostics";

const EXPECTED_CODES = [
  "invalid_input",
  "unsupported_format",
  "unsupported_feature",
  "missing_glyph",
  "missing_asset",
  "password_protected",
  "malformed_container",
  "resource_limit",
  "invalid_output",
  "internal_error",
  "deadline_exceeded",
  "queue_busy",
  "worker_boot_failed",
  "engine_unavailable",
  "trap",
  "protocol_error",
] as const;

test("engine errors expose the complete stable code inventory", () => {
  assert.deepEqual(ENGINE_ERROR_CODES, EXPECTED_CODES);
});

test("engine errors derive their inventories from the provider contract", () => {
  assert.deepEqual(ENGINE_ERROR_CODES, PROVIDER_ERROR_CODES);
  assert.deepEqual(ENGINE_OPERATIONS, PROVIDER_OPERATIONS);
});

test("only transient worker failures are retryable", () => {
  const retryable = ENGINE_ERROR_CODES.filter(
    (code) =>
      createEngineFailure({
        code,
        message: code,
        operation: "merge",
      }).retryable,
  );

  assert.deepEqual(retryable, [
    "deadline_exceeded",
    "queue_busy",
    "worker_boot_failed",
    "engine_unavailable",
    "trap",
  ]);
});

test("every engine code has an explicit HTTP status", () => {
  const expected = new Map<(typeof EXPECTED_CODES)[number], number>([
    ["invalid_input", 400],
    ["unsupported_format", 415],
    ["unsupported_feature", 422],
    ["missing_glyph", 422],
    ["missing_asset", 422],
    ["password_protected", 422],
    ["malformed_container", 422],
    ["resource_limit", 413],
    ["invalid_output", 502],
    ["internal_error", 502],
    ["deadline_exceeded", 504],
    ["queue_busy", 429],
    ["worker_boot_failed", 503],
    ["engine_unavailable", 503],
    ["trap", 502],
    ["protocol_error", 502],
  ]);

  for (const code of EXPECTED_CODES) {
    assert.equal(engineErrorHttpStatus(code), expected.get(code), code);
  }
});

test("worker errors preserve typed identity and keep engine detail internal", () => {
  const failure = normalizeEngineError(
    {
      code: "unsupported_feature",
      message: "This document uses an unsupported feature.",
      engineMessage: "unsupported:footnotes: w:footnoteReference",
    },
    {
      operation: "office_conversion",
      format: "docx",
      fallbackMessage: "Office conversion failed.",
    },
  );

  assert.deepEqual(failure, {
    code: "unsupported_feature",
    message: "This document uses an unsupported feature.",
    operation: "office_conversion",
    format: "docx",
    retryable: false,
    detail: "unsupported:footnotes: w:footnoteReference",
  });
  assert.deepEqual(toPublicEngineFailure(failure), {
    code: "unsupported_feature",
    message: "This document uses an unsupported feature.",
    operation: "office_conversion",
    format: "docx",
    retryable: false,
  });
});

test("structured worker detail retains bounded reason and context internally", () => {
  const failure = normalizeEngineError(
    {
      code: "malformed_container",
      message: "internal engine prose: /workspace/customer/acme.docx",
      detail: {
        reason: "relationship_target_invalid",
        context: {
          part: "word/document.xml",
          relationshipId: "rId7",
          nested: { offset: 42 },
        },
      },
    },
    {
      operation: "office_conversion",
      format: "docx",
      fallbackMessage: "Office conversion failed.",
    },
  );

  assert.deepEqual(failure.detail, {
    reason: "relationship_target_invalid",
    context: {
      part: "word/document.xml",
      relationshipId: "rId7",
      nested: { offset: 42 },
    },
  });
  const publicFailure = toPublicEngineFailure(failure);
  assert.equal(publicFailure.code, "malformed_container");
  assert.equal(publicFailure.message, "This document could not be processed.");
  assert.equal("detail" in publicFailure, false);
  assert.doesNotMatch(
    JSON.stringify(publicFailure),
    /acme|relationship|word\//,
  );
});

test("public retryability is derived from code, not a supplied flag", () => {
  const failure = createEngineFailure({
    code: "invalid_input",
    message: "internal engine prose",
    operation: "merge",
    format: "pdf",
  });

  assert.equal(
    toPublicEngineFailure({ ...failure, retryable: true }).retryable,
    false,
  );
});

test("public engine responses expose machine-readable failure headers", () => {
  const failure = createEngineFailure({
    code: "invalid_input",
    message: "internal engine prose",
    operation: "watermark",
    format: "pdf",
  });

  assert.deepEqual(toPublicEngineErrorResponse(failure).headers, {
    "X-DocKosha-Error-Code": "invalid_input",
    "X-DocKosha-Retryable": "false",
  });

  const retryable = createEngineFailure({
    code: "engine_unavailable",
    message: "internal engine prose",
    operation: "watermark",
    format: "pdf",
  });
  assert.equal(
    toPublicEngineErrorResponse(retryable).headers["X-DocKosha-Retryable"],
    "true",
  );
});

test("runtime diagnostics retain only approved machine fields", () => {
  const failure = createEngineFailure({
    code: "worker_boot_failed",
    message: "secret watermark text and private path",
    operation: "watermark",
    format: "pdf",
    detail: {
      reason: "worker_asset_missing",
      context: { email: "viewer@example.com", path: "/private/file.pdf" },
    },
  });
  assert.deepEqual(
    toSafeEngineRuntimeLog({
      requestId: "request-id",
      providerId: "configured-provider",
      adapterVersion: "0.0.25",
      engineVersion: "0.0.25",
      buildFingerprint: "docyantra-0.0.25",
      failure,
    }),
    {
      requestId: "request-id",
      providerId: "configured-provider",
      adapterVersion: "0.0.25",
      engineVersion: "0.0.25",
      buildFingerprint: "docyantra-0.0.25",
      operation: "watermark",
      reasonCode: "worker_asset_missing",
    },
  );
});

test("runtime diagnostics report the fixed DocYantra release safely", () => {
  const previousConsoleError = console.error;
  const calls: unknown[][] = [];
  console.error = (...args: unknown[]): void => {
    calls.push(args);
  };

  try {
    logEngineRuntimeFailure({
      requestId: "runtime-probe",
      failure: createEngineFailure({
        code: "worker_boot_failed",
        message: "Worker failed to boot.",
        operation: "watermark",
      }),
    });
  } finally {
    console.error = previousConsoleError;
  }

  assert.equal(calls.length, 1);
  const metadata = calls[0]?.[1];
  assert.equal(typeof metadata, "object");
  assert.deepEqual(
    metadata && typeof metadata === "object"
      ? {
          providerId: Reflect.get(metadata, "providerId"),
          adapterVersion: Reflect.get(metadata, "adapterVersion"),
          engineVersion: Reflect.get(metadata, "engineVersion"),
        }
      : null,
    {
      providerId: "docyantra",
      adapterVersion: "0.0.26",
      engineVersion: "0.0.26",
    },
  );
  assert.match(
    metadata && typeof metadata === "object"
      ? Reflect.get(metadata, "buildFingerprint")
      : null,
    /^[a-f0-9]{64}$/u,
  );
});

test("structured engine detail is bounded before telemetry can retain it", () => {
  const failure = normalizeEngineError(
    {
      code: "internal_error",
      message: "engine failure",
      detail: {
        reason: "x".repeat(3_000),
        context: { items: Array.from({ length: 40 }, (_, index) => index) },
      },
    },
    {
      operation: "office_conversion",
      format: "xlsx",
      fallbackMessage: "Office conversion failed.",
    },
  );

  assert.ok(failure.detail && typeof failure.detail === "object");
  assert.equal(failure.detail.reason?.length, 2_048);
  const context = failure.detail.context;
  assert.ok(context && typeof context === "object" && !Array.isArray(context));
  assert.ok(Array.isArray(context.items));
  assert.equal(context.items.length, 32);
});

test("unknown thrown values fail closed as internal_error without exposing detail", () => {
  const failure = normalizeEngineError(new Error("secret parser detail"), {
    operation: "redaction",
    format: "pdf",
    fallbackMessage: "The redaction engine failed.",
  });

  assert.equal(failure.code, "internal_error");
  assert.equal(failure.message, "The redaction engine failed.");
  assert.equal(failure.detail, "secret parser detail");
  assert.equal("detail" in toPublicEngineFailure(failure), false);
});

test("telemetry dimensions use stable typed fields and never reason prose", async () => {
  const { engineTelemetryDimensions } = await import("@/lib/engineTelemetry");
  const failure = createEngineFailure({
    code: "queue_busy",
    message: "The document engine is busy.",
    operation: "office_conversion",
    format: "pptx",
    detail: "queue length 32",
  });

  assert.deepEqual(engineTelemetryDimensions(failure), {
    engineErrorCode: "queue_busy",
    engineOperation: "office_conversion",
    engineFormat: "pptx",
    engineRetryable: "true",
  });
});

const source = (relativePath: string): string =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

test("audited error identity sites no longer classify prose", () => {
  const auditedFiles = [
    "src/server/conversionService.ts",
    "src/server/redactionService.ts",
    "src/server/documentProcessing/providerRegistry.ts",
    "src/server/documentProcessing/provider.ts",
    "src/server/initialFetch.ts",
    "src/app/api/documents/redaction/route.ts",
    "src/app/api/settings/public-links/route.ts",
    "src/app/api/settings/document-versioning/route.ts",
    "src/app/api/documents/versioning/conflicts/route.ts",
    "src/app/api/documents/versioning/history/route.ts",
    "src/app/api/documents/versioning/replace/route.ts",
    "src/app/api/documents/versioning/restore/route.ts",
    "src/modules/custom-domains/server/routes/createDomain.ts",
    "src/app/api/billing/checkout/route.ts",
    "src/app/api/public/links/resolve/route.ts",
  ];
  const combined = auditedFiles.map(source).join("\n");

  assert.doesNotMatch(combined, /\.message\.startsWith\(/);
  assert.doesNotMatch(combined, /\.message\.includes\(/);
  assert.doesNotMatch(combined, /\.test\(error\.message\)/);
  assert.doesNotMatch(combined, /error\.message\s*===\s*["']UNAUTHORIZED["']/);
  assert.doesNotMatch(combined, /Auth session missing!/);
  assert.doesNotMatch(combined, /createOfficeEngineWorker\.toString\(\)/);
  assert.doesNotMatch(combined, /combined\.includes\(/);
});

test("serving-path watermark processing has no pdf-lib parser", () => {
  const watermarkService = source("src/server/watermarkService.ts");
  assert.doesNotMatch(watermarkService, /from ["']pdf-lib["']/);
  assert.doesNotMatch(watermarkService, /PDFDocument\.load/);
  assert.match(watermarkService, /@\/server\/documentProcessing\/provider/);
  assert.doesNotMatch(watermarkService, /providerRegistry/);
});
