import assert from "node:assert/strict";
import test from "node:test";

import {
  canEnablePublicViewerComments,
  isDocumentConversionProcessing,
  resolveConvertedAssetFailureRecovery,
  resolveViewerAssetVariant,
} from "@/components/documents/viewerAsset";

const baseDocument = {
  fileType: "docx",
  convertedStoragePath: "workspaces/example/converted/document.pdf",
  conversionStatus: "completed",
};

test("uses a converted asset only after conversion completed", () => {
  assert.equal(resolveViewerAssetVariant(baseDocument), "converted");

  for (const conversionStatus of ["pending", "in_progress", "failed", null]) {
    assert.equal(
      resolveViewerAssetVariant({ ...baseDocument, conversionStatus }),
      "original",
    );
  }
});

test("keeps completed legacy Office conversions viewable", () => {
  for (const fileType of ["doc", "ppt", "xls"]) {
    assert.equal(
      resolveViewerAssetVariant({ ...baseDocument, fileType }),
      "converted",
    );
  }
});

test("falls back to the original when the converted path is absent", () => {
  for (const convertedStoragePath of [null, "", "   "]) {
    assert.equal(
      resolveViewerAssetVariant({
        ...baseDocument,
        convertedStoragePath,
      }),
      "original",
    );
  }
});

test("falls back to the original after a converted asset load failure", () => {
  assert.equal(
    resolveViewerAssetVariant({
      ...baseDocument,
      convertedAssetFailed: true,
    }),
    "original",
  );
});

test("watermark-required failures surface as unavailable, never the original", () => {
  // The file route fails closed on non-PDF originals under a required
  // watermark, so offering the original would render a guaranteed 503.
  assert.equal(
    resolveViewerAssetVariant({
      ...baseDocument,
      convertedAssetFailed: true,
      originalFallbackAllowed: false,
    }),
    "unavailable",
  );
  assert.equal(
    resolveViewerAssetVariant({
      ...baseDocument,
      convertedAssetFailed: true,
      originalFallbackAllowed: true,
    }),
    "original",
  );
  // Without a failure, the flag changes nothing.
  assert.equal(
    resolveViewerAssetVariant({
      ...baseDocument,
      originalFallbackAllowed: false,
    }),
    "converted",
  );
});

test("watermark-required Office assets never fall back to an unusable original", () => {
  for (const conversionStatus of ["pending", "in_progress", "failed", null]) {
    assert.equal(
      resolveViewerAssetVariant({
        ...baseDocument,
        conversionStatus,
        originalFallbackAllowed: false,
      }),
      "unavailable",
      String(conversionStatus),
    );
  }

  for (const convertedStoragePath of [null, "", "   "]) {
    assert.equal(
      resolveViewerAssetVariant({
        ...baseDocument,
        convertedStoragePath,
        originalFallbackAllowed: false,
      }),
      "unavailable",
      String(convertedStoragePath),
    );
  }
});

test("never treats non-convertible media as a converted PDF", () => {
  assert.equal(
    resolveViewerAssetVariant({ ...baseDocument, fileType: "mp4" }),
    "original",
  );
});

test("public rollout can consume an older resolve payload without status", () => {
  assert.equal(
    resolveViewerAssetVariant({
      ...baseDocument,
      conversionStatus: undefined,
      allowLegacyMissingStatus: true,
    }),
    "converted",
  );
  assert.equal(
    resolveViewerAssetVariant({
      ...baseDocument,
      conversionStatus: undefined,
    }),
    "original",
  );
});

test("public comments require a completed usable PDF asset", () => {
  assert.equal(
    canEnablePublicViewerComments({
      fileType: "pdf",
      conversionStatus: null,
    }),
    true,
  );
  assert.equal(
    canEnablePublicViewerComments({
      fileType: "docx",
      convertedStoragePath: "workspaces/example/converted/document.pdf",
      conversionStatus: "completed",
    }),
    true,
  );

  for (const conversionStatus of ["pending", "in_progress", "failed", null]) {
    assert.equal(
      canEnablePublicViewerComments({
        fileType: "docx",
        convertedStoragePath: "workspaces/example/converted/document.pdf",
        conversionStatus,
      }),
      false,
    );
  }

  assert.equal(
    canEnablePublicViewerComments({
      fileType: "docx",
      convertedStoragePath: "workspaces/example/converted/document.pdf",
      conversionStatus: "completed",
      convertedAssetFailed: true,
    }),
    false,
  );
  assert.equal(
    canEnablePublicViewerComments({
      fileType: "mp4",
      convertedStoragePath: "workspaces/example/converted/document.pdf",
      conversionStatus: "completed",
    }),
    false,
  );
});

test("reports processing only while a convertible file is queued or converting", () => {
  for (const conversionStatus of ["pending", "in_progress"]) {
    assert.equal(
      isDocumentConversionProcessing({ fileType: "docx", conversionStatus }),
      true,
    );
  }
  for (const conversionStatus of ["completed", "failed", null, undefined]) {
    assert.equal(
      isDocumentConversionProcessing({ fileType: "docx", conversionStatus }),
      false,
    );
  }
  // Non-convertible files never convert, so a stale `pending` status must not
  // read as processing.
  for (const fileType of ["pdf", "mp4", "png", null]) {
    assert.equal(
      isDocumentConversionProcessing({ fileType, conversionStatus: "pending" }),
      false,
    );
  }
});

test("converted failure recovery repairs authenticated views", () => {
  assert.equal(
    resolveConvertedAssetFailureRecovery({
      accessMode: "authenticated",
      hasRetryHandler: true,
      hasRefreshHandler: true,
    }),
    "repair",
  );
  assert.equal(
    resolveConvertedAssetFailureRecovery({
      accessMode: "public",
      hasRetryHandler: true,
      hasRefreshHandler: false,
    }),
    "none",
  );
});

test("public converted failures retry only explicit transient responses", () => {
  assert.equal(
    resolveConvertedAssetFailureRecovery({
      accessMode: "public",
      hasRetryHandler: true,
      hasRefreshHandler: true,
      failure: {
        status: 400,
        code: "invalid_input",
        retryable: false,
      },
      automaticAttempts: 0,
    }),
    "none",
  );

  for (const failure of [
    { status: 409, code: "DOCUMENT_PROCESSING", retryable: false },
    { status: 503, code: "engine_unavailable", retryable: true },
  ]) {
    assert.equal(
      resolveConvertedAssetFailureRecovery({
        accessMode: "public",
        hasRetryHandler: true,
        hasRefreshHandler: true,
        failure,
        automaticAttempts: 0,
      }),
      "refresh",
    );
  }

  assert.equal(
    resolveConvertedAssetFailureRecovery({
      accessMode: "public",
      hasRetryHandler: true,
      hasRefreshHandler: true,
      failure: {
        status: 503,
        code: "engine_unavailable",
        retryable: true,
      },
      automaticAttempts: 2,
    }),
    "none",
  );
});

test("public file diagnostics parse retry headers without exposing response prose", async () => {
  const viewerAssetModule = await import("@/components/documents/viewerAsset");
  const parser = Reflect.get(
    viewerAssetModule,
    "parsePublicFileFailureResponse",
  );
  assert.equal(typeof parser, "function");
  if (typeof parser !== "function") return;

  const response = new Response(null, {
    status: 503,
    headers: {
      "X-DocKosha-Error-Code": "engine_unavailable",
      "X-DocKosha-Retryable": "true",
      "Retry-After": "3",
    },
  });
  assert.deepEqual(parser(response), {
    status: 503,
    code: "engine_unavailable",
    retryable: true,
    retryAfterMs: 3_000,
  });
});
