import { z } from "zod";

import {
  BRANDING_ASSETS_BUCKET_NAME,
  CONVERTED_STORAGE_BUCKET_NAME,
  DATA_ROOM_CONVERTED_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  STORAGE_BUCKET_NAME,
} from "@/lib/constants";
import { deleteMany, deleteObjectsByPrefix } from "@/server/storage";

const LogicalBucketSchema = z.enum([
  STORAGE_BUCKET_NAME,
  CONVERTED_STORAGE_BUCKET_NAME,
  BRANDING_ASSETS_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  DATA_ROOM_CONVERTED_BUCKET_NAME,
]);

const StoragePathSchema = z
  .string()
  .min(1)
  .refine(
    (path) =>
      !path.includes("..") &&
      !path.includes("\\") &&
      !path.includes("\0") &&
      !path.includes("//"),
    { message: "Invalid storage path" },
  );

const ExactObjectSchema = z
  .object({
    logicalBucket: LogicalBucketSchema,
    path: StoragePathSchema,
  })
  .strict();

const PrefixSchema = z
  .object({
    logicalBucket: LogicalBucketSchema,
    pathPrefix: StoragePathSchema.refine((path) => path.endsWith("/"), {
      message: "Storage prefix must end with a slash",
    }),
  })
  .strict();

const UuidArraySchema = z.array(z.string().uuid());

const DocumentDeletionPlanSchema = z
  .object({
    claimToken: z.string().uuid(),
    documentIds: UuidArraySchema,
    folderIds: UuidArraySchema,
    objects: z.array(ExactObjectSchema),
    prefixes: z.array(PrefixSchema),
  })
  .strict();

type DocumentDeletionPlan = z.infer<typeof DocumentDeletionPlanSchema>;

class DocumentDeletionStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentDeletionStorageError";
  }
}

const deduplicateByStorageKey = <T extends { logicalBucket: string }>(
  entries: T[],
  pathOf: (entry: T) => string,
): T[] => {
  const deduplicated = new Map<string, T>();
  for (const entry of entries) {
    deduplicated.set(`${entry.logicalBucket}:${pathOf(entry)}`, entry);
  }
  return [...deduplicated.values()];
};

export const parseDocumentDeletionPlan = (
  value: unknown,
  workspaceId: string,
): DocumentDeletionPlan => {
  const validatedWorkspaceId = z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase())
    .parse(workspaceId);
  const plan = DocumentDeletionPlanSchema.parse(value);
  const workspacePrefix = `workspaces/${validatedWorkspaceId}/`;

  for (const object of plan.objects) {
    if (!object.path.startsWith(workspacePrefix)) {
      throw new Error("Storage object is outside the requested workspace");
    }
  }

  for (const prefix of plan.prefixes) {
    if (!prefix.pathPrefix.startsWith(workspacePrefix)) {
      throw new Error("Storage prefix is outside the requested workspace");
    }
  }

  return {
    claimToken: plan.claimToken,
    documentIds: [...new Set(plan.documentIds)],
    folderIds: [...new Set(plan.folderIds)],
    objects: deduplicateByStorageKey(plan.objects, (object) => object.path),
    prefixes: deduplicateByStorageKey(
      plan.prefixes,
      (prefix) => prefix.pathPrefix,
    ),
  };
};

export const executeDocumentStorageDeletion = async (
  plan: DocumentDeletionPlan,
  deps: {
    deleteExact: typeof deleteMany;
    deletePrefix: typeof deleteObjectsByPrefix;
  },
): Promise<number> => {
  let deleted = 0;
  for (let index = 0; index < plan.objects.length; index += 1000) {
    const result = await deps.deleteExact({
      keys: plan.objects.slice(index, index + 1000),
    });
    if (!result.ok) {
      throw new DocumentDeletionStorageError(result.message);
    }
    deleted +=
      result.deletedCount ?? Math.min(1000, plan.objects.length - index);
  }

  for (const prefix of plan.prefixes) {
    const result = await deps.deletePrefix({
      logicalBucket: prefix.logicalBucket,
      pathPrefix: prefix.pathPrefix,
    });
    if (!result.ok) {
      throw new DocumentDeletionStorageError(result.message);
    }
    deleted += result.deletedCount ?? 0;
  }

  return deleted;
};
