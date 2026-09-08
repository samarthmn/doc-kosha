import {
  isCompletedConversionEligibleExtension,
  isPdfExtension,
} from "@/lib/fileTypes";

type ViewerAssetInput = {
  fileType: string | null | undefined;
  convertedStoragePath: string | null | undefined;
  conversionStatus: string | null | undefined;
  convertedAssetFailed?: boolean;
  allowLegacyMissingStatus?: boolean;
  /**
   * False when the original variant is not servable for this viewer — e.g. a
   * watermark-required public document link, where the file route fails
   * closed on non-PDF originals rather than exposing unwatermarked bytes.
   */
  originalFallbackAllowed?: boolean;
};

type ViewerAssetVariant = "original" | "converted" | "unavailable";

type ConvertedAssetFailureRecovery = "repair" | "refresh" | "none";

export type PublicFileFailure = {
  status?: number;
  code?: string;
  retryable?: boolean;
  retryAfterMs?: number;
};

const MAX_PUBLIC_ASSET_AUTOMATIC_ATTEMPTS = 2;
const MAX_PUBLIC_ASSET_RETRY_DELAY_MS = 30_000;

const parseRetryAfterMs = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, MAX_PUBLIC_ASSET_RETRY_DELAY_MS);
  }
  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return undefined;
  return Math.min(
    Math.max(0, retryAt - Date.now()),
    MAX_PUBLIC_ASSET_RETRY_DELAY_MS,
  );
};

export const parsePublicFileFailureResponse = (
  response: Pick<Response, "headers" | "status">,
): PublicFileFailure => ({
  status: response.status,
  code: response.headers.get("X-DocKosha-Error-Code") ?? undefined,
  retryable:
    response.headers.get("X-DocKosha-Retryable")?.toLowerCase() === "true",
  retryAfterMs: parseRetryAfterMs(response.headers.get("Retry-After")),
});

export const resolveConvertedAssetFailureRecovery = (input: {
  accessMode: "authenticated" | "public";
  hasRetryHandler: boolean;
  hasRefreshHandler: boolean;
  failure?: PublicFileFailure | null;
  automaticAttempts?: number;
}): ConvertedAssetFailureRecovery => {
  if (input.accessMode === "authenticated" && input.hasRetryHandler) {
    return "repair";
  }
  const isDocumentProcessing =
    input.failure?.status === 409 &&
    input.failure.code === "DOCUMENT_PROCESSING";
  const isRetryableEngineFailure = input.failure?.retryable === true;
  if (
    input.accessMode === "public" &&
    input.hasRefreshHandler &&
    (input.automaticAttempts ?? 0) < MAX_PUBLIC_ASSET_AUTOMATIC_ATTEMPTS &&
    (isDocumentProcessing || isRetryableEngineFailure)
  ) {
    return "refresh";
  }
  return "none";
};

export const canEnablePublicViewerComments = (input: {
  fileType: string | null | undefined;
  convertedStoragePath?: string | null;
  conversionStatus?: string | null;
  convertedAssetFailed?: boolean;
}): boolean => {
  const fileType = (input.fileType ?? "").toLowerCase();
  if (isPdfExtension(fileType)) return true;
  if (!isCompletedConversionEligibleExtension(fileType)) return false;
  if (input.convertedAssetFailed) return false;
  return (
    input.conversionStatus === "completed" &&
    Boolean(input.convertedStoragePath?.trim())
  );
};

export const isDocumentConversionProcessing = (input: {
  fileType: string | null | undefined;
  conversionStatus: string | null | undefined;
}): boolean => {
  if (
    !isCompletedConversionEligibleExtension(
      (input.fileType ?? "").toLowerCase(),
    )
  ) {
    return false;
  }
  return (
    input.conversionStatus === "pending" ||
    input.conversionStatus === "in_progress"
  );
};

export const resolveViewerAssetVariant = (
  input: ViewerAssetInput,
): ViewerAssetVariant => {
  if (input.convertedAssetFailed) {
    return input.originalFallbackAllowed === false ? "unavailable" : "original";
  }
  if (
    !isCompletedConversionEligibleExtension(
      (input.fileType ?? "").toLowerCase(),
    )
  ) {
    return "original";
  }
  if (
    input.conversionStatus !== "completed" &&
    !(input.allowLegacyMissingStatus && input.conversionStatus === undefined)
  ) {
    return input.originalFallbackAllowed === false ? "unavailable" : "original";
  }
  if (!input.convertedStoragePath?.trim()) {
    return input.originalFallbackAllowed === false ? "unavailable" : "original";
  }
  return "converted";
};
