import {
  CONVERTED_STORAGE_BUCKET_NAME,
  DATA_ROOM_CONVERTED_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  DOCUMENT_CONVERSION_MAX_INPUT_BYTES,
  DOCUMENT_PROCESSING_CLEANUP_RESERVE_MS,
  DOCUMENT_PROCESSING_OPERATION_TIMEOUT_MS,
  PDF_PROCESSING_MAX_INPUT_BYTES,
  STORAGE_BUCKET_NAME,
} from "@/lib/constants";
import { isActiveConvertibleExtension, isPdfExtension } from "@/lib/fileTypes";
import {
  buildClaimScopedPdfPath,
  confirmProcessingClaim,
  isProcessingClaimStale,
  type ProcessingAttemptState,
} from "@/server/documentProcessingCoordination";
import {
  cleanupDocumentArtifactCandidate,
  type DocumentArtifactCandidate,
} from "@/server/documentArtifactCandidate";
import type { LogicalBucket } from "@/server/storage/r2Keys";
import {
  createEngineFailure,
  engineFailureSchema,
  normalizeEngineError,
  type EngineErrorCode,
  type EngineFailureResult,
  type EngineFailure,
} from "@/server/engineErrors";
import {
  createDeadlineExceededFailure,
  remainingOperationTimeMs,
  runWithinOperationDeadline,
  type OperationDeadline,
} from "@/server/operationDeadline";

export type DocumentProcessingJob = {
  documentId: string;
  workspaceId: string;
};

export type DocumentProcessingOptions = {
  /**
   * When true, attempt processing even if `conversionStatus=in_progress`.
   * Use for user-driven retries when a document appears stuck.
   */
  force?: boolean;
  /** Absolute deadline captured by the original route/job invocation. */
  deadlineAt?: number;
};

export type DocumentProcessingDocument = {
  id: string;
  workspaceId: string;
  storagePath: string;
  convertedStoragePath: string | null;
  conversionStatus: string;
  fileType: string;
  dataRoomId: string | null;
  claimId: string | null;
  updatedAt: string;
};

type AttemptWrite = {
  document: DocumentProcessingDocument;
  claimId: string;
  updatedAt: string;
};

type FailureWrite = AttemptWrite & { failureCode: EngineErrorCode };

type ProcessingTelemetry = {
  // Historical database rows may contain retired remote-engine strings. This
  // narrow type governs new writes only; read-side generated DB fields remain
  // `string | null` so those rows continue to deserialize.
  engine?: "office-core-wasm" | "pdf-core-wasm";
  durationMs?: number;
};

type DownloadResult =
  { ok: true; buffer: Buffer } | { ok: false; status: number; message: string };

type ConversionResult =
  | {
      ok: true;
      pdfBytes: ArrayBuffer;
      pageCount: number;
      engine?: ProcessingTelemetry["engine"];
      conversionMs?: number;
    }
  | (EngineFailureResult & { status: number });

type PageCountResult = { ok: true; pageCount: number } | EngineFailureResult;

type UploadResult =
  { ok: true; etag?: string } | { ok: false; status: number; message: string };

type ProcessingLogger = {
  error: (message: string, context?: unknown) => void;
  warn: (message: string, context?: unknown) => void;
};

/**
 * Runtime boundaries for a processing attempt. Keeping these operations
 * injectable lets the exact claim/convert/publish sequence be exercised
 * without replacing its coordination logic with test-only predicates.
 */
export type DocumentProcessingDependencies = {
  readDocument: (
    job: DocumentProcessingJob,
  ) => Promise<DocumentProcessingDocument | null>;
  claimDocument: (write: AttemptWrite) => Promise<boolean>;
  readAttemptState: (
    job: DocumentProcessingJob,
  ) => Promise<ProcessingAttemptState | null>;
  markFailed: (write: FailureWrite) => Promise<boolean>;
  clearFailureTelemetry: (args: {
    document: DocumentProcessingDocument;
    convertedStoragePath: string;
  }) => Promise<void>;
  completeWithoutConversion: (
    write: AttemptWrite & {
      pageCount: number | null;
      failureCode?: EngineErrorCode;
    },
  ) => Promise<void>;
  writeTelemetry: (args: AttemptWrite & ProcessingTelemetry) => Promise<void>;
  listCleanupRequiredArtifactCandidates: (
    job: DocumentProcessingJob,
  ) => Promise<DocumentArtifactCandidate[]>;
  registerArtifactCandidate: (input: {
    candidateToken: string;
    producerToken: string;
    document: DocumentProcessingDocument;
    logicalBucket: "converted-documents" | "converted-data-room";
    path: string;
  }) => Promise<DocumentArtifactCandidate>;
  beginArtifactUpload: (
    candidateToken: string,
  ) => Promise<DocumentArtifactCandidate>;
  finishArtifactUpload: (
    candidateToken: string,
  ) => Promise<DocumentArtifactCandidate>;
  readArtifactCandidate: (
    candidateToken: string,
  ) => Promise<DocumentArtifactCandidate | null>;
  publishDocumentCandidate: (
    write: AttemptWrite & { candidateToken: string; pageCount: number },
  ) => Promise<DocumentArtifactCandidate>;
  deleteArtifactCandidate: (input: {
    logicalBucket: LogicalBucket;
    path: string;
  }) => Promise<
    | { ok: true; deletedCount?: number }
    | { ok: false; status?: number; message: string }
  >;
  acknowledgeArtifactCleanup: (
    candidateToken: string,
  ) => Promise<DocumentArtifactCandidate>;
  markArtifactCleanupFailed: (input: {
    candidateToken: string;
    message: string;
  }) => Promise<DocumentArtifactCandidate>;
  isFreePlan: (workspaceId: string) => Promise<boolean>;
  downloadSourceBounded: (options: {
    logicalBucket: LogicalBucket;
    path: string;
    maxBytes: number;
  }) => Promise<DownloadResult>;
  convertToPdf: (request: {
    fileName: string;
    fileExtension: string;
    bytes: ArrayBuffer;
    timeoutMs: number;
  }) => Promise<ConversionResult>;
  countPdfPages: (
    pdf: ArrayBuffer,
    timeoutMs: number,
  ) => Promise<PageCountResult>;
  uploadPdf: (options: {
    logicalBucket: LogicalBucket;
    path: string;
    body: Buffer;
    contentType: "application/pdf";
  }) => Promise<UploadResult>;
  createClaimId: () => string;
  createCandidateToken: () => string;
  nowIso: () => string;
  nowMs?: () => number;
  logger: ProcessingLogger;
};

const bufferToArrayBuffer = (buffer: Buffer): ArrayBuffer => {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
};

export const createDocumentProcessingRunner = (
  dependencies: DocumentProcessingDependencies,
) => {
  return async (
    job: DocumentProcessingJob,
    options: DocumentProcessingOptions,
  ): Promise<void> => {
    const nowMs = dependencies.nowMs ?? Date.now;
    const deadline: OperationDeadline = {
      deadlineAt:
        options.deadlineAt ??
        nowMs() + DOCUMENT_PROCESSING_OPERATION_TIMEOUT_MS,
    };
    const deadlineFailure = createDeadlineExceededFailure({
      operation: "conversion",
    });
    if (
      remainingOperationTimeMs(
        deadline,
        nowMs(),
        DOCUMENT_PROCESSING_CLEANUP_RESERVE_MS,
      ) <= 0
    ) {
      throw deadlineFailure;
    }

    const runStage = <T>(
      run: () => Promise<T>,
      reserveMs = DOCUMENT_PROCESSING_CLEANUP_RESERVE_MS,
    ): Promise<T> =>
      runWithinOperationDeadline(deadline, {
        operation: "conversion",
        reserveMs,
        now: nowMs,
        run: async () => run(),
      });

    const typedAttemptFailure = (
      error: unknown,
      fallbackMessage: string,
      format?: string,
    ): EngineFailure => {
      const parsed = engineFailureSchema.safeParse(error);
      if (parsed.success) return parsed.data;
      return normalizeEngineError(error, {
        operation: "conversion",
        format,
        fallbackMessage,
      });
    };

    const candidateIsDeletionOwned = (
      candidate: DocumentArtifactCandidate,
    ): boolean =>
      candidate.phase === "cancelled" || candidate.deletionClaimToken !== null;

    const cleanupCandidate = async (
      candidate: DocumentArtifactCandidate,
    ): Promise<boolean> => {
      const cleaned = await runStage(
        () =>
          cleanupDocumentArtifactCandidate(candidate, {
            deleteArtifact: dependencies.deleteArtifactCandidate,
            acknowledgeCleanup: dependencies.acknowledgeArtifactCleanup,
            markCleanupFailed: dependencies.markArtifactCleanupFailed,
          }),
        0,
      );
      if (cleaned || candidateIsDeletionOwned(candidate)) return cleaned;
      throw createEngineFailure({
        code: "internal_error",
        message: "Document artifact cleanup could not be completed.",
        operation: "conversion",
      });
    };

    try {
      const pendingCleanup = await runStage(
        () => dependencies.listCleanupRequiredArtifactCandidates(job),
        0,
      );
      for (const candidate of pendingCleanup) {
        // A deletion owner is responsible for retrying durable cleanup.
        if (!(await cleanupCandidate(candidate))) return;
      }
    } catch (error) {
      const failure = typedAttemptFailure(
        error,
        "Document artifact cleanup reconciliation failed.",
      );
      dependencies.logger.error(
        "[processing] failed to reconcile deletion artifact cleanup",
        { job, error: failure },
      );
      throw failure;
    }

    let row: DocumentProcessingDocument | null;
    try {
      row = await runStage(() => dependencies.readDocument(job));
    } catch (error) {
      const failure = typedAttemptFailure(
        error,
        "The document could not be read for processing.",
      );
      dependencies.logger.error(
        "[processing] failed to read document for claim",
        {
          documentId: job.documentId,
          workspaceId: job.workspaceId,
          error: failure,
        },
      );
      throw failure;
    }
    if (!row) return;

    if (row.conversionStatus === "completed" && !options.force) return;

    if (row.conversionStatus === "in_progress") {
      if (!options.force) return;
      if (!isProcessingClaimStale(row.updatedAt)) return;
    }

    const claimId = dependencies.createClaimId();
    let claimConfirmed: boolean;
    try {
      claimConfirmed = await runStage(() =>
        confirmProcessingClaim({
          sourceStoragePath: row.storagePath,
          claimId,
          write: () =>
            dependencies.claimDocument({
              document: row,
              claimId,
              updatedAt: dependencies.nowIso(),
            }),
          read: () => dependencies.readAttemptState(job),
          onAmbiguousWrite: (error) => {
            dependencies.logger.warn(
              "[processing] claim response was ambiguous; verifying",
              {
                documentId: row.id,
                storagePath: row.storagePath,
                error,
              },
            );
          },
        }),
      );
    } catch (error) {
      const failure = typedAttemptFailure(
        error,
        "The document processing claim could not be verified.",
        (row.fileType || "").toLowerCase(),
      );
      dependencies.logger.error(
        "[processing] failed to verify document claim",
        {
          documentId: row.id,
          storagePath: row.storagePath,
          error: failure,
        },
      );
      try {
        const ownedClaimFailed = await dependencies.markFailed({
          document: row,
          claimId,
          failureCode: failure.code,
          updatedAt: dependencies.nowIso(),
        });
        if (ownedClaimFailed) return;
      } catch (persistenceError) {
        dependencies.logger.error(
          "[processing] failed to settle ambiguous document claim",
          {
            documentId: row.id,
            claimId,
            code: failure.code,
            error: persistenceError,
          },
        );
      }
      throw failure;
    }
    if (!claimConfirmed) return;

    const ext = (row.fileType || "").toLowerCase();
    const isDataRoomDocument = row.dataRoomId != null;
    const sourceBucket = isDataRoomDocument
      ? DATA_ROOM_STORAGE_BUCKET_NAME
      : STORAGE_BUCKET_NAME;
    const targetBucket = isDataRoomDocument
      ? DATA_ROOM_CONVERTED_BUCKET_NAME
      : CONVERTED_STORAGE_BUCKET_NAME;

    const markFailed = async (failure: EngineFailure): Promise<void> => {
      try {
        const failed = await dependencies.markFailed({
          document: row,
          claimId,
          failureCode: failure.code,
          updatedAt: dependencies.nowIso(),
        });
        if (!failed) return;
      } catch (error) {
        dependencies.logger.error(
          "[processing] failed to mark document failed",
          {
            documentId: row.id,
            error,
            code: failure.code,
          },
        );
      }
    };

    const completeNativePdfWithMetadataFailure = async (
      failure: EngineFailure,
    ): Promise<void> => {
      dependencies.logger.warn(
        "[processing] native PDF page metadata unavailable",
        {
          documentId: row.id,
          code: failure.code,
        },
      );
      await dependencies.completeWithoutConversion({
        document: row,
        claimId,
        pageCount: null,
        failureCode: failure.code,
        updatedAt: dependencies.nowIso(),
      });
    };

    let activeCandidateToken: string | null = null;
    try {
      // A force-repair of a previously completed document restores an output
      // the workspace already earned; failing it on today's plan would flip a
      // working document to `failed` after a downgrade. The gate applies only
      // to documents that never completed a conversion.
      const isRepairOfCompleted = row.conversionStatus === "completed";
      if (
        !isRepairOfCompleted &&
        (await runStage(() => dependencies.isFreePlan(row.workspaceId))) &&
        isActiveConvertibleExtension(ext)
      ) {
        await markFailed(
          createEngineFailure({
            code: "unsupported_feature",
            message: "This workspace cannot convert the document.",
            operation: "conversion",
            format: ext,
          }),
        );
        return;
      }

      const shouldConvert = isActiveConvertibleExtension(ext);
      const shouldCountOriginalPdf = isPdfExtension(ext);
      if (!shouldConvert && !shouldCountOriginalPdf) {
        await runStage(() =>
          dependencies.completeWithoutConversion({
            document: row,
            claimId,
            pageCount: null,
            updatedAt: dependencies.nowIso(),
          }),
        );
        return;
      }

      const originalPath = row.storagePath;
      let downloadResult: DownloadResult;
      try {
        downloadResult = await runStage(() =>
          dependencies.downloadSourceBounded({
            logicalBucket: sourceBucket,
            path: originalPath,
            maxBytes: shouldCountOriginalPdf
              ? PDF_PROCESSING_MAX_INPUT_BYTES
              : DOCUMENT_CONVERSION_MAX_INPUT_BYTES,
          }),
        );
      } catch (error) {
        if (!shouldCountOriginalPdf) throw error;
        await completeNativePdfWithMetadataFailure(
          normalizeEngineError(error, {
            operation: "page_count",
            format: "pdf",
            fallbackMessage: "The PDF page metadata could not be loaded.",
          }),
        );
        return;
      }
      if (!downloadResult.ok) {
        const failure = createEngineFailure({
          code:
            downloadResult.status === 413 ? "resource_limit" : "internal_error",
          message: "The document source could not be loaded.",
          operation: shouldCountOriginalPdf ? "page_count" : "conversion",
          format: ext,
          detail: downloadResult.message,
        });
        if (shouldCountOriginalPdf) {
          await completeNativePdfWithMetadataFailure(failure);
        } else {
          await markFailed(failure);
        }
        return;
      }

      const arrayBuffer = bufferToArrayBuffer(downloadResult.buffer);
      const inputLimit = shouldCountOriginalPdf
        ? PDF_PROCESSING_MAX_INPUT_BYTES
        : DOCUMENT_CONVERSION_MAX_INPUT_BYTES;
      if (arrayBuffer.byteLength > inputLimit) {
        const failure = createEngineFailure({
          code: "resource_limit",
          message: "The document is too large to process.",
          operation: shouldCountOriginalPdf ? "page_count" : "conversion",
          format: ext,
        });
        if (shouldCountOriginalPdf) {
          await completeNativePdfWithMetadataFailure(failure);
        } else {
          await markFailed(failure);
        }
        return;
      }

      if (shouldCountOriginalPdf) {
        const pageCountTimeoutMs = remainingOperationTimeMs(
          deadline,
          nowMs(),
          DOCUMENT_PROCESSING_CLEANUP_RESERVE_MS,
        );
        if (pageCountTimeoutMs <= 0) {
          await completeNativePdfWithMetadataFailure(deadlineFailure);
          return;
        }
        let pageCountResult: PageCountResult;
        try {
          pageCountResult = await runStage(() =>
            dependencies.countPdfPages(arrayBuffer, pageCountTimeoutMs),
          );
        } catch (error) {
          await completeNativePdfWithMetadataFailure(
            normalizeEngineError(error, {
              operation: "page_count",
              format: "pdf",
              fallbackMessage: "The PDF page metadata could not be read.",
            }),
          );
          return;
        }
        if (!pageCountResult.ok) {
          await completeNativePdfWithMetadataFailure(pageCountResult);
          return;
        }
        if (pageCountResult.pageCount <= 0) {
          await completeNativePdfWithMetadataFailure(
            createEngineFailure({
              code: "invalid_output",
              message: "The PDF has no pages.",
              operation: "page_count",
              format: "pdf",
            }),
          );
          return;
        }
        await runStage(() =>
          dependencies.completeWithoutConversion({
            document: row,
            claimId,
            pageCount: pageCountResult.pageCount,
            updatedAt: dependencies.nowIso(),
          }),
        );
        return;
      }

      const conversionTimeoutMs = remainingOperationTimeMs(
        deadline,
        nowMs(),
        DOCUMENT_PROCESSING_CLEANUP_RESERVE_MS,
      );
      if (conversionTimeoutMs <= 0) throw deadlineFailure;
      const convertResult = await runStage(() =>
        dependencies.convertToPdf({
          fileName: originalPath.split("/").pop() || `document.${ext}`,
          fileExtension: ext,
          bytes: arrayBuffer,
          timeoutMs: conversionTimeoutMs,
        }),
      );
      if (!convertResult.ok) {
        await markFailed(convertResult);
        return;
      }

      const pdfPath = buildClaimScopedPdfPath(row.workspaceId, row.id, claimId);
      const candidateToken = dependencies.createCandidateToken();
      activeCandidateToken = candidateToken;
      let candidate = await runStage(() =>
        dependencies.registerArtifactCandidate({
          candidateToken,
          producerToken: claimId,
          document: row,
          logicalBucket: targetBucket,
          path: pdfPath,
        }),
      );
      if (candidate.phase === "cancelled") return;
      if (candidate.phase !== "registered") {
        throw new Error("Conversion candidate registration is not uploadable");
      }

      candidate = await runStage(() =>
        dependencies.beginArtifactUpload(candidateToken),
      );
      if (candidate.phase === "cancelled") return;
      if (
        candidate.phase !== "uploading" ||
        candidate.deletionClaimToken !== null
      ) {
        throw new Error("Conversion candidate upload was not authorized");
      }

      const uploadResult = await runStage(() =>
        dependencies.uploadPdf({
          logicalBucket: targetBucket,
          path: pdfPath,
          body: Buffer.from(convertResult.pdfBytes),
          contentType: "application/pdf",
        }),
      );
      candidate = await runStage(() =>
        dependencies.finishArtifactUpload(candidateToken),
      );

      if (!uploadResult.ok) {
        if (candidate.phase !== "cleanup_required") {
          candidate = await dependencies.markArtifactCleanupFailed({
            candidateToken: activeCandidateToken,
            message: uploadResult.message,
          });
        }
        await cleanupCandidate(candidate);
        if (candidate.deletionClaimToken !== null) return;
        await markFailed(
          createEngineFailure({
            code: "internal_error",
            message: "The converted PDF could not be stored.",
            operation: "conversion",
            format: ext,
            detail: uploadResult.message,
          }),
        );
        return;
      }

      if (candidate.phase === "cleanup_required") {
        await cleanupCandidate(candidate);
        if (!candidateIsDeletionOwned(candidate)) {
          await markFailed(
            createEngineFailure({
              code: "internal_error",
              message: "Document artifact publication was cancelled.",
              operation: "conversion",
              format: ext,
            }),
          );
        }
        return;
      }

      try {
        await runStage(() =>
          dependencies.writeTelemetry({
            document: row,
            claimId,
            updatedAt: dependencies.nowIso(),
            engine: convertResult.engine,
            durationMs: convertResult.conversionMs,
          }),
        );
      } catch (error) {
        dependencies.logger.warn(
          "[processing] conversion telemetry update skipped",
          { documentId: row.id, error },
        );
      }

      try {
        candidate = await runStage(() =>
          dependencies.publishDocumentCandidate({
            candidateToken,
            document: row,
            claimId,
            pageCount: convertResult.pageCount,
            updatedAt: dependencies.nowIso(),
          }),
        );
      } catch (error) {
        const durableCandidate = await runStage(() =>
          dependencies.readArtifactCandidate(candidateToken),
        );
        if (durableCandidate?.phase === "published") {
          try {
            await dependencies.clearFailureTelemetry({
              document: row,
              convertedStoragePath: durableCandidate.path,
            });
          } catch {
            // Best-effort telemetry never changes the completed lifecycle.
          }
          return;
        }

        let cleanupCandidateState = durableCandidate;
        if (
          cleanupCandidateState?.phase === "uploading" &&
          cleanupCandidateState.deletionClaimToken !== null
        ) {
          cleanupCandidateState =
            await dependencies.finishArtifactUpload(activeCandidateToken);
        }
        if (cleanupCandidateState?.phase === "cleanup_required") {
          await cleanupCandidate(cleanupCandidateState);
          if (!candidateIsDeletionOwned(cleanupCandidateState)) {
            await markFailed(
              typedAttemptFailure(error, "Document publication failed.", ext),
            );
          }
          return;
        }
        if (
          cleanupCandidateState?.phase === "uploading" &&
          cleanupCandidateState.deletionClaimToken === null
        ) {
          cleanupCandidateState = await dependencies.markArtifactCleanupFailed({
            candidateToken: activeCandidateToken,
            message: "Conversion publication was not committed",
          });
          await cleanupCandidate(cleanupCandidateState);
          await markFailed(
            normalizeEngineError(error, {
              operation: "conversion",
              format: ext,
              fallbackMessage: "Document publication failed.",
            }),
          );
          return;
        }
        throw error;
      }

      if (candidate.phase === "published") {
        try {
          await dependencies.clearFailureTelemetry({
            document: row,
            convertedStoragePath: candidate.path,
          });
        } catch {
          // Best-effort telemetry never changes the completed lifecycle.
        }
        return;
      }
      if (
        candidate.phase === "uploading" &&
        candidate.deletionClaimToken !== null
      ) {
        candidate =
          await dependencies.finishArtifactUpload(activeCandidateToken);
      }
      if (candidate.phase === "cleanup_required") {
        await cleanupCandidate(candidate);
        if (!candidateIsDeletionOwned(candidate)) {
          await markFailed(
            createEngineFailure({
              code: "internal_error",
              message: "Document artifact publication was cancelled.",
              operation: "conversion",
              format: ext,
            }),
          );
        }
        return;
      }
      if (
        candidate.phase === "uploading" &&
        candidate.deletionClaimToken === null
      ) {
        candidate = await dependencies.markArtifactCleanupFailed({
          candidateToken: activeCandidateToken,
          message: "Conversion publication was not committed",
        });
        await cleanupCandidate(candidate);
        await markFailed(
          createEngineFailure({
            code: "internal_error",
            message: "The document processing claim is no longer current.",
            operation: "conversion",
            format: ext,
          }),
        );
        return;
      }
      throw new Error("Document processing candidate was not published");
    } catch (error) {
      dependencies.logger.error("[processing] job failed", { job, error });
      if (activeCandidateToken) {
        let candidate: DocumentArtifactCandidate | null = null;
        try {
          candidate =
            await dependencies.readArtifactCandidate(activeCandidateToken);
        } catch {
          candidate = null;
        }

        if (candidate?.phase === "published") return;
        const deletionOwned = Boolean(candidate?.deletionClaimToken);
        let cleanupCompleted = false;
        if (candidate?.phase === "uploading") {
          try {
            candidate = await dependencies.markArtifactCleanupFailed({
              candidateToken: activeCandidateToken,
              message:
                error instanceof Error
                  ? error.message
                  : "Conversion upload outcome was ambiguous",
            });
          } catch (cleanupError) {
            dependencies.logger.warn(
              "[processing] failed to make candidate cleanup retryable",
              {
                documentId: row.id,
                candidateToken: activeCandidateToken,
                error: cleanupError,
              },
            );
          }
        }
        if (candidate?.phase === "cleanup_required") {
          try {
            cleanupCompleted = await cleanupCandidate(candidate);
          } catch (cleanupError) {
            dependencies.logger.warn(
              "[processing] candidate exact cleanup failed",
              {
                documentId: row.id,
                candidateToken: activeCandidateToken,
                error: cleanupError,
              },
            );
          }
          if (deletionOwned) return;
        }
        if (!cleanupCompleted) {
          dependencies.logger.warn(
            "[processing] retained ambiguous converted object",
            { documentId: row.id, candidateToken: activeCandidateToken },
          );
        }
      }
      await markFailed(
        normalizeEngineError(error, {
          operation: "conversion",
          format: ext,
          fallbackMessage: "Document processing failed.",
        }),
      );
    }
  };
};
