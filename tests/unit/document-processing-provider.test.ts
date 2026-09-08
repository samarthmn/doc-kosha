import assert from "node:assert/strict";
import test from "node:test";

test("the provider interface owns the engine error and operation inventories", async () => {
  const providerInterface = await import("@dockosha/provider-interface");
  const engineErrors = await import("@/server/engineErrors");
  assert.deepEqual(
    engineErrors.ENGINE_ERROR_CODES,
    providerInterface.PROVIDER_ERROR_CODES,
  );
  assert.deepEqual(
    engineErrors.ENGINE_OPERATIONS,
    providerInterface.PROVIDER_OPERATIONS,
  );
});

test("the facade rejects unsupported capabilities before invoking the provider", async () => {
  const { createDocumentProcessingFacade } =
    await import("@/server/documentProcessing/provider");
  let mergeCalls = 0;
  const facade = createDocumentProcessingFacade(() => ({
    id: "limited-provider",
    capabilities: new Set(),
    mergeAndWatermark: async () => {
      mergeCalls += 1;
      return { ok: true, pdf: new ArrayBuffer(1) };
    },
    pageCount: async () => ({ ok: true, pageCount: 1 }),
  }));

  const result = await facade.mergeAndWatermark({
    pdfs: [Uint8Array.of(1)],
  });
  assert.equal(mergeCalls, 0);
  assert.deepEqual(result, {
    ok: false,
    code: "unsupported_feature",
    message:
      'Document-processing provider "limited-provider" does not support merge.',
    operation: "merge",
    format: "pdf",
    retryable: false,
  });
});

test("the production facade initializes the mandatory DocYantra provider", async () => {
  const { documentProcessingProvider } =
    await import("@/server/documentProcessing/provider");
  assert.equal(documentProcessingProvider.id, "docyantra");
  assert.equal(
    documentProcessingProvider.capabilities.has("office_conversion"),
    true,
  );
  assert.equal(documentProcessingProvider.capabilities.has("redaction"), true);
});
