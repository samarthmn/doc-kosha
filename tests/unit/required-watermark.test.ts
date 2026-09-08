import assert from "node:assert/strict";
import test from "node:test";

import {
  createEngineFailure,
  toFailureResult,
  toPublicEngineErrorResponse,
} from "@/server/engineErrors";
import { applyRequiredWatermark } from "@/server/requiredWatermark";

test("returns transformed bytes only after watermarking succeeds", async () => {
  const result = await applyRequiredWatermark({
    definition: { text: "Confidential" },
    apply: async () => ({ ok: true, value: Buffer.from("watermarked") }),
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.toString(), "watermarked");
  }
});

test("fails closed when a required watermark has no definition", async () => {
  let called = false;
  const result = await applyRequiredWatermark({
    definition: null,
    apply: async () => {
      called = true;
      return { ok: true, value: Buffer.from("unwatermarked") };
    },
  });

  assert.equal(called, false);
  assert.deepEqual(result, {
    ok: false,
    code: "missing_asset",
    message: "Required watermark is not configured.",
    operation: "watermark",
    format: "pdf",
    retryable: false,
  });
});

test("fails closed and preserves a typed watermark failure", async () => {
  const failure = toFailureResult(
    createEngineFailure({
      code: "queue_busy",
      message: "private queue detail",
      operation: "watermark",
      format: "pdf",
      detail: {
        reason: "admission_capacity",
        context: { active: 4, queued: 16 },
      },
    }),
  );
  const result = await applyRequiredWatermark({
    definition: { text: "Confidential" },
    apply: async () => failure,
  });

  assert.deepEqual(result, failure);
  assert.equal("value" in result, false);
});

test("required-watermark route failures expose code without raw bytes or detail", async () => {
  const rawBytes = Buffer.from("unwatermarked-secret-bytes");
  const result = await applyRequiredWatermark({
    definition: { text: "Confidential" },
    apply: async () =>
      toFailureResult(
        createEngineFailure({
          code: "queue_busy",
          message: "private queue prose",
          operation: "watermark",
          format: "pdf",
          detail: {
            reason: "private_capacity_reason",
            context: { rawPreview: rawBytes.toString() },
          },
        }),
      ),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  const response = toPublicEngineErrorResponse(result);
  assert.equal(response.status, 429);
  assert.equal(response.body.code, "queue_busy");
  assert.equal("detail" in response.body, false);
  assert.doesNotMatch(
    JSON.stringify(response.body),
    /unwatermarked-secret-bytes|private_capacity_reason|private queue prose/,
  );
  assert.equal("value" in result, false);
});

test("fails closed when watermarking throws", async () => {
  const result = await applyRequiredWatermark({
    definition: { text: "Confidential" },
    apply: async () => {
      throw new Error("engine unavailable");
    },
  });

  assert.deepEqual(result, {
    ok: false,
    code: "internal_error",
    message: "Required watermarking failed.",
    operation: "watermark",
    format: "pdf",
    retryable: false,
    detail: "engine unavailable",
  });
});
