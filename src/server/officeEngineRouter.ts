/**
 * Office-engine routing decision (K5), factored into a pure function so the
 * decision matrix is unit-testable (K8) without loading the wasm module.
 */

import type {
  OfficePdfResult as OfficeConvertResult,
  PageCountResult as PdfPageCountResult,
} from "@dockosha/provider-interface";
import type { OfficeEngineOutcome } from "@/lib/engineTelemetry";
import {
  createEngineFailure,
  fromFailureResult,
  normalizeEngineError,
  type EngineFailure,
} from "@/server/engineErrors";

/**
 * Active Office formats accepted by office-core. The package's fail-closed
 * profile gate rejects unsupported document features before rendering.
 */
export const OFFICE_ENGINE_EXTENSIONS: ReadonlySet<string> = new Set([
  "docx",
  "pptx",
  "xlsx",
  "xlsm",
]);

/** Injected dependencies (real adapters in production, mocks in tests). */
export interface OfficeRouteDeps {
  toPdf: (
    bytes: ArrayBuffer | Uint8Array,
    ext: string,
    timeoutMs?: number,
  ) => Promise<OfficeConvertResult>;
  pageCount: (
    pdf: ArrayBuffer,
    timeoutMs?: number,
  ) => Promise<PdfPageCountResult>;
  report: (ext: string, outcome: OfficeEngineOutcome) => void;
}

/** The decision: return the engine's PDF or a terminal rejection reason. */
type OfficeRouteDecision =
  | {
      engine: "office-core-wasm";
      pdf: ArrayBuffer;
      pageCount: number;
      conversionMs: number;
    }
  | { engine: null; failure?: EngineFailure };

/**
 * Decides how to route an office conversion. Unsupported extensions bypass the
 * engine; supported extensions either return a validated PDF or a terminal
 * reason for the failed conversion attempt.
 */
export const decideOfficeRoute = async (
  bytes: ArrayBuffer | Uint8Array,
  extension: string,
  deps: OfficeRouteDeps,
  timeoutMs?: number,
): Promise<OfficeRouteDecision> => {
  const ext = extension.trim().toLowerCase();
  if (!OFFICE_ENGINE_EXTENSIONS.has(ext)) {
    return { engine: null };
  }

  // `office_to_pdf` is fail-closed and performs the profile gate before layout.
  const deadlineAt =
    timeoutMs === undefined ? null : Date.now() + Math.max(0, timeoutMs);
  const remainingTimeout = (): number | undefined =>
    deadlineAt === null ? undefined : Math.max(0, deadlineAt - Date.now());
  let converted: OfficeConvertResult;
  try {
    converted = await deps.toPdf(bytes, ext, remainingTimeout());
  } catch (error) {
    const failure = normalizeEngineError(error, {
      operation: "office_conversion",
      format: ext,
      fallbackMessage: "Office conversion failed.",
    });
    deps.report(ext, { kind: "fallback", failure });
    return { engine: null, failure };
  }
  if (!converted.ok) {
    const failure = fromFailureResult(converted);
    deps.report(ext, { kind: "fallback", failure });
    return { engine: null, failure };
  }
  const validationTimeoutMs = remainingTimeout();
  if (validationTimeoutMs === 0) {
    const failure = createEngineFailure({
      code: "deadline_exceeded",
      message: "Office output validation deadline exceeded.",
      operation: "page_count",
      format: "pdf",
    });
    deps.report(ext, { kind: "fallback", failure });
    return { engine: null, failure };
  }
  let pageCountResult: PdfPageCountResult;
  try {
    pageCountResult = await deps.pageCount(converted.pdf, validationTimeoutMs);
  } catch (error) {
    const failure = normalizeEngineError(error, {
      operation: "page_count",
      format: "pdf",
      fallbackMessage: "Office output validation failed.",
    });
    deps.report(ext, { kind: "fallback", failure });
    return { engine: null, failure };
  }
  if (!pageCountResult.ok) {
    const failure = fromFailureResult(pageCountResult);
    deps.report(ext, { kind: "fallback", failure });
    return { engine: null, failure };
  }
  if (pageCountResult.pageCount <= 0) {
    const failure = createEngineFailure({
      code: "invalid_output",
      message: "The Office engine returned a PDF with no pages.",
      operation: "page_count",
      format: "pdf",
    });
    deps.report(ext, { kind: "fallback", failure });
    return { engine: null, failure };
  }
  deps.report(ext, {
    kind: "converted",
    ms: converted.ms,
    pageCount: pageCountResult.pageCount,
  });
  return {
    engine: "office-core-wasm",
    pdf: converted.pdf,
    pageCount: pageCountResult.pageCount,
    conversionMs: converted.ms,
  };
};
