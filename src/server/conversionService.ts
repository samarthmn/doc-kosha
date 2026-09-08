import {
  DOCUMENT_CONVERSION_MAX_INPUT_BYTES,
  DOCUMENT_CONVERSION_TIMEOUT_MS,
} from "@/lib/constants";
import { documentProcessingProvider } from "@/server/documentProcessing/provider";
import {
  OFFICE_ENGINE_EXTENSIONS,
  decideOfficeRoute,
  type OfficeRouteDeps,
} from "@/server/officeEngineRouter";
import {
  reportEngineOperationFailure,
  reportOfficeEngine,
} from "@/lib/engineTelemetry";
import {
  createEngineFailure,
  engineErrorHttpStatus,
  normalizeEngineError,
  type EngineFailure,
  type EngineFailureResult,
} from "@/server/engineErrors";

type ConvertRequest = {
  fileName: string;
  fileExtension: string; // lowercase, no dot
  bytes: ArrayBuffer;
  timeoutMs?: number;
};

type ConvertResponse =
  | {
      ok: true;
      pdfBytes: ArrayBuffer;
      pageCount: number;
      engine?: "office-core-wasm" | "pdf-core-wasm";
      conversionMs?: number;
    }
  | (EngineFailureResult & { status: number });

const DEFAULT_TIMEOUT_MS = DOCUMENT_CONVERSION_TIMEOUT_MS;

const failureResponse = (
  failure: EngineFailure,
): Extract<ConvertResponse, { ok: false }> => ({
  ok: false,
  ...failure,
  status: engineErrorHttpStatus(failure.code),
});

const deadlineExceededResponse = (): ConvertResponse =>
  failureResponse(
    createEngineFailure({
      code: "deadline_exceeded",
      message: "Document conversion deadline exceeded",
      operation: "conversion",
    }),
  );

const normalizeTimeoutMs = (timeoutMs: number): number =>
  Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : 0;

export async function convertToPdfDirect(
  req: ConvertRequest,
  officeRouteDependencies?: OfficeRouteDeps,
): Promise<ConvertResponse> {
  const conversionStart = Date.now();
  const normalizedExtension = req.fileExtension.trim().toLowerCase();
  const isOfficeDoc = OFFICE_ENGINE_EXTENSIONS.has(normalizedExtension);
  const isCsv = normalizedExtension === "csv";
  const isMarkdown = normalizedExtension === "md";

  if (!isOfficeDoc && !isCsv && !isMarkdown) {
    return failureResponse(
      createEngineFailure({
        code: "unsupported_format",
        message: "Unsupported extension",
        operation: "conversion",
        format: normalizedExtension || "unknown",
      }),
    );
  }

  if (req.bytes.byteLength > DOCUMENT_CONVERSION_MAX_INPUT_BYTES) {
    return failureResponse(
      createEngineFailure({
        code: "resource_limit",
        message: `Input (${req.bytes.byteLength} bytes) exceeds the 50 MiB conversion limit`,
        operation: "conversion",
        format: normalizedExtension,
      }),
    );
  }

  const conversionTimeoutMs = normalizeTimeoutMs(
    req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const deadlineAt = conversionStart + conversionTimeoutMs;
  const remainingTimeoutMs = deadlineAt - Date.now();
  if (remainingTimeoutMs <= 0) return deadlineExceededResponse();

  try {
    if (isCsv || isMarkdown) {
      const localResult = isCsv
        ? await documentProcessingProvider.csvToPdf(
            req.bytes,
            remainingTimeoutMs,
          )
        : await documentProcessingProvider.markdownToPdf(
            new TextDecoder().decode(new Uint8Array(req.bytes)),
            remainingTimeoutMs,
          );
      if (!localResult.ok) {
        reportEngineOperationFailure(localResult);
        return failureResponse(localResult);
      }
      const validationTimeoutMs = deadlineAt - Date.now();
      if (validationTimeoutMs <= 0) return deadlineExceededResponse();
      const pageCountResult = await documentProcessingProvider.pageCount(
        localResult.pdf,
        validationTimeoutMs,
      );
      if (!pageCountResult.ok) {
        reportEngineOperationFailure(pageCountResult);
        return failureResponse(pageCountResult);
      }
      if (pageCountResult.pageCount <= 0) {
        return failureResponse(
          createEngineFailure({
            code: "invalid_output",
            message: "The document engine returned a PDF with no pages.",
            operation: "page_count",
            format: "pdf",
          }),
        );
      }
      return {
        ok: true,
        pdfBytes: localResult.pdf,
        pageCount: pageCountResult.pageCount,
        engine: "pdf-core-wasm",
        conversionMs: Date.now() - conversionStart,
      };
    }

    const officeDeps: OfficeRouteDeps = officeRouteDependencies ?? {
      toPdf: documentProcessingProvider.officeToPdf,
      pageCount: documentProcessingProvider.pageCount,
      report: reportOfficeEngine,
    };
    const decision = await decideOfficeRoute(
      req.bytes,
      normalizedExtension,
      officeDeps,
      remainingTimeoutMs,
    );
    if (!decision.engine) {
      const failure =
        decision.failure ??
        createEngineFailure({
          code: "internal_error",
          message: "Office conversion failed.",
          operation: "office_conversion",
          format: normalizedExtension,
        });
      return failureResponse(failure);
    }
    return {
      ok: true,
      pdfBytes: decision.pdf,
      pageCount: decision.pageCount,
      engine: "office-core-wasm",
      conversionMs: Date.now() - conversionStart,
    };
  } catch (error) {
    return failureResponse(
      normalizeEngineError(error, {
        operation: "conversion",
        format: normalizedExtension,
        fallbackMessage: "Document conversion failed.",
      }),
    );
  }
}

export const toPdfPath = (originalPath: string): string => {
  // Preserve directory structure, operate only on the file name
  const lastSlash = originalPath.lastIndexOf("/");
  const dir = lastSlash >= 0 ? originalPath.slice(0, lastSlash + 1) : "";
  const file =
    lastSlash >= 0 ? originalPath.slice(lastSlash + 1) : originalPath;

  const lastDot = file.lastIndexOf(".");
  if (lastDot === -1) return `${originalPath}.pdf`;

  const base = file.slice(0, lastDot);
  const ext = file.slice(lastDot + 1).toLowerCase();
  const newName = `${base}_${ext}.pdf`;
  return `${dir}${newName}`;
};
