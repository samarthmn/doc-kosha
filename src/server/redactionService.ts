import {
  reportEngineOperationFailure,
  reportEngineOperationWarning,
} from "@/lib/engineTelemetry";
import {
  DOCUMENT_CONVERSION_TIMEOUT_MS,
  PDF_PROCESSING_MAX_INPUT_BYTES,
} from "@/lib/constants";
import {
  REDACTION_WARNING_CODES,
  type RedactionWarningCode,
} from "@/lib/redactionWarnings";
import { documentProcessingProvider } from "@/server/documentProcessing/provider";
import {
  createEngineFailure,
  engineErrorHttpStatus,
  normalizeEngineError,
  type EngineFailure,
  type EngineFailureResult,
} from "@/server/engineErrors";
import { z } from "zod";

type RedactionArea = {
  pageIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

type RedactPdfRequest = {
  sourcePdf: ArrayBuffer | Uint8Array | Buffer;
  redactions: RedactionArea[];
  timeoutMs?: number;
  deadlineAt?: number;
};

/** Re-export the client-safe X-DocKosha-Redaction-Warnings contract. */
export {
  REDACTION_WARNING_CODES,
  REDACTION_WARNINGS_HEADER,
} from "@/lib/redactionWarnings";

const REDACTION_WARNINGS_HEADER_MAX_CODES = 8;
const REDACTION_WARNINGS_HEADER_MAX_LENGTH = 256;
const redactionWarningCodeSchema = z.enum(REDACTION_WARNING_CODES);
export type { RedactionWarningCode } from "@/lib/redactionWarnings";

const redactionWarningSchema = z.union([
  z.string().max(512),
  z.object({
    code: z.string().trim().min(1).max(64),
    page: z.number().int().nonnegative(),
    kind: z.string().trim().min(1).max(64).optional(),
    message: z.string().max(512).optional(),
  }),
]);
const redactionWarningsSchema = z.array(redactionWarningSchema).max(1_024);

type RedactionWarningReport = {
  count: number;
  codes: string[];
  otherCount: number;
};

type RedactPdfResponse =
  | {
      ok: true;
      pdfBytes: ArrayBuffer;
      pageCount: number | null;
      warningCodes: RedactionWarningCode[];
    }
  | (EngineFailureResult & { status: number });

export interface RedactionServiceDependencies {
  pageCount: typeof documentProcessingProvider.pageCount;
  redact: (
    pdf: ArrayBuffer | Uint8Array | Buffer,
    areasJson: string,
    timeoutMs?: number,
  ) => Promise<
    | {
        ok: true;
        pdf: ArrayBuffer;
        pageCount: number;
        warnings: unknown;
      }
    | EngineFailureResult
  >;
  now?: () => number;
  reportWarning?: (report: RedactionWarningReport) => void;
}

const normalizedTimeoutMs = (timeoutMs: number): number =>
  Number.isFinite(timeoutMs) ? Math.max(0, Math.floor(timeoutMs)) : 0;

export const buildRedactionWarningsHeader = (codes: unknown): string | null => {
  const parsed = z.array(z.unknown()).max(1_024).safeParse(codes);
  if (!parsed.success) return null;
  const validCodes = parsed.data.flatMap((code) => {
    const parsedCode = redactionWarningCodeSchema.safeParse(code);
    return parsedCode.success ? [parsedCode.data] : [];
  });
  const uniqueCodes = [...new Set(validCodes)].slice(
    0,
    REDACTION_WARNINGS_HEADER_MAX_CODES,
  );
  const value = uniqueCodes.join(",");
  if (!value || value.length > REDACTION_WARNINGS_HEADER_MAX_LENGTH) {
    return null;
  }
  return value;
};

const ENGINE_UNAVAILABLE_MESSAGE =
  "The redaction engine is temporarily unavailable. Please try again.";

const responseFromFailure = (
  failure: EngineFailure,
  message: string = failure.message,
): Extract<RedactPdfResponse, { ok: false }> => ({
  ok: false,
  ...createEngineFailure({
    code: failure.code,
    message,
    operation: failure.operation,
    format: failure.format,
    detail: failure.detail,
  }),
  status: engineErrorHttpStatus(failure.code),
});

const publicRedactionFailure = (
  failure: EngineFailure,
): Extract<RedactPdfResponse, { ok: false }> => {
  switch (failure.code) {
    case "unsupported_feature":
    case "missing_glyph":
    case "missing_asset":
      return responseFromFailure(
        failure,
        "This PDF can't be redacted because its structure is not supported.",
      );
    case "password_protected":
      return responseFromFailure(
        failure,
        "Password-protected PDFs cannot be redacted.",
      );
    case "malformed_container":
      return responseFromFailure(failure, "This PDF could not be read.");
    case "resource_limit":
      return responseFromFailure(failure, "This PDF is too large to redact.");
    case "worker_boot_failed":
    case "engine_unavailable":
      return responseFromFailure(failure, ENGINE_UNAVAILABLE_MESSAGE);
    case "invalid_input":
    case "unsupported_format":
    case "deadline_exceeded":
    case "queue_busy":
      return responseFromFailure(failure);
    case "invalid_output":
    case "internal_error":
    case "protocol_error":
    case "trap":
      return responseFromFailure(
        failure,
        "The redaction engine failed while processing this PDF.",
      );
  }
};

export const redactPdf = async (
  req: RedactPdfRequest,
  injectedDependencies?: RedactionServiceDependencies,
): Promise<RedactPdfResponse> => {
  if (req.redactions.length === 0) {
    return responseFromFailure(
      createEngineFailure({
        code: "invalid_input",
        message: "At least one redaction is required.",
        operation: "redaction",
        format: "pdf",
      }),
    );
  }

  if (req.sourcePdf.byteLength > PDF_PROCESSING_MAX_INPUT_BYTES) {
    return responseFromFailure(
      createEngineFailure({
        code: "resource_limit",
        message: "This PDF is too large to redact.",
        operation: "redaction",
        format: "pdf",
      }),
    );
  }

  const dependencies: RedactionServiceDependencies = injectedDependencies ?? {
    pageCount: documentProcessingProvider.pageCount,
    redact: documentProcessingProvider.redactPdfWithReport,
  };
  const now = dependencies.now ?? Date.now;
  const deadlineAt =
    req.deadlineAt ??
    now() +
      normalizedTimeoutMs(req.timeoutMs ?? DOCUMENT_CONVERSION_TIMEOUT_MS);
  const remainingTimeMs = (): number =>
    Math.max(0, Math.floor(deadlineAt - now()));
  const deadlineFailure = (): Extract<RedactPdfResponse, { ok: false }> =>
    publicRedactionFailure(
      createEngineFailure({
        code: "deadline_exceeded",
        message: "The redaction deadline was exceeded.",
        operation: "redaction",
        format: "pdf",
      }),
    );

  const pageCountTimeoutMs = remainingTimeMs();
  if (pageCountTimeoutMs <= 0) return deadlineFailure();
  let pageCountResult: Awaited<
    ReturnType<typeof documentProcessingProvider.pageCount>
  >;
  try {
    pageCountResult = await dependencies.pageCount(
      req.sourcePdf,
      pageCountTimeoutMs,
    );
  } catch (error) {
    return publicRedactionFailure(
      normalizeEngineError(error, {
        operation: "page_count",
        format: "pdf",
        fallbackMessage: "The redaction engine failed to read this PDF.",
      }),
    );
  }
  if (!pageCountResult.ok) return publicRedactionFailure(pageCountResult);
  const pageCount = pageCountResult.pageCount;

  const outOfRange = req.redactions.find(
    (redaction) => redaction.pageIndex >= pageCount,
  );
  if (outOfRange) {
    return responseFromFailure(
      createEngineFailure({
        code: "invalid_input",
        message: `Redaction page ${outOfRange.pageIndex} is out of range: this document has ${pageCount} page(s).`,
        operation: "redaction",
        format: "pdf",
      }),
    );
  }

  const redactionTimeoutMs = remainingTimeMs();
  if (redactionTimeoutMs <= 0) return deadlineFailure();

  let result: Awaited<ReturnType<RedactionServiceDependencies["redact"]>>;
  try {
    result = await dependencies.redact(
      req.sourcePdf,
      JSON.stringify(req.redactions),
      redactionTimeoutMs,
    );
  } catch (error) {
    return publicRedactionFailure(
      normalizeEngineError(error, {
        operation: "redaction",
        format: "pdf",
        fallbackMessage: "The redaction engine failed.",
      }),
    );
  }

  if (!result.ok) {
    reportEngineOperationFailure(result);
    console.error("[redaction] pdf-core failed", {
      code: result.code,
      operation: result.operation,
      format: result.format,
    });
    return publicRedactionFailure(result);
  }

  const parsedWarnings = redactionWarningsSchema.safeParse(result.warnings);
  if (!parsedWarnings.success) {
    return publicRedactionFailure(
      createEngineFailure({
        code: "invalid_output",
        message: "The redaction engine returned invalid warning metadata.",
        operation: "redaction",
        format: "pdf",
        detail: z.prettifyError(parsedWarnings.error),
      }),
    );
  }

  const warningCodes: RedactionWarningCode[] = [];
  let otherCount = 0;
  for (const warning of parsedWarnings.data) {
    if (typeof warning === "string") {
      otherCount += 1;
      continue;
    }
    const parsedCode = redactionWarningCodeSchema.safeParse(warning.code);
    if (!parsedCode.success) {
      otherCount += 1;
      continue;
    }
    warningCodes.push(parsedCode.data);
  }

  const uniqueWarningCodes = [...new Set(warningCodes)];
  if (parsedWarnings.data.length > 0) {
    const report = {
      count: parsedWarnings.data.length,
      codes: [...uniqueWarningCodes, ...(otherCount > 0 ? ["other"] : [])],
      otherCount,
    };
    if (dependencies.reportWarning) dependencies.reportWarning(report);
    else {
      reportEngineOperationWarning(
        "redaction",
        report.count,
        report.codes,
        report.otherCount,
      );
    }
  }

  return {
    ok: true,
    pdfBytes: result.pdf,
    pageCount: result.pageCount,
    warningCodes: uniqueWarningCodes,
  };
};
