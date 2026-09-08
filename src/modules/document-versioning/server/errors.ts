type VersioningRepositoryError = {
  code?: string;
  message?: string;
} | null;

type DocumentVersioningErrorCode =
  | "unauthorized"
  | "document_not_found"
  | "document_scope_mismatch"
  | "version_not_found"
  | "version_pruned";

export class DocumentVersioningError extends Error {
  readonly code: DocumentVersioningErrorCode;

  constructor(code: DocumentVersioningErrorCode, message: string) {
    super(message);
    this.name = "DocumentVersioningError";
    this.code = code;
  }
}

export const isDocumentVersioningError = (
  error: unknown,
): error is DocumentVersioningError => error instanceof DocumentVersioningError;

export class DocumentDeletionConflictError extends Error {
  constructor() {
    super("Document deletion is in progress");
    this.name = "DocumentDeletionConflictError";
  }
}

export class VersioningPreMutationConflictError extends Error {
  constructor() {
    super("Document deletion is in progress");
    this.name = "VersioningPreMutationConflictError";
  }
}

export const throwVersioningRepositoryError = (
  error: VersioningRepositoryError,
  fallbackMessage: string,
): never => {
  if (error?.code === "P0006") {
    throw new DocumentDeletionConflictError();
  }
  throw new Error(error?.message ?? fallbackMessage);
};

export const runVersioningPreMutation = async <T>(
  operation: () => Promise<T>,
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DocumentDeletionConflictError) {
      throw new VersioningPreMutationConflictError();
    }
    throw error;
  }
};
