import { randomUUID } from "node:crypto";
import { DOCUMENT_PROCESSING_OPERATION_TIMEOUT_MS } from "@/lib/constants";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { isFreePlan } from "@/modules/billing/server/planGuards";
import { convertToPdfDirect } from "@/server/conversionService";
import { documentProcessingProvider } from "@/server/documentProcessing/provider";
import { createDocumentProcessingScheduler } from "@/server/documentProcessingCoordination";
import type { SchedulerAdmission } from "@/server/documentProcessingCoordination";
import {
  createDocumentProcessingRunner,
  type DocumentProcessingDependencies,
  type DocumentProcessingDocument,
  type DocumentProcessingJob,
  type DocumentProcessingOptions,
} from "@/server/documentProcessingRunner";
import {
  buildCoreClaimUpdate,
  buildCoreFailureUpdateWithReason,
  buildProcessingFailureTelemetryClear,
  buildProcessingSuccessTelemetryUpdate,
} from "@/server/documentProcessingUpdates";
import type { EngineFailure } from "@/server/engineErrors";
import {
  parseDocumentArtifactCandidate,
  parseDocumentArtifactCandidateRows,
} from "@/server/documentArtifactCandidate";
import {
  deleteObject,
  downloadToBufferBounded,
  putBuffer,
} from "@/server/storage";

export type { DocumentProcessingJob } from "@/server/documentProcessingRunner";

const createRunnerDependencies = (): DocumentProcessingDependencies => {
  const supabase = createSupabaseServiceClient();

  return {
    readDocument: async (job) => {
      const { data } = await supabase
        .from("documents")
        .select(
          "id, workspace_id, storage_path, converted_storage_path, conversion_status, conversion_claim_id, file_type, data_room_id, updated_at",
        )
        .eq("id", job.documentId)
        .eq("workspace_id", job.workspaceId)
        .maybeSingle()
        .throwOnError();
      if (!data) return null;

      return {
        id: data.id,
        workspaceId: data.workspace_id,
        storagePath: data.storage_path,
        convertedStoragePath: data.converted_storage_path,
        conversionStatus: data.conversion_status,
        fileType: data.file_type,
        dataRoomId: data.data_room_id,
        claimId: data.conversion_claim_id,
        updatedAt: data.updated_at,
      } satisfies DocumentProcessingDocument;
    },
    claimDocument: async ({ document, claimId, updatedAt }) => {
      const claimBase = supabase
        .from("documents")
        .update(buildCoreClaimUpdate(claimId, updatedAt))
        .eq("id", document.id)
        .eq("workspace_id", document.workspaceId)
        .eq("storage_path", document.storagePath)
        .eq("conversion_status", document.conversionStatus)
        .eq("updated_at", document.updatedAt);
      const guardedClaim = document.claimId
        ? claimBase.eq("conversion_claim_id", document.claimId)
        : claimBase.is("conversion_claim_id", null);
      const { data } = await guardedClaim.select("id").throwOnError();
      return Boolean(data && data.length > 0);
    },
    readAttemptState: async (job) => {
      const { data } = await supabase
        .from("documents")
        .select(
          "storage_path, converted_storage_path, conversion_status, conversion_claim_id",
        )
        .eq("id", job.documentId)
        .eq("workspace_id", job.workspaceId)
        .maybeSingle()
        .throwOnError();
      return data
        ? {
            storagePath: data.storage_path,
            convertedStoragePath: data.converted_storage_path,
            conversionStatus: data.conversion_status,
            claimId: data.conversion_claim_id,
          }
        : null;
    },
    markFailed: async ({ document, claimId, failureCode, updatedAt }) => {
      const { data } = await supabase
        .from("documents")
        .update(buildCoreFailureUpdateWithReason(failureCode, updatedAt))
        .eq("id", document.id)
        .eq("workspace_id", document.workspaceId)
        .eq("storage_path", document.storagePath)
        .eq("conversion_status", "in_progress")
        .eq("conversion_claim_id", claimId)
        .select("id")
        .throwOnError();
      return Boolean(data && data.length > 0);
    },
    clearFailureTelemetry: async ({ document, convertedStoragePath }) => {
      await supabase
        .from("documents")
        .update(buildProcessingFailureTelemetryClear())
        .eq("id", document.id)
        .eq("workspace_id", document.workspaceId)
        .eq("storage_path", document.storagePath)
        .eq("converted_storage_path", convertedStoragePath)
        .eq("conversion_status", "completed")
        .is("conversion_claim_id", null)
        .throwOnError();
    },
    completeWithoutConversion: async ({
      document,
      claimId,
      pageCount,
      failureCode,
      updatedAt,
    }) => {
      await supabase
        .from("documents")
        .update({
          conversion_status: "completed",
          conversion_claim_id: null,
          conversion_fallback_reason: failureCode ?? null,
          num_pages: pageCount,
          updated_at: updatedAt,
        })
        .eq("id", document.id)
        .eq("workspace_id", document.workspaceId)
        .eq("storage_path", document.storagePath)
        .eq("conversion_claim_id", claimId)
        .throwOnError();
    },
    writeTelemetry: async ({ document, claimId, engine, durationMs }) => {
      await supabase
        .from("documents")
        .update(buildProcessingSuccessTelemetryUpdate({ engine, durationMs }))
        .eq("id", document.id)
        .eq("workspace_id", document.workspaceId)
        .eq("storage_path", document.storagePath)
        .eq("conversion_status", "in_progress")
        .eq("conversion_claim_id", claimId)
        .throwOnError();
    },
    listCleanupRequiredArtifactCandidates: async (job) => {
      const { data } = await supabase
        .from("document_artifact_candidates")
        .select("*")
        .eq("workspace_id", job.workspaceId)
        .eq("document_id", job.documentId)
        .eq("artifact_kind", "conversion")
        .eq("phase", "cleanup_required")
        .order("updated_at", { ascending: true })
        .throwOnError();
      return parseDocumentArtifactCandidateRows(data ?? []);
    },
    registerArtifactCandidate: async ({
      candidateToken,
      producerToken,
      document,
      logicalBucket,
      path,
    }) => {
      const { data } = await supabase
        .rpc("register_document_artifact_candidate", {
          p_candidate_token: candidateToken,
          p_workspace_id: document.workspaceId,
          p_document_id: document.id,
          p_artifact_kind: "conversion",
          p_producer_token: producerToken,
          p_logical_bucket: logicalBucket,
          p_storage_path: path,
          p_source_storage_path: document.storagePath,
        })
        .throwOnError();
      return parseDocumentArtifactCandidate(data);
    },
    beginArtifactUpload: async (candidateToken) => {
      const { data } = await supabase
        .rpc("begin_document_artifact_upload", {
          p_candidate_token: candidateToken,
        })
        .throwOnError();
      return parseDocumentArtifactCandidate(data);
    },
    finishArtifactUpload: async (candidateToken) => {
      const { data } = await supabase
        .rpc("finish_document_artifact_upload", {
          p_candidate_token: candidateToken,
        })
        .throwOnError();
      return parseDocumentArtifactCandidate(data);
    },
    readArtifactCandidate: async (candidateToken) => {
      const { data } = await supabase
        .rpc("get_document_artifact_candidate", {
          p_candidate_token: candidateToken,
        })
        .throwOnError();
      return data == null ? null : parseDocumentArtifactCandidate(data);
    },
    publishDocumentCandidate: async ({
      candidateToken,
      pageCount,
      updatedAt,
    }) => {
      const { data } = await supabase
        .rpc("publish_document_conversion_candidate", {
          p_candidate_token: candidateToken,
          p_num_pages: pageCount,
          p_updated_at: updatedAt,
        })
        .throwOnError();
      return parseDocumentArtifactCandidate(data);
    },
    deleteArtifactCandidate: deleteObject,
    acknowledgeArtifactCleanup: async (candidateToken) => {
      const { data } = await supabase
        .rpc("acknowledge_document_artifact_cleanup", {
          p_candidate_token: candidateToken,
        })
        .throwOnError();
      return parseDocumentArtifactCandidate(data);
    },
    markArtifactCleanupFailed: async ({ candidateToken, message }) => {
      const { data } = await supabase
        .rpc("mark_document_artifact_cleanup_failed", {
          p_candidate_token: candidateToken,
          p_error: message,
        })
        .throwOnError();
      return parseDocumentArtifactCandidate(data);
    },
    isFreePlan,
    downloadSourceBounded: downloadToBufferBounded,
    convertToPdf: convertToPdfDirect,
    countPdfPages: documentProcessingProvider.pageCount,
    uploadPdf: putBuffer,
    createClaimId: randomUUID,
    createCandidateToken: randomUUID,
    nowIso: () => new Date().toISOString(),
    nowMs: Date.now,
    logger: {
      error: (message, context) => console.error(message, context),
      warn: (message, context) => console.warn(message, context),
    },
  };
};

const persistUnclaimedSchedulerFailure = async (
  job: DocumentProcessingJob,
  failure: EngineFailure,
): Promise<void> => {
  const supabase = createSupabaseServiceClient();
  const updatedAt = new Date().toISOString();
  await supabase
    .from("documents")
    .update(buildCoreFailureUpdateWithReason(failure.code, updatedAt))
    .eq("id", job.documentId)
    .eq("workspace_id", job.workspaceId)
    .in("conversion_status", ["pending", "failed"])
    .is("conversion_claim_id", null)
    .throwOnError();
};

const runDocumentProcessing = async (
  job: DocumentProcessingJob,
  options: DocumentProcessingOptions,
): Promise<void> => {
  const runner = createDocumentProcessingRunner(createRunnerDependencies());
  await runner(job, options);
};

const scheduler = createDocumentProcessingScheduler(runDocumentProcessing, 2, {
  onTaskFailure: async (job, failure) => {
    try {
      await persistUnclaimedSchedulerFailure(job, failure);
    } catch (error) {
      console.error("[processing] failed to persist scheduler rejection", {
        documentId: job.documentId,
        workspaceId: job.workspaceId,
        code: failure.code,
        error,
      });
    }
  },
});

export const processDocumentProcessingJob = (
  job: DocumentProcessingJob,
  options: DocumentProcessingOptions = {},
): Promise<void> =>
  scheduler.schedule(job, {
    ...options,
    deadlineAt:
      options.deadlineAt ??
      Date.now() + DOCUMENT_PROCESSING_OPERATION_TIMEOUT_MS,
  });

export const admitDocumentProcessingJob = (
  job: DocumentProcessingJob,
  options: DocumentProcessingOptions = {},
): SchedulerAdmission =>
  scheduler.admit(job, {
    ...options,
    deadlineAt:
      options.deadlineAt ??
      Date.now() + DOCUMENT_PROCESSING_OPERATION_TIMEOUT_MS,
  });
