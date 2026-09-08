import { z } from "zod";

const filenameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(
    (value) => {
      if (value.includes("\0")) return false;
      if (value.includes("/")) return false;
      if (value.includes("\\")) return false;
      return true;
    },
    { message: "Invalid filename" },
  );

const storagePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => !value.includes("\0"), { message: "Invalid path" });

const conversionStatusSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .refine(
    (value) =>
      ["pending", "in_progress", "completed", "failed"].includes(value),
    {
      message: "Invalid conversion status",
    },
  );

export const versioningConflictsSchema = z.object({
  workspaceId: z.string().uuid(),
  dataRoomId: z.string().uuid().nullable().optional(),
  baseFolderId: z.string().uuid().nullable(),
  files: z
    .array(
      z.object({
        clientFileKey: z.string().trim().min(1).max(1024),
        relativePath: z.string().trim().max(1024).optional().default(""),
        filename: filenameSchema,
      }),
    )
    .min(1)
    .max(500),
});

export const versioningReplaceSchema = z.object({
  workspaceId: z.string().uuid(),
  documentId: z.string().uuid(),
  uploaded: z.object({
    storagePath: storagePathSchema,
    convertedStoragePath: storagePathSchema.nullable().optional(),
    conversionStatus: conversionStatusSchema,
    sizeBytes: z.number().int().nonnegative(),
    numPages: z.number().int().positive().nullable().optional(),
    title: filenameSchema,
    fileType: z.string().trim().min(1).max(32),
    folderId: z.string().uuid().nullable(),
    dataRoomId: z.string().uuid().nullable().optional(),
  }),
  idempotencyKey: z.string().trim().min(8).max(255),
});

export const versioningRestoreSchema = z.object({
  workspaceId: z.string().uuid(),
  documentId: z.string().uuid(),
  versionId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(255),
});

export const versioningHistoryQuerySchema = z.object({
  documentId: z.string().uuid(),
  cursor: z.string().trim().min(1).max(255).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const documentVersioningSettingsQuerySchema = z.object({
  workspaceId: z.string().uuid(),
});

export const documentVersioningSettingsPatchSchema = z.object({
  workspaceId: z.string().uuid(),
  maxPreviousVersions: z.number().int().min(1).max(20),
  confirmToken: z.string().trim().optional(),
  dryRun: z.boolean().optional().default(false),
});
