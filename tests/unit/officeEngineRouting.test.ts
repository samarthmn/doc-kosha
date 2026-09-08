import assert from "node:assert/strict";
import test from "node:test";

import {
  decideOfficeRoute,
  type OfficeRouteDeps,
} from "@/server/officeEngineRouter";
import type { OfficeEngineOutcome } from "@/lib/engineTelemetry";
import {
  createEngineFailure,
  toFailureResult,
  type EngineErrorCode,
  type EngineOperation,
} from "@/server/engineErrors";

const BYTES = new Uint8Array([1, 2, 3, 4]);

const okPdf = () =>
  Promise.resolve({ ok: true as const, pdf: new ArrayBuffer(8), ms: 12 });

const failure = (
  code: EngineErrorCode,
  message: string,
  operation: EngineOperation = "office_conversion",
) =>
  createEngineFailure({
    code,
    message,
    operation,
    format: operation === "office_conversion" ? "docx" : "pdf",
  });

function makeDeps(overrides: Partial<OfficeRouteDeps> = {}): {
  deps: OfficeRouteDeps;
  outcomes: OfficeEngineOutcome[];
  calls: string[];
} {
  const outcomes: OfficeEngineOutcome[] = [];
  const calls: string[] = [];
  const deps: OfficeRouteDeps = {
    toPdf: async () => {
      calls.push("toPdf");
      return okPdf();
    },
    pageCount: async () => {
      calls.push("pageCount");
      return { ok: true as const, pageCount: 3 };
    },
    report: (_ext, outcome) => outcomes.push(outcome),
    ...overrides,
  };
  return { deps, outcomes, calls };
}

test("1. supported + convert ok + pages>0 → engine result", async () => {
  const { deps, outcomes, calls } = makeDeps();
  const d = await decideOfficeRoute(BYTES, "docx", deps);
  assert.equal(d.engine, "office-core-wasm");
  if (d.engine === "office-core-wasm") {
    assert.equal(d.conversionMs, 12);
    assert.equal(Reflect.get(d, "pageCount"), 3);
  }
  assert.equal(outcomes[0]?.kind, "converted");
  assert.deepEqual(
    calls,
    ["toPdf", "pageCount"],
    "the serving path must not profile and then re-profile during conversion",
  );
});

test("2. converter declines unsupported input → terminal reason", async () => {
  const engineFailure = failure(
    "unsupported_feature",
    "This document uses unsupported footnotes.",
  );
  const { deps, calls } = makeDeps({
    toPdf: async () => toFailureResult(engineFailure),
  });
  const d = await decideOfficeRoute(BYTES, "docx", deps);
  assert.deepEqual(d, {
    engine: null,
    failure: engineFailure,
  });
  assert.deepEqual(calls, []);
});

test("3. convert error (unsupported:text_box) → terminal reason", async () => {
  const engineFailure = failure(
    "unsupported_feature",
    "This document uses an unsupported text box.",
  );
  const { deps } = makeDeps({
    toPdf: async () => toFailureResult(engineFailure),
  });
  const d = await decideOfficeRoute(BYTES, "docx", deps);
  assert.deepEqual(d, { engine: null, failure: engineFailure });
});

test("4. pages=0 → terminal invalid_output", async () => {
  const { deps } = makeDeps({
    pageCount: async () => ({ ok: true, pageCount: 0 }),
  });
  const d = await decideOfficeRoute(BYTES, "docx", deps);
  assert.equal(d.engine, null);
  if (d.engine === null && d.failure) {
    assert.equal(d.failure.code, "invalid_output");
    assert.equal(d.failure.operation, "page_count");
  } else {
    assert.fail("zero-page output must return a typed failure");
  }
});

test("5. oversized input → terminal in-process limit reason", async () => {
  const engineFailure = failure(
    "resource_limit",
    "Office input exceeds the in-process limit.",
  );
  const { deps } = makeDeps({
    toPdf: async () => toFailureResult(engineFailure),
  });
  const d = await decideOfficeRoute(BYTES, "docx", deps);
  assert.equal(d.engine, null);
  if (d.engine === null) assert.equal(d.failure?.code, "resource_limit");
});

test("6. pptx is routed through the always-on engine", async () => {
  const { deps, calls } = makeDeps();
  const d = await decideOfficeRoute(BYTES, "pptx", deps);
  assert.equal(d.engine, "office-core-wasm");
  assert.deepEqual(calls, ["toPdf", "pageCount"]);
});

test("7. legacy Office extensions are never routed", async () => {
  for (const extension of ["doc", "ppt", "xls"]) {
    const { deps, calls } = makeDeps();
    const d = await decideOfficeRoute(BYTES, extension, deps);
    assert.deepEqual(d, { engine: null });
    assert.deepEqual(calls, []);
  }
});

test("8. unexpected converter throw → classified terminal reason", async () => {
  const { deps, outcomes } = makeDeps({
    toPdf: async () => {
      throw new WebAssembly.RuntimeError("unreachable");
    },
  });

  const d = await decideOfficeRoute(BYTES, "docx", deps);

  assert.equal(d.engine, null);
  if (d.engine === null) {
    assert.equal(d.failure?.code, "internal_error");
    assert.equal(d.failure?.message, "Office conversion failed.");
    assert.equal(d.failure?.detail, "unreachable");
  }
  const outcome = outcomes[0];
  assert.equal(outcome?.kind, "fallback");
  if (outcome?.kind === "fallback") {
    assert.equal(outcome.failure.code, "internal_error");
  }
});

test("9. page-count validator throw → typed internal failure", async () => {
  const { deps, outcomes } = makeDeps({
    pageCount: async () => {
      throw new Error("validator unavailable");
    },
  });

  const d = await decideOfficeRoute(BYTES, "docx", deps);

  assert.equal(d.engine, null);
  if (d.engine === null) {
    assert.equal(d.failure?.code, "internal_error");
    assert.equal(d.failure?.operation, "page_count");
  }
  const outcome = outcomes[0];
  assert.equal(outcome?.kind, "fallback");
  if (outcome?.kind === "fallback") {
    assert.equal(outcome.failure.code, "internal_error");
  }
});
