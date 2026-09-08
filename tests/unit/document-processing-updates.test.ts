import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCoreCompletionUpdate,
  buildCoreFailureUpdateWithReason,
  buildCoreClaimUpdate,
  buildProcessingTelemetryUpdate,
} from "@/server/documentProcessingUpdates";

test("core lifecycle updates never depend on optional engine telemetry columns", () => {
  const claimed = buildCoreClaimUpdate("claim-id", "2026-07-10T00:00:00.000Z");
  const completed = buildCoreCompletionUpdate(
    "converted/workspace/document.pdf",
    "2026-07-10T00:00:00.000Z",
  );
  const failed = buildCoreFailureUpdateWithReason(
    "unsupported_feature",
    "2026-07-10T00:00:00.000Z",
  );

  assert.deepEqual(completed, {
    converted_storage_path: "converted/workspace/document.pdf",
    conversion_status: "completed",
    conversion_claim_id: null,
    updated_at: "2026-07-10T00:00:00.000Z",
  });
  assert.deepEqual(failed, {
    conversion_status: "failed",
    conversion_claim_id: null,
    conversion_fallback_reason: "unsupported_feature",
    updated_at: "2026-07-10T00:00:00.000Z",
  });
  assert.deepEqual(claimed, {
    conversion_status: "in_progress",
    conversion_claim_id: "claim-id",
    updated_at: "2026-07-10T00:00:00.000Z",
  });
  assert.equal("converted_storage_path" in claimed, false);
  assert.equal("conversion_engine" in completed, false);
  assert.equal("conversion_engine" in failed, false);
});

test("engine telemetry is isolated in a best-effort update payload", () => {
  assert.deepEqual(
    buildProcessingTelemetryUpdate({
      engine: "office-core-wasm",
      failureCode: "unsupported_feature",
      durationMs: 42,
    }),
    {
      conversion_engine: "office-core-wasm",
      conversion_fallback_reason: "unsupported_feature",
      conversion_duration_ms: 42,
    },
  );
});
