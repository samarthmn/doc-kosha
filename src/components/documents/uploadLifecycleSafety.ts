const PROVEN_REPLACE_PRE_MUTATION_STATUSES = new Set<number>([
  400, 401, 403, 409,
]);
const PROVEN_INSERT_NON_COMMIT_STATUSES = new Set<number>([
  400, 401, 403, 409, 422,
]);

export type MultipartCompletionState =
  "incomplete" | "finalizing" | "completed" | "ambiguous";

export const isProvenReplacePreMutationRejection = (status: number): boolean =>
  PROVEN_REPLACE_PRE_MUTATION_STATUSES.has(status);

export const isProvenInsertNonCommitRejection = (status: number): boolean =>
  PROVEN_INSERT_NON_COMMIT_STATUSES.has(status);

export const canDeleteCompletedMultipartTarget = (
  state: MultipartCompletionState,
): boolean => state === "completed";

const UPLOAD_CLEANUP_TIMEOUT_MS = 5_000;

export const createUploadCleanupDeadline = (
  timeoutMs: number = UPLOAD_CLEANUP_TIMEOUT_MS,
): { signal: AbortSignal; clear: () => void } => {
  const cleanupController = new AbortController();
  const timeout = globalThis.setTimeout(
    () => cleanupController.abort(),
    Math.max(0, timeoutMs),
  );

  return {
    signal: cleanupController.signal,
    clear: () => globalThis.clearTimeout(timeout),
  };
};
