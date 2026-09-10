/**
 * Observability for the in-process pdf-core (WASM) engine.
 *
 * If an engine fails to load or is absent from a traced function, document
 * processing fails for every operation it owns. These helpers make load and
 * per-operation failures visible in Sentry instead of leaving the outage only
 * in request logs.
 *
 * All Sentry calls are safe no-ops when Sentry isn't initialised (local/dev),
 * so callers don't need to gate on the environment.
 */
import * as Sentry from "@sentry/nextjs";
import type { EngineFailure } from "@/server/engineErrors";
import type { RedactionWarningKindCounts } from "@/lib/redactionWarnings";

type PdfEngineOp = "merge" | "watermark" | "csv" | "markdown" | "redaction";

// A broken deploy would otherwise emit one Sentry event per request.
// Breadcrumbs stay unthrottled (cheap, and they
// give the trail leading up to a real error); full captures are rate-limited
// to one per key per window so the signal is visible without flooding.
const CAPTURE_THROTTLE_MS = 60_000;
const lastCaptureAt = new Map<string, number>();

const shouldCapture = (key: string): boolean => {
  const now = Date.now();
  const prev = lastCaptureAt.get(key) ?? 0;
  if (now - prev < CAPTURE_THROTTLE_MS) return false;
  lastCaptureAt.set(key, now);
  return true;
};

/**
 * The in-process engine declined an operation. The `fallback:*` event keys are
 * retained for historical dashboard continuity, but the operation now fails.
 */
export const engineTelemetryDimensions = (
  failure: EngineFailure,
): {
  engineErrorCode: string;
  engineOperation: string;
  engineFormat?: string;
  engineRetryable: string;
} => ({
  engineErrorCode: failure.code,
  engineOperation: failure.operation,
  ...(failure.format ? { engineFormat: failure.format } : {}),
  engineRetryable: String(failure.retryable),
});

export const reportEngineOperationFailure = (failure: EngineFailure): void => {
  const dimensions = engineTelemetryDimensions(failure);
  Sentry.addBreadcrumb({
    category: "pdf-engine",
    level: "warning",
    message: `fallback:${failure.operation}`,
    data: { ...dimensions, message: failure.message },
  });
  if (shouldCapture(`fallback:${failure.operation}:${failure.code}`)) {
    Sentry.captureMessage(
      `pdf-engine operation failed (${failure.operation})`,
      {
        level: "warning",
        tags: dimensions,
        extra: { message: failure.message, detail: failure.detail },
      },
    );
  }
};

/** Records warning metadata only; document-derived warning text is never logged. */
export const reportEngineOperationWarning = (
  op: PdfEngineOp,
  count: number,
  codes: string[] = [],
  otherCount = 0,
  kindCounts: RedactionWarningKindCounts = {},
): void => {
  const uniqueCodes = [...new Set(codes)];
  const warningDimensions = {
    engineWarningCount: count,
    engineWarningCodes: uniqueCodes,
    engineWarningOtherCount: otherCount,
    engineWarningKindCounts: kindCounts,
  };
  Sentry.addBreadcrumb({
    category: "pdf-engine",
    level: "warning",
    message: `warning:${op}`,
    data: warningDimensions,
  });
  if (shouldCapture(`warning:${op}`)) {
    Sentry.captureMessage(`pdf-engine operation warning (${op})`, {
      level: "warning",
      tags: {
        pdfEngineOp: op,
        engineWarningCodes: uniqueCodes.join(","),
      },
      extra: warningDimensions,
    });
  }
};

/**
 * Browser preview fell back to the CSS overlay (the wasm asset was missing or
 * the engine errored). Preview output is non-authoritative, so this is a
 * breadcrumb only — no capture.
 */
export const reportPreviewFallback = (reason: string): void => {
  Sentry.addBreadcrumb({
    category: "pdf-engine",
    level: "info",
    message: "preview-fallback",
    data: { reason },
  });
};

/** The outcome of an office-engine (office-core wasm) routing decision. */
export type OfficeEngineOutcome =
  | { kind: "converted"; ms: number; pageCount: number }
  // `fallback` remains the telemetry key read by existing dashboards. It now
  // means a terminal profile/size/engine rejection, not a second processing tier.
  | { kind: "fallback"; failure: EngineFailure }
  | { kind: "shadow_ok"; ms: number; pageCount: number }
  | { kind: "shadow_mismatch"; ms: number; detail: string }
  | { kind: "shadow_error"; detail: string };

/**
 * Records an office-engine routing outcome (rollout observability, K3). Logs a
 * `[OfficeEngine]` line and a Sentry breadcrumb (the existing sink), and
 * captures terminal rejections/mismatches so the historical fallback-reason
 * distribution remains usable as corpus-expansion input.
 */
export const reportOfficeEngine = (
  ext: string,
  outcome: OfficeEngineOutcome,
): void => {
  const failureDimensions =
    outcome.kind === "fallback"
      ? engineTelemetryDimensions(outcome.failure)
      : undefined;
  console.info(`[OfficeEngine] ${ext} ${outcome.kind}`, outcome);
  Sentry.addBreadcrumb({
    category: "office-engine",
    level:
      outcome.kind === "converted" || outcome.kind === "shadow_ok"
        ? "info"
        : "warning",
    message: `${outcome.kind}:${ext}`,
    data:
      outcome.kind === "fallback"
        ? {
            ...failureDimensions,
            message: outcome.failure.message,
          }
        : outcome,
  });
  if (
    (outcome.kind === "fallback" ||
      outcome.kind === "shadow_mismatch" ||
      outcome.kind === "shadow_error") &&
    shouldCapture(`office:${outcome.kind}:${ext}`)
  ) {
    Sentry.captureMessage(`office-engine ${outcome.kind} (${ext})`, {
      level: "warning",
      tags: {
        officeExt: ext,
        officeOutcome: outcome.kind,
        ...(failureDimensions ?? {}),
      },
      extra:
        outcome.kind === "fallback"
          ? {
              message: outcome.failure.message,
              detail: outcome.failure.detail,
            }
          : outcome,
    });
  }
};
