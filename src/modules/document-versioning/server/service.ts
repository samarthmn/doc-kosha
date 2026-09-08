import { PLAN_LIMITS } from "@/modules/billing/plans";
import type { PlanId } from "@/modules/billing/types";
import { deleteObject } from "@/server/storage";
import { DocumentVersioningError, runVersioningPreMutation } from "./errors";
import {
  cleanupExpiredPrunedMetadata,
  computeConflictMap,
  ensureWorkspaceVersionSettings,
  getDocumentById,
  getDocumentsForConflicts,
  getFoldersForScope,
  getVersionById,
  getWorkspacePlanId,
  getWorkspaceStorageUsedBytes,
  insertArchivedVersion,
  listAvailableVersionsForDocument,
  listHistoryForDocument,
  type DocumentWithScope,
  type DocumentVersionRow,
  updateDocumentCurrentFromUpload,
  updateVersionStates,
  updateWorkspaceVersionSettings,
} from "./repository";
import {
  createVersionRetentionPlan,
  getDocumentStorageObjectKeys,
  mapConvertedBucket,
  mapOriginalBucket,
  toStorageObjectKey,
} from "./retention";

export {
  createVersionRetentionPlan,
  getProtectedStorageObjectKeysForDocument,
  rebalanceVersionRows,
} from "./retention";

const DEFAULT_HISTORY_LIMIT = 20;

const resolvePlanLimit = (planId: string | null): number | null => {
  const resolvedPlan = (planId ?? "free") as PlanId;
  return (PLAN_LIMITS[resolvedPlan] ?? PLAN_LIMITS.free).maxStorageBytes;
};

export const resolveEffectivePreviousVersionLimit = (
  planId: string | null,
  configuredPreviousVersions: number,
): number => {
  const resolvedPlan = (planId ?? "free") as PlanId;
  const planLimit = (PLAN_LIMITS[resolvedPlan] ?? PLAN_LIMITS.free)
    .maxPreviousVersions;
  return typeof planLimit === "number" ? planLimit : configuredPreviousVersions;
};

export const throwVersionHistoryUpgradeRequired = (): never => {
  const err = new Error("Version history requires a paid plan");
  err.name = "PLAN_UPGRADE_REQUIRED";
  throw err;
};

export const deletePrunedVersionBlobs = async (
  versions: DocumentVersionRow[],
  protectedStorageObjectKeys: Set<string> = new Set(),
): Promise<void> => {
  for (const version of versions) {
    const versionStorageKeys = getDocumentStorageObjectKeys(version);
    const [originalStorageKey] = versionStorageKeys;

    const isDataRoom = Boolean(version.source_scope_data_room_id);
    const originalBucket = mapOriginalBucket(isDataRoom);
    const convertedBucket = mapConvertedBucket(isDataRoom);

    if (!protectedStorageObjectKeys.has(originalStorageKey)) {
      await deleteObject({
        logicalBucket: originalBucket,
        path: version.storage_path,
      });
    }

    if (version.converted_storage_path) {
      const convertedStorageKey = toStorageObjectKey(
        convertedBucket,
        version.converted_storage_path,
      );

      if (!protectedStorageObjectKeys.has(convertedStorageKey)) {
        await deleteObject({
          logicalBucket: convertedBucket,
          path: version.converted_storage_path,
        });
      }
    }
  }
};

const deleteUnprotectedCurrentDocumentBlobs = async (
  document: Pick<
    DocumentWithScope,
    "data_room_id" | "storage_path" | "converted_storage_path"
  >,
  protectedStorageObjectKeys: Set<string>,
): Promise<void> => {
  const isDataRoom = Boolean(document.data_room_id);
  const originalBucket = mapOriginalBucket(isDataRoom);
  const convertedBucket = mapConvertedBucket(isDataRoom);
  const originalStorageKey = toStorageObjectKey(
    originalBucket,
    document.storage_path,
  );

  if (!protectedStorageObjectKeys.has(originalStorageKey)) {
    await deleteObject({
      logicalBucket: originalBucket,
      path: document.storage_path,
    });
  }

  if (document.converted_storage_path) {
    const convertedStorageKey = toStorageObjectKey(
      convertedBucket,
      document.converted_storage_path,
    );
    if (!protectedStorageObjectKeys.has(convertedStorageKey)) {
      await deleteObject({
        logicalBucket: convertedBucket,
        path: document.converted_storage_path,
      });
    }
  }
};

const computePostReplaceStorageDelta = (params: {
  currentDocumentSize: number;
  newSize: number;
  previousVersions: DocumentVersionRow[];
  maxPreviousVersions: number;
}): number => {
  const beforeBillablePrevious = params.previousVersions
    .filter(
      (version) =>
        version.state === "available" && version.counts_towards_storage,
    )
    .reduce((total, version) => total + (version.size_bytes ?? 0), 0);

  const afterCandidates = [
    params.currentDocumentSize,
    ...params.previousVersions
      .filter((version) => version.state === "available")
      .sort((a, b) =>
        a.replaced_at === b.replaced_at
          ? b.id.localeCompare(a.id)
          : b.replaced_at.localeCompare(a.replaced_at),
      )
      .map((version) => version.size_bytes ?? 0),
  ];

  const kept = afterCandidates.slice(0, params.maxPreviousVersions);
  const afterBillablePrevious = kept
    .slice(1)
    .reduce((total, size) => total + size, 0);

  return (
    params.newSize -
    params.currentDocumentSize +
    (afterBillablePrevious - beforeBillablePrevious)
  );
};

export const getConflictResolution = async (params: {
  workspaceId: string;
  dataRoomId: string | null;
  baseFolderId: string | null;
  files: Array<{
    clientFileKey: string;
    relativePath: string;
    filename: string;
  }>;
}) => {
  await cleanupExpiredPrunedMetadata({ workspaceId: params.workspaceId });

  const [existingFolders, existingDocuments] = await Promise.all([
    getFoldersForScope({
      workspaceId: params.workspaceId,
      dataRoomId: params.dataRoomId,
    }),
    getDocumentsForConflicts({
      workspaceId: params.workspaceId,
      dataRoomId: params.dataRoomId,
    }),
  ]);

  return computeConflictMap({
    files: params.files,
    baseFolderId: params.baseFolderId,
    existingFolders,
    existingDocuments,
  });
};

export const replaceWithVersioning = async (params: {
  workspaceId: string;
  documentId: string;
  uploaded: {
    storagePath: string;
    convertedStoragePath: string | null;
    conversionStatus: string;
    sizeBytes: number;
    numPages?: number | null;
    title: string;
    fileType: string;
    folderId: string | null;
    dataRoomId: string | null;
  };
}) => {
  await runVersioningPreMutation(() =>
    cleanupExpiredPrunedMetadata({
      workspaceId: params.workspaceId,
      documentId: params.documentId,
    }),
  );

  const document = await getDocumentById(params.documentId);
  if (!document || document.workspace_id !== params.workspaceId) {
    throw new DocumentVersioningError(
      "document_not_found",
      "Document not found",
    );
  }

  const dataRoomMismatch =
    (document.data_room_id ?? null) !== (params.uploaded.dataRoomId ?? null);
  if (dataRoomMismatch) {
    throw new DocumentVersioningError(
      "document_scope_mismatch",
      "Document scope mismatch",
    );
  }

  const settings =
    (await ensureWorkspaceVersionSettings(params.workspaceId)) ??
    (await updateWorkspaceVersionSettings({
      workspaceId: params.workspaceId,
      maxPreviousVersions: 1,
      updatedBy: document.created_by,
    }));

  const existingVersions = await listAvailableVersionsForDocument(document.id);
  const planId = await getWorkspacePlanId(params.workspaceId);
  const uploadFileType = params.uploaded.fileType.trim().toLowerCase();
  const allowedExtensions = (
    PLAN_LIMITS[(planId ?? "free") as PlanId] ?? PLAN_LIMITS.free
  ).allowedDocumentExtensions;
  if (allowedExtensions && !allowedExtensions.includes(uploadFileType)) {
    const err = new Error(
      "Free workspaces support PDF uploads only. Upgrade to upload and convert other file types.",
    );
    err.name = "FREE_PLAN_PDF_ONLY";
    throw err;
  }

  const effectiveMaxPreviousVersions = resolveEffectivePreviousVersionLimit(
    planId,
    settings.max_previous_versions,
  );

  const storageUsedBytes = await getWorkspaceStorageUsedBytes(
    params.workspaceId,
  );
  const maxStorageBytes = resolvePlanLimit(planId);

  const projectedDelta = computePostReplaceStorageDelta({
    currentDocumentSize: document.size_bytes,
    newSize: params.uploaded.sizeBytes,
    previousVersions: existingVersions,
    maxPreviousVersions: effectiveMaxPreviousVersions,
  });

  if (
    maxStorageBytes !== null &&
    storageUsedBytes + projectedDelta > maxStorageBytes
  ) {
    const err = new Error("Storage quota exceeded for replacement");
    err.name = "STORAGE_QUOTA_EXCEEDED";
    throw err;
  }

  if (effectiveMaxPreviousVersions === 0) {
    const updatedDocument = await runVersioningPreMutation(() =>
      updateDocumentCurrentFromUpload({
        documentId: document.id,
        workspaceId: document.workspace_id,
        title: params.uploaded.title,
        fileType: params.uploaded.fileType,
        storagePath: params.uploaded.storagePath,
        convertedStoragePath: params.uploaded.convertedStoragePath,
        conversionStatus: params.uploaded.conversionStatus,
        sizeBytes: params.uploaded.sizeBytes,
        numPages: params.uploaded.numPages,
        folderId: params.uploaded.folderId,
        dataRoomId: params.uploaded.dataRoomId,
      }),
    );

    const retentionPlan = createVersionRetentionPlan({
      versions: existingVersions,
      maxPreviousVersions: 0,
      pruneReason: "limit_auto",
      currentDocument: updatedDocument,
    });

    await updateVersionStates(retentionPlan.toUpdate);
    await deletePrunedVersionBlobs(
      retentionPlan.pruned,
      retentionPlan.protectedStorageObjectKeys,
    );
    await deleteUnprotectedCurrentDocumentBlobs(
      document,
      retentionPlan.protectedStorageObjectKeys,
    );

    return {
      document: updatedDocument,
      createdVersionId: null,
      pruned: {
        count: retentionPlan.pruned.length,
        ids: retentionPlan.pruned.map((item) => item.id),
      },
    };
  }

  const createdVersion = await runVersioningPreMutation(() =>
    insertArchivedVersion(document),
  );

  const updatedDocument = await runVersioningPreMutation(() =>
    updateDocumentCurrentFromUpload({
      documentId: document.id,
      workspaceId: document.workspace_id,
      title: params.uploaded.title,
      fileType: params.uploaded.fileType,
      storagePath: params.uploaded.storagePath,
      convertedStoragePath: params.uploaded.convertedStoragePath,
      conversionStatus: params.uploaded.conversionStatus,
      sizeBytes: params.uploaded.sizeBytes,
      numPages: params.uploaded.numPages,
      folderId: params.uploaded.folderId,
      dataRoomId: params.uploaded.dataRoomId,
    }),
  );

  const currentVersions = await listAvailableVersionsForDocument(document.id);
  const retentionPlan = createVersionRetentionPlan({
    versions: currentVersions,
    maxPreviousVersions: effectiveMaxPreviousVersions,
    pruneReason: "limit_auto",
    currentDocument: updatedDocument,
  });

  await updateVersionStates(retentionPlan.toUpdate);
  await deletePrunedVersionBlobs(
    retentionPlan.pruned,
    retentionPlan.protectedStorageObjectKeys,
  );

  return {
    document: updatedDocument,
    createdVersionId: createdVersion.id,
    pruned: {
      count: retentionPlan.pruned.length,
      ids: retentionPlan.pruned.map((item) => item.id),
    },
  };
};

export const getVersionHistory = async (params: {
  documentId: string;
  cursor: string | null;
  limit?: number;
}) => {
  await cleanupExpiredPrunedMetadata({ documentId: params.documentId });
  const pageSize = params.limit ?? DEFAULT_HISTORY_LIMIT;
  const rows = await listHistoryForDocument({
    documentId: params.documentId,
    cursor: params.cursor,
    limit: pageSize,
  });

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore
    ? (page[page.length - 1]?.replaced_at ?? null)
    : null;

  return {
    items: page,
    nextCursor,
  };
};

export const restoreVersionToCurrent = async (params: {
  workspaceId: string;
  documentId: string;
  versionId: string;
}) => {
  await cleanupExpiredPrunedMetadata({
    workspaceId: params.workspaceId,
    documentId: params.documentId,
  });

  const document = await getDocumentById(params.documentId);
  if (!document || document.workspace_id !== params.workspaceId) {
    throw new DocumentVersioningError(
      "document_not_found",
      "Document not found",
    );
  }

  const targetVersion = await getVersionById(params.versionId);
  if (!targetVersion || targetVersion.document_id !== params.documentId) {
    throw new DocumentVersioningError("version_not_found", "Version not found");
  }
  if (targetVersion.state !== "available") {
    throw new DocumentVersioningError(
      "version_pruned",
      "Version is pruned and cannot be restored",
    );
  }

  const settings = await ensureWorkspaceVersionSettings(params.workspaceId);
  const effectiveMaxPreviousVersions = resolveEffectivePreviousVersionLimit(
    await getWorkspacePlanId(params.workspaceId),
    settings.max_previous_versions,
  );
  if (effectiveMaxPreviousVersions === 0) {
    throwVersionHistoryUpgradeRequired();
  }

  await insertArchivedVersion(document);

  const updatedDocument = await updateDocumentCurrentFromUpload({
    documentId: document.id,
    workspaceId: document.workspace_id,
    title: targetVersion.title,
    fileType: targetVersion.file_type,
    storagePath: targetVersion.storage_path,
    convertedStoragePath: targetVersion.converted_storage_path,
    conversionStatus: targetVersion.conversion_status,
    sizeBytes: targetVersion.size_bytes,
    numPages: null,
    folderId: targetVersion.source_folder_id,
    dataRoomId: targetVersion.source_scope_data_room_id,
  });

  const currentVersions = await listAvailableVersionsForDocument(document.id);
  const retentionPlan = createVersionRetentionPlan({
    versions: currentVersions,
    maxPreviousVersions: effectiveMaxPreviousVersions,
    pruneReason: "limit_auto",
    currentDocument: updatedDocument,
  });

  await updateVersionStates(retentionPlan.toUpdate);
  await deletePrunedVersionBlobs(
    retentionPlan.pruned,
    retentionPlan.protectedStorageObjectKeys,
  );

  return {
    document: updatedDocument,
    pruned: {
      count: retentionPlan.pruned.length,
      ids: retentionPlan.pruned.map((item) => item.id),
    },
  };
};
