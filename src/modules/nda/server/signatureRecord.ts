type PendingSignatureRecord = {
  id: string;
  signedAt: Date;
  alreadyPublished: boolean;
};

type PendingSignatureRow = {
  id: string;
  signed_at: string | null;
  signed_pdf_path: string | null;
};

type PendingSignatureRecordInput = {
  existingSignatureId?: string | null;
  workspaceId: string;
  documentId?: string | null;
  dataRoomId?: string | null;
  linkId: string;
  fullName: string;
  email: string;
  signedAtIso: string;
};

type PendingSignatureRecordDeps = {
  updateExisting: (
    input: PendingSignatureRecordInput & { existingSignatureId: string },
  ) => Promise<PendingSignatureRow | null>;
  insertNew: (
    input: PendingSignatureRecordInput,
  ) => Promise<PendingSignatureRow | null>;
};

export const ensurePendingNdaSignatureRecord = async (
  deps: PendingSignatureRecordDeps,
  input: PendingSignatureRecordInput,
): Promise<PendingSignatureRecord> => {
  const row = input.existingSignatureId
    ? await deps.updateExisting({
        ...input,
        existingSignatureId: input.existingSignatureId,
      })
    : await deps.insertNew(input);

  if (!row) {
    throw new Error("Failed to record signature");
  }

  return {
    id: row.id,
    signedAt: row.signed_at
      ? new Date(row.signed_at)
      : new Date(input.signedAtIso),
    alreadyPublished: row.signed_pdf_path !== null,
  };
};
