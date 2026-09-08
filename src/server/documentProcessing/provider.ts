import type {
  DocumentProcessingProvider,
  ProviderFailureResult,
  ProviderOperation,
} from "@dockosha/provider-interface";
import { createProvider } from "@samarthmn/dockosha-provider-docyantra";
import { createEngineFailure, toFailureResult } from "@/server/engineErrors";

type ProviderResolver = () => DocumentProcessingProvider;
type RequiredProviderMethods =
  | "csvToPdf"
  | "markdownToPdf"
  | "officeToPdf"
  | "redactPdfWithReport"
  | "probe";

type DocumentProcessingFacade = Omit<
  DocumentProcessingProvider,
  RequiredProviderMethods
> & {
  [Method in RequiredProviderMethods]-?: NonNullable<
    DocumentProcessingProvider[Method]
  >;
};

const unsupportedOperation = (
  provider: DocumentProcessingProvider,
  operation: ProviderOperation,
  format?: string,
): ProviderFailureResult =>
  toFailureResult(
    createEngineFailure({
      code: "unsupported_feature",
      message: `Document-processing provider "${provider.id}" does not support ${operation}.`,
      operation,
      format,
    }),
  );

export const createDocumentProcessingFacade = (
  resolveProvider: ProviderResolver,
): DocumentProcessingFacade => ({
  get id(): string {
    return resolveProvider().id;
  },
  get capabilities(): ReadonlySet<ProviderOperation> {
    return resolveProvider().capabilities;
  },
  mergeAndWatermark: async (options) => {
    const provider = resolveProvider();
    const operation: ProviderOperation = options.watermarkPayloadJson
      ? "watermark"
      : "merge";
    if (!provider.capabilities.has(operation)) {
      return unsupportedOperation(provider, operation, "pdf");
    }
    return provider.mergeAndWatermark(options);
  },
  pageCount: async (pdf, timeoutMs) => {
    const provider = resolveProvider();
    if (!provider.capabilities.has("page_count")) {
      return unsupportedOperation(provider, "page_count", "pdf");
    }
    return provider.pageCount(pdf, timeoutMs);
  },
  csvToPdf: async (csvBytes, timeoutMs) => {
    const provider = resolveProvider();
    if (!provider.capabilities.has("csv") || !provider.csvToPdf) {
      return unsupportedOperation(provider, "csv", "csv");
    }
    return provider.csvToPdf(csvBytes, timeoutMs);
  },
  markdownToPdf: async (markdown, timeoutMs) => {
    const provider = resolveProvider();
    if (!provider.capabilities.has("markdown") || !provider.markdownToPdf) {
      return unsupportedOperation(provider, "markdown", "md");
    }
    return provider.markdownToPdf(markdown, timeoutMs);
  },
  officeToPdf: async (bytes, extension, timeoutMs) => {
    const provider = resolveProvider();
    if (
      !provider.capabilities.has("office_conversion") ||
      !provider.officeToPdf
    ) {
      return unsupportedOperation(
        provider,
        "office_conversion",
        extension.trim().toLowerCase() || "unknown",
      );
    }
    return provider.officeToPdf(bytes, extension, timeoutMs);
  },
  redactPdfWithReport: async (pdf, areasJson, timeoutMs) => {
    const provider = resolveProvider();
    if (
      !provider.capabilities.has("redaction") ||
      !provider.redactPdfWithReport
    ) {
      return unsupportedOperation(provider, "redaction", "pdf");
    }
    return provider.redactPdfWithReport(pdf, areasJson, timeoutMs);
  },
  probe: async (timeoutMs) => {
    const provider = resolveProvider();
    if (!provider.capabilities.has("probe") || !provider.probe) {
      return {
        ...unsupportedOperation(provider, "probe"),
        bootDurationMs: 0,
      };
    }
    return provider.probe(timeoutMs);
  },
});

// DocYantra is a mandatory production dependency. Keeping the adapter import
// static makes a missing install fail during dependency resolution/build rather
// than silently degrading document processing at runtime.
const activeProvider: DocumentProcessingProvider = createProvider();

export const documentProcessingProvider = createDocumentProcessingFacade(
  () => activeProvider,
);
