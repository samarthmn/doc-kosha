import { z } from "zod";

const DeleteDocumentSelectionSuccessSchema = z.object({
  ok: z.literal(true),
  deletedDocumentIds: z.array(z.string().uuid()),
  deletedFolderIds: z.array(z.string().uuid()),
  objectsDeleted: z.number().int().nonnegative(),
});

const DiscriminatedDeletionErrorSchema = z.object({
  ok: z.literal(false),
  error: z.string().min(1),
});

const LegacyDeletionErrorSchema = z
  .object({ error: z.string().min(1) })
  .passthrough()
  .refine((payload) => !("ok" in payload));

export type DeleteDocumentSelectionSuccess = z.infer<
  typeof DeleteDocumentSelectionSuccessSchema
>;

const fallbackErrorMessage =
  "Unable to delete selected items. Please try again.";

const parseDeletionErrorMessage = (payload: unknown): string | null => {
  const discriminated = DiscriminatedDeletionErrorSchema.safeParse(payload);
  if (discriminated.success) return discriminated.data.error;

  const legacy = LegacyDeletionErrorSchema.safeParse(payload);
  return legacy.success ? legacy.data.error : null;
};

export const parseDeleteDocumentSelectionResponse = (input: {
  responseOk: boolean;
  payload: unknown;
}): DeleteDocumentSelectionSuccess => {
  if (input.responseOk) {
    const success = DeleteDocumentSelectionSuccessSchema.safeParse(
      input.payload,
    );
    if (success.success) return success.data;
  }

  const errorMessage = parseDeletionErrorMessage(input.payload);
  throw new Error(errorMessage ?? fallbackErrorMessage);
};
