import type { EngineErrorCode } from "@/server/engineErrors";

type ConversionTelemetry = {
  // New writes use only package engines. Historical remote-engine values stay
  // readable because the generated database row type remains `string | null`.
  engine?: "office-core-wasm" | "pdf-core-wasm";
  failureCode?: EngineErrorCode;
  durationMs?: number;
};

/** Claims work without discarding the last known converted pointer. */
export const buildCoreClaimUpdate = (claimId: string, updatedAt: string) => ({
  conversion_status: "in_progress" as const,
  conversion_claim_id: claimId,
  updated_at: updatedAt,
});

/** Required lifecycle fields that exist before engine telemetry migrations. */
export const buildCoreCompletionUpdate = (
  convertedStoragePath: string,
  updatedAt: string,
) => ({
  converted_storage_path: convertedStoragePath,
  conversion_status: "completed" as const,
  conversion_claim_id: null,
  updated_at: updatedAt,
});

/** Atomically persists terminal failure state and its stable machine reason. */
export const buildCoreFailureUpdateWithReason = (
  failureCode: EngineErrorCode,
  updatedAt: string,
) => ({
  conversion_status: "failed" as const,
  conversion_claim_id: null,
  conversion_fallback_reason: failureCode,
  updated_at: updatedAt,
});

/** Optional, best-effort fields isolated from the document lifecycle update. */
export const buildProcessingTelemetryUpdate = (
  telemetry: ConversionTelemetry,
) => ({
  conversion_engine: telemetry.engine ?? null,
  conversion_fallback_reason: telemetry.failureCode ?? null,
  conversion_duration_ms: telemetry.durationMs ?? null,
});

/** Success telemetry does not erase the prior failure before publication. */
export const buildProcessingSuccessTelemetryUpdate = (
  telemetry: Pick<ConversionTelemetry, "engine" | "durationMs">,
) => ({
  conversion_engine: telemetry.engine ?? null,
  conversion_duration_ms: telemetry.durationMs ?? null,
});

/** Clear an obsolete reason only after a replacement attempt is completed. */
export const buildProcessingFailureTelemetryClear = () => ({
  conversion_fallback_reason: null,
});
