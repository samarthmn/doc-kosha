import type { PublicLanguage } from "@/modules/public-links/types";
import { generateSignedNdaPdf } from "@/modules/nda/server/pdf";
import {
  cleanupDocumentArtifactCandidate,
  type DocumentArtifactCandidate,
} from "@/server/documentArtifactCandidate";

type UploadResult = {
  ok: boolean;
  message?: string;
  status?: number;
};

type FinalizeNdaSignaturePayload = {
  signatureId: string;
  workspaceId: string;
  documentId: string | null;
  resourceId: string;
  resourceTitle: string;
  contextLabel: "document" | "data room";
  workspaceName: string;
  fullName: string;
  email: string;
  signatureDataUrl: string;
  templateHtml: string;
  signedAt: Date;
  locale: PublicLanguage;
  candidateToken: string | null;
  candidatePath: string | null;
};

type FinalizeNdaSignatureDeps = {
  uploadPdf: (input: {
    workspaceId: string;
    resourceId: string;
    email: string;
    pdfBytes: Uint8Array;
    path: string | null;
  }) => Promise<{ path: string; uploadResult: UploadResult }>;
  updateSignedPdfPath: (input: {
    signatureId: string;
    pdfPath: string;
  }) => Promise<void>;
  listOutstandingArtifactCandidates: (input: {
    signatureId: string;
  }) => Promise<DocumentArtifactCandidate[]>;
  registerArtifactCandidate: (input: {
    candidateToken: string;
    producerToken: string;
    workspaceId: string;
    documentId: string;
    signatureId: string;
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
  publishNdaCandidate: (
    candidateToken: string,
  ) => Promise<DocumentArtifactCandidate>;
  deleteArtifactCandidate: (input: {
    logicalBucket: DocumentArtifactCandidate["logicalBucket"];
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
  sendViewerEmail: (input: {
    to: string;
    pdfBytes: Uint8Array;
    resourceTitle: string;
    contextLabel: "document" | "data room";
    workspaceName: string;
    locale: PublicLanguage;
  }) => Promise<void>;
  getOwnerEmails: (input: {
    workspaceId: string;
    signerEmail: string;
  }) => Promise<string[]>;
  sendOwnerEmail: (input: {
    to: string;
    pdfBytes: Uint8Array;
    resourceTitle: string;
    contextLabel: "document" | "data room";
    workspaceName: string;
    signerName: string;
    signerEmail: string;
  }) => Promise<void>;
};

type FinalizeNdaSignatureResult =
  | { ok: true; pdfPath: string }
  | {
      ok: false;
      error: string;
      code:
        | "DELETION_IN_PROGRESS"
        | "UPLOAD_IN_PROGRESS"
        | "UPLOAD_FAILED"
        | "CLEANUP_FAILED"
        | "FINALIZE_FAILED";
      retryable: boolean;
    };

export const finalizeNdaSignature = async (
  deps: FinalizeNdaSignatureDeps,
  payload: FinalizeNdaSignaturePayload,
): Promise<FinalizeNdaSignatureResult> => {
  const failure = (
    error: string,
    code: Exclude<FinalizeNdaSignatureResult, { ok: true }>["code"],
    retryable: boolean,
  ): FinalizeNdaSignatureResult => ({
    ok: false,
    error,
    code,
    retryable,
  });

  const cleanupCandidate = (
    candidate: DocumentArtifactCandidate,
  ): Promise<boolean> =>
    cleanupDocumentArtifactCandidate(candidate, {
      deleteArtifact: deps.deleteArtifactCandidate,
      acknowledgeCleanup: deps.acknowledgeArtifactCleanup,
      markCleanupFailed: deps.markArtifactCleanupFailed,
    });

  const usesDocumentHandshake = payload.contextLabel === "document";
  let candidateToken = payload.candidateToken;
  let candidatePath = payload.candidatePath;
  let candidate: DocumentArtifactCandidate | null = null;

  try {
    if (usesDocumentHandshake) {
      if (!payload.documentId || !candidateToken || !candidatePath) {
        return failure(
          "Failed to finalize signed NDA",
          "FINALIZE_FAILED",
          false,
        );
      }

      const outstanding = await deps.listOutstandingArtifactCandidates({
        signatureId: payload.signatureId,
      });
      for (const pending of outstanding) {
        if (pending.phase === "uploading") {
          return failure(
            "Signed NDA upload still in progress",
            "UPLOAD_IN_PROGRESS",
            true,
          );
        }
        if (pending.phase === "cleanup_required") {
          if (!(await cleanupCandidate(pending))) {
            return failure(
              "Failed to clean signed NDA PDF",
              "CLEANUP_FAILED",
              true,
            );
          }
        }
        if (pending.phase === "registered") {
          candidate = pending;
          candidateToken = pending.candidateToken;
          candidatePath = pending.path;
        }
      }
    }

    const pdfBytes = await generateSignedNdaPdf({
      workspaceName: payload.workspaceName,
      documentTitle: payload.resourceTitle,
      receivingPartyName: payload.fullName,
      receivingPartyEmail: payload.email,
      effectiveDate: payload.signedAt,
      signedDateTime: payload.signedAt,
      signatureDataUrl: payload.signatureDataUrl,
      bodyHtml: payload.templateHtml,
    });

    if (usesDocumentHandshake) {
      if (!payload.documentId || !candidateToken || !candidatePath) {
        return failure(
          "Failed to finalize signed NDA",
          "FINALIZE_FAILED",
          false,
        );
      }

      candidate ??= await deps.registerArtifactCandidate({
        candidateToken,
        producerToken: candidateToken,
        workspaceId: payload.workspaceId,
        documentId: payload.documentId,
        signatureId: payload.signatureId,
        path: candidatePath,
      });
      if (candidate.phase === "cancelled") {
        return failure(
          "Document deletion in progress",
          "DELETION_IN_PROGRESS",
          true,
        );
      }

      candidate = await deps.beginArtifactUpload(candidateToken);
      if (candidate.phase === "cancelled") {
        return failure(
          "Document deletion in progress",
          "DELETION_IN_PROGRESS",
          true,
        );
      }
      if (
        candidate.phase !== "uploading" ||
        candidate.deletionClaimToken !== null
      ) {
        return failure(
          "Signed NDA upload still in progress",
          "UPLOAD_IN_PROGRESS",
          true,
        );
      }
    }

    const uploadResult = await deps.uploadPdf({
      workspaceId: payload.workspaceId,
      resourceId: payload.resourceId,
      email: payload.email,
      pdfBytes,
      path: candidatePath,
    });

    if (usesDocumentHandshake) {
      if (!candidateToken) {
        return failure(
          "Failed to finalize signed NDA",
          "FINALIZE_FAILED",
          false,
        );
      }
      candidate = await deps.finishArtifactUpload(candidateToken);

      if (!uploadResult.uploadResult.ok) {
        if (candidate.phase !== "cleanup_required") {
          candidate = await deps.markArtifactCleanupFailed({
            candidateToken,
            message:
              uploadResult.uploadResult.message ?? "Signed NDA upload failed",
          });
        }
        const cleaned = await cleanupCandidate(candidate);
        if (!cleaned) {
          return failure(
            "Failed to clean signed NDA PDF",
            "CLEANUP_FAILED",
            true,
          );
        }
        return failure(
          "Failed to upload signed NDA PDF",
          "UPLOAD_FAILED",
          true,
        );
      }

      if (candidate.phase === "cleanup_required") {
        if (!(await cleanupCandidate(candidate))) {
          return failure(
            "Failed to clean signed NDA PDF",
            "CLEANUP_FAILED",
            true,
          );
        }
        return failure(
          "Document deletion in progress",
          "DELETION_IN_PROGRESS",
          true,
        );
      }

      try {
        candidate = await deps.publishNdaCandidate(candidateToken);
      } catch {
        candidate = await deps.readArtifactCandidate(candidateToken);
        if (
          candidate?.phase === "uploading" &&
          candidate.deletionClaimToken !== null
        ) {
          candidate = await deps.finishArtifactUpload(candidateToken);
        }
      }

      if (candidate?.phase === "cleanup_required") {
        if (!(await cleanupCandidate(candidate))) {
          return failure(
            "Failed to clean signed NDA PDF",
            "CLEANUP_FAILED",
            true,
          );
        }
        return failure(
          "Document deletion in progress",
          "DELETION_IN_PROGRESS",
          true,
        );
      }
      if (
        candidate?.phase === "uploading" &&
        candidate.deletionClaimToken === null
      ) {
        candidate = await deps.markArtifactCleanupFailed({
          candidateToken,
          message: "NDA publication was not committed",
        });
        if (!(await cleanupCandidate(candidate))) {
          return failure(
            "Failed to clean signed NDA PDF",
            "CLEANUP_FAILED",
            true,
          );
        }
        return failure(
          "Failed to finalize signed NDA",
          "FINALIZE_FAILED",
          true,
        );
      }
      if (candidate?.phase !== "published") {
        return failure(
          "Failed to finalize signed NDA",
          "FINALIZE_FAILED",
          true,
        );
      }
    } else {
      if (!uploadResult.uploadResult.ok) {
        return failure(
          "Failed to upload signed NDA PDF",
          "UPLOAD_FAILED",
          true,
        );
      }

      await deps.updateSignedPdfPath({
        signatureId: payload.signatureId,
        pdfPath: uploadResult.path,
      });
    }

    try {
      await deps.sendViewerEmail({
        to: payload.email,
        pdfBytes,
        resourceTitle: payload.resourceTitle,
        contextLabel: payload.contextLabel,
        workspaceName: payload.workspaceName,
        locale: payload.locale,
      });
    } catch (error) {
      console.error("[NDA Sign] Email to viewer failed:", error);
    }

    const ownerEmails = await deps.getOwnerEmails({
      workspaceId: payload.workspaceId,
      signerEmail: payload.email,
    });

    await Promise.all(
      ownerEmails.map(async (ownerEmail) => {
        try {
          await deps.sendOwnerEmail({
            to: ownerEmail,
            pdfBytes,
            resourceTitle: payload.resourceTitle,
            contextLabel: payload.contextLabel,
            workspaceName: payload.workspaceName,
            signerName: payload.fullName,
            signerEmail: payload.email,
          });
        } catch (error) {
          console.error("[NDA Sign] Email to owner failed:", error);
        }
      }),
    );

    return { ok: true, pdfPath: uploadResult.path };
  } catch (error) {
    console.error("[NDA Sign] Finalize error:", error);

    if (usesDocumentHandshake && candidateToken) {
      try {
        candidate = await deps.readArtifactCandidate(candidateToken);
        if (candidate?.phase === "published") {
          return { ok: true, pdfPath: candidate.path };
        }

        const deletionOwned = Boolean(candidate?.deletionClaimToken);
        if (candidate?.phase === "uploading") {
          candidate = await deps.markArtifactCleanupFailed({
            candidateToken,
            message:
              error instanceof Error
                ? error.message
                : "Signed NDA upload outcome was ambiguous",
          });
        }

        if (candidate?.phase === "cleanup_required") {
          if (!(await cleanupCandidate(candidate))) {
            return failure(
              "Failed to clean signed NDA PDF",
              "CLEANUP_FAILED",
              true,
            );
          }
          if (deletionOwned) {
            return failure(
              "Document deletion in progress",
              "DELETION_IN_PROGRESS",
              true,
            );
          }
        }
      } catch (cleanupError) {
        console.error(
          "[NDA Sign] Candidate reconciliation failed:",
          cleanupError,
        );
        return failure(
          "Failed to clean signed NDA PDF",
          "CLEANUP_FAILED",
          true,
        );
      }
    }

    return failure("Failed to finalize signed NDA", "FINALIZE_FAILED", true);
  }
};
