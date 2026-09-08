import {
  CONVERTED_STORAGE_BUCKET_NAME,
  DATA_ROOM_CONVERTED_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  STORAGE_BUCKET_NAME,
} from "@/lib/constants";
import type { LogicalBucket } from "@/server/storage";
import type { DocumentVersionRow, DocumentWithScope } from "./repository";

export const mapOriginalBucket = (isDataRoom: boolean): LogicalBucket =>
  isDataRoom ? DATA_ROOM_STORAGE_BUCKET_NAME : STORAGE_BUCKET_NAME;

export const mapConvertedBucket = (isDataRoom: boolean): LogicalBucket =>
  isDataRoom ? DATA_ROOM_CONVERTED_BUCKET_NAME : CONVERTED_STORAGE_BUCKET_NAME;

export const toStorageObjectKey = (
  bucket: LogicalBucket,
  path: string,
): string => `${bucket}:${path}`;

export const getDocumentStorageObjectKeys = (
  document: Pick<
    DocumentVersionRow,
    "source_scope_data_room_id" | "storage_path" | "converted_storage_path"
  >,
): Set<string> => {
  const isDataRoom = Boolean(document.source_scope_data_room_id);
  const keys = new Set<string>([
    toStorageObjectKey(mapOriginalBucket(isDataRoom), document.storage_path),
  ]);

  if (document.converted_storage_path) {
    keys.add(
      toStorageObjectKey(
        mapConvertedBucket(isDataRoom),
        document.converted_storage_path,
      ),
    );
  }

  return keys;
};

const getCurrentDocumentStorageObjectKeys = (
  document: Pick<
    DocumentWithScope,
    "data_room_id" | "storage_path" | "converted_storage_path"
  >,
): Set<string> => {
  const isDataRoom = Boolean(document.data_room_id);
  const keys = new Set<string>([
    toStorageObjectKey(mapOriginalBucket(isDataRoom), document.storage_path),
  ]);

  if (document.converted_storage_path) {
    keys.add(
      toStorageObjectKey(
        mapConvertedBucket(isDataRoom),
        document.converted_storage_path,
      ),
    );
  }

  return keys;
};

export const getProtectedStorageObjectKeysForDocument = (params: {
  currentDocument: Pick<
    DocumentWithScope,
    "data_room_id" | "storage_path" | "converted_storage_path"
  >;
  versions: DocumentVersionRow[];
  keptVersionIds: Set<string>;
}): Set<string> => {
  const keys = getCurrentDocumentStorageObjectKeys(params.currentDocument);

  for (const version of params.versions) {
    if (!params.keptVersionIds.has(version.id)) continue;
    const versionKeys = getDocumentStorageObjectKeys(version);
    for (const key of versionKeys) {
      keys.add(key);
    }
  }

  return keys;
};

type VersionStateUpdate = {
  id: string;
  isFreeIncluded: boolean;
  countsTowardsStorage: boolean;
  state: "available" | "pruned";
  prunedAt: string | null;
  prunedReason: "limit_auto" | "limit_decrease" | "manual_cleanup" | null;
};

export const rebalanceVersionRows = (params: {
  versions: DocumentVersionRow[];
  maxPreviousVersions: number;
  pruneReason: "limit_auto" | "limit_decrease" | "manual_cleanup";
}): {
  toUpdate: VersionStateUpdate[];
  pruned: DocumentVersionRow[];
} => {
  const available = params.versions
    .filter((version) => version.state === "available")
    .sort((a, b) =>
      a.replaced_at === b.replaced_at
        ? b.id.localeCompare(a.id)
        : b.replaced_at.localeCompare(a.replaced_at),
    );

  const toUpdate: VersionStateUpdate[] = [];
  const pruned: DocumentVersionRow[] = [];

  available.forEach((version, index) => {
    const keepAvailable = index < params.maxPreviousVersions;
    const isFreeIncluded = keepAvailable && index === 0;
    const countsTowardsStorage = keepAvailable && index > 0;

    if (!keepAvailable) {
      pruned.push(version);
    }

    toUpdate.push({
      id: version.id,
      isFreeIncluded,
      countsTowardsStorage,
      state: keepAvailable ? "available" : "pruned",
      prunedAt: keepAvailable ? null : new Date().toISOString(),
      prunedReason: keepAvailable ? null : params.pruneReason,
    });
  });

  return { toUpdate, pruned };
};

export const createVersionRetentionPlan = (params: {
  versions: DocumentVersionRow[];
  maxPreviousVersions: number;
  pruneReason: "limit_auto" | "limit_decrease" | "manual_cleanup";
  currentDocument: Pick<
    DocumentWithScope,
    "data_room_id" | "storage_path" | "converted_storage_path"
  >;
}): {
  toUpdate: VersionStateUpdate[];
  pruned: DocumentVersionRow[];
  protectedStorageObjectKeys: Set<string>;
} => {
  const { toUpdate, pruned } = rebalanceVersionRows(params);
  const keptVersionIds = new Set(
    toUpdate
      .filter((item) => item.state === "available")
      .map((item) => item.id),
  );

  return {
    toUpdate,
    pruned,
    protectedStorageObjectKeys: getProtectedStorageObjectKeysForDocument({
      currentDocument: params.currentDocument,
      versions: params.versions,
      keptVersionIds,
    }),
  };
};
