import { z } from "zod";

const CandidatePhaseSchema = z.enum([
  "registered",
  "uploading",
  "published",
  "cleanup_required",
  "cleaned",
  "cancelled",
]);

const ArtifactKindSchema = z.enum(["conversion", "nda"]);

const LogicalBucketSchema = z.enum([
  "documents",
  "data-room",
  "converted-documents",
  "converted-data-room",
]);

export const DocumentArtifactCandidateSchema = z
  .object({
    candidateToken: z.string().uuid(),
    producerToken: z.string().uuid(),
    workspaceId: z.string().uuid(),
    documentId: z.string().uuid(),
    artifactKind: ArtifactKindSchema,
    logicalBucket: LogicalBucketSchema,
    path: z.string().min(1),
    sourceStoragePath: z.string().min(1).nullable(),
    ndaSignatureId: z.string().uuid().nullable(),
    phase: CandidatePhaseSchema,
    deletionClaimToken: z.string().uuid().nullable(),
    cleanupError: z.string().nullable(),
  })
  .strict()
  .superRefine((candidate, context) => {
    const workspacePrefix = `workspaces/${candidate.workspaceId.toLowerCase()}/`;
    if (!candidate.path.startsWith(workspacePrefix)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Artifact path is outside its workspace",
        path: ["path"],
      });
    }
  });

const DocumentArtifactCandidateRowSchema = z
  .object({
    candidate_token: z.string().uuid(),
    producer_token: z.string().uuid(),
    workspace_id: z.string().uuid(),
    document_id: z.string().uuid(),
    artifact_kind: ArtifactKindSchema,
    logical_bucket: LogicalBucketSchema,
    storage_path: z.string().min(1),
    source_storage_path: z.string().min(1).nullable(),
    nda_signature_id: z.string().uuid().nullable(),
    phase: CandidatePhaseSchema,
    deletion_claim_token: z.string().uuid().nullable(),
    cleanup_error: z.string().nullable(),
  })
  .passthrough()
  .transform((row) => ({
    candidateToken: row.candidate_token,
    producerToken: row.producer_token,
    workspaceId: row.workspace_id,
    documentId: row.document_id,
    artifactKind: row.artifact_kind,
    logicalBucket: row.logical_bucket,
    path: row.storage_path,
    sourceStoragePath: row.source_storage_path,
    ndaSignatureId: row.nda_signature_id,
    phase: row.phase,
    deletionClaimToken: row.deletion_claim_token,
    cleanupError: row.cleanup_error,
  }));

export type DocumentArtifactCandidate = z.infer<
  typeof DocumentArtifactCandidateSchema
>;

export const parseDocumentArtifactCandidate = (
  value: unknown,
): DocumentArtifactCandidate => DocumentArtifactCandidateSchema.parse(value);

export const parseDocumentArtifactCandidateRows = (
  value: unknown,
): DocumentArtifactCandidate[] => {
  const candidates = z.array(DocumentArtifactCandidateRowSchema).parse(value);
  return candidates.map((candidate) =>
    DocumentArtifactCandidateSchema.parse(candidate),
  );
};

type DeleteArtifactResult =
  | { ok: true; deletedCount?: number }
  | { ok: false; status?: number; message: string };

type ArtifactCleanupDependencies = {
  deleteArtifact: (input: {
    logicalBucket: DocumentArtifactCandidate["logicalBucket"];
    path: string;
  }) => Promise<DeleteArtifactResult>;
  acknowledgeCleanup: (
    candidateToken: string,
  ) => Promise<DocumentArtifactCandidate>;
  markCleanupFailed: (input: {
    candidateToken: string;
    message: string;
  }) => Promise<DocumentArtifactCandidate>;
};

export const cleanupDocumentArtifactCandidate = async (
  candidate: DocumentArtifactCandidate,
  dependencies: ArtifactCleanupDependencies,
): Promise<boolean> => {
  if (candidate.phase !== "cleanup_required") return false;

  const result = await dependencies.deleteArtifact({
    logicalBucket: candidate.logicalBucket,
    path: candidate.path,
  });
  if (!result.ok) {
    await dependencies.markCleanupFailed({
      candidateToken: candidate.candidateToken,
      message: result.message,
    });
    return false;
  }

  const acknowledged = await dependencies.acknowledgeCleanup(
    candidate.candidateToken,
  );
  return acknowledged.phase === "cleaned";
};
