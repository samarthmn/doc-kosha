import {
  type WatermarkDefinition,
  type WatermarkDynamicValues,
} from "@/lib/branding";
import { reportEngineOperationFailure } from "@/lib/engineTelemetry";
import { DOCUMENT_CONVERSION_TIMEOUT_MS } from "@/lib/constants";
import {
  buildWatermarkPayload,
  WatermarkPayloadSchema,
} from "@/lib/watermarkPayload";
import { documentProcessingProvider } from "@/server/documentProcessing/provider";
import { requiredWatermarkImageError } from "@/server/watermarkPolicy";
import {
  createEngineFailure,
  engineErrorHttpStatus,
  normalizeEngineError,
  type EngineFailure,
  type EngineFailureResult,
} from "@/server/engineErrors";

interface ApplyWatermarkOptions {
  sourcePdf: ArrayBuffer | Uint8Array;
  definition: WatermarkDefinition;
  dynamicValues?: WatermarkDynamicValues;
  timeoutMs?: number;
  imageBytes?: ArrayBuffer | Uint8Array | null;
  imageFileName?: string;
  imageContentType?: string;
}

type ApplyWatermarkResult =
  { ok: true; pdf: ArrayBuffer } | (EngineFailureResult & { status: number });

interface MergePdfsOptions {
  pdfs: Array<ArrayBuffer | Uint8Array>;
  definition?: WatermarkDefinition | null;
  dynamicValues?: WatermarkDynamicValues;
  timeoutMs?: number;
  imageBytes?: ArrayBuffer | Uint8Array | null;
  imageFileName?: string;
  imageContentType?: string;
}

type MergeAdapter = typeof documentProcessingProvider.mergeAndWatermark;

const normalizeWorkerBinary = (bytes: ArrayBuffer | Uint8Array): Uint8Array => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const packed = new Uint8Array(view.byteLength);
  packed.set(view);
  return packed;
};

const responseFromFailure = (
  failure: EngineFailure,
): Extract<ApplyWatermarkResult, { ok: false }> => ({
  ok: false,
  ...failure,
  status: engineErrorHttpStatus(failure.code),
});

export const mergePdfs = async (
  options: MergePdfsOptions,
  mergeAdapter: MergeAdapter = documentProcessingProvider.mergeAndWatermark,
): Promise<ApplyWatermarkResult> => {
  if (!options.pdfs || options.pdfs.length === 0) {
    return responseFromFailure(
      createEngineFailure({
        code: "invalid_input",
        message: "At least one PDF is required",
        operation: options.definition ? "watermark" : "merge",
        format: "pdf",
      }),
    );
  }

  const imageError = requiredWatermarkImageError(
    options.definition,
    options.imageBytes,
  );
  if (imageError) {
    return responseFromFailure(
      createEngineFailure({
        code: "missing_asset",
        message: imageError,
        operation: "watermark",
        format: "pdf",
      }),
    );
  }

  const watermarkPayload = options.definition
    ? WatermarkPayloadSchema.safeParse(
        buildWatermarkPayload(options.definition, options.dynamicValues),
      )
    : null;
  if (watermarkPayload && !watermarkPayload.success) {
    return responseFromFailure(
      createEngineFailure({
        code: "invalid_input",
        message: "The generated watermark payload is invalid.",
        operation: "watermark",
        format: "pdf",
        detail: { reason: "watermark_payload_invalid" },
      }),
    );
  }

  let localResult: Awaited<ReturnType<MergeAdapter>>;
  try {
    localResult = await mergeAdapter({
      pdfs: options.pdfs.map(normalizeWorkerBinary),
      watermarkPayloadJson: watermarkPayload
        ? JSON.stringify(watermarkPayload.data)
        : null,
      watermarkImageBytes: options.imageBytes
        ? normalizeWorkerBinary(options.imageBytes)
        : null,
      timeoutMs: options.timeoutMs ?? DOCUMENT_CONVERSION_TIMEOUT_MS,
    });
  } catch (error) {
    const normalized = normalizeEngineError(error, {
      operation: options.definition ? "watermark" : "merge",
      format: "pdf",
      fallbackMessage: "The document-processing worker failed to start.",
    });
    const failure =
      normalized.code === "internal_error"
        ? createEngineFailure({
            code: "worker_boot_failed",
            message: "The document-processing worker failed to start.",
            operation: options.definition ? "watermark" : "merge",
            format: "pdf",
            detail: { reason: "worker_boundary_exception" },
          })
        : normalized;
    reportEngineOperationFailure(failure);
    return responseFromFailure(failure);
  }
  if (!localResult.ok) {
    const failure =
      localResult.code === "invalid_input" &&
      (!localResult.detail ||
        typeof localResult.detail !== "object" ||
        Array.isArray(localResult.detail) ||
        !("reason" in localResult.detail))
        ? createEngineFailure({
            code: localResult.code,
            message: localResult.message,
            operation: localResult.operation,
            format: localResult.format,
            detail: { reason: "provider_input_rejected" },
          })
        : localResult;
    reportEngineOperationFailure(failure);
    return responseFromFailure(failure);
  }

  return localResult;
};

export const applyWatermarkToPdf = async (
  options: ApplyWatermarkOptions,
): Promise<ApplyWatermarkResult> => {
  return mergePdfs({
    pdfs: [options.sourcePdf],
    definition: options.definition,
    dynamicValues: options.dynamicValues,
    timeoutMs: options.timeoutMs,
    imageBytes: options.imageBytes,
    imageContentType: options.imageContentType,
    imageFileName: options.imageFileName,
  });
};
