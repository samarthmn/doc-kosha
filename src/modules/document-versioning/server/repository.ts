import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { hasEntitlementNow } from "@/modules/billing/entitlements";
import { mapWorkspaceSubscriptionRow } from "@/modules/billing/subscriptionMapper";
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/types/generated/supabase";
import { throwVersioningRepositoryError } from "./errors";

type FolderRow = Pick<Tables<"folders">, "id" | "parent_folder_id" | "name">;

export type DocumentWithScope = Pick<
  Tables<"documents">,
  | "id"
  | "workspace_id"
  | "data_room_id"
  | "folder_id"
  | "title"
  | "file_type"
  | "storage_path"
  | "converted_storage_path"
  | "conversion_status"
  | "size_bytes"
  | "created_at"
  | "created_by"
>;

export type DocumentVersionRow = Tables<"document_versions">;

type WorkspaceVersionSettingsRow =
  Tables<"workspace_document_version_settings">;

const normalizeName = (name: string): string => name.trim().toLowerCase();

export const getDocumentById = async (
  documentId: string,
): Promise<DocumentWithScope | null> => {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin
    .from("documents")
    .select(
      "id,workspace_id,data_room_id,folder_id,title,file_type,storage_path,converted_storage_path,conversion_status,size_bytes,created_at,created_by",
    )
    .eq("id", documentId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as DocumentWithScope | null) ?? null;
};

const getWorkspaceVersionSettings = async (
  workspaceId: string,
): Promise<WorkspaceVersionSettingsRow | null> => {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin
    .from("workspace_document_version_settings")
    .select(
      "workspace_id,max_previous_versions,updated_by,created_at,updated_at",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(error.message);
  }

  return (data as WorkspaceVersionSettingsRow | null) ?? null;
};

export const ensureWorkspaceVersionSettings = async (
  workspaceId: string,
): Promise<WorkspaceVersionSettingsRow> => {
  const existing = await getWorkspaceVersionSettings(workspaceId);
  if (existing) return existing;

  const admin = createSupabaseServiceClient();
  const payload: TablesInsert<"workspace_document_version_settings"> = {
    workspace_id: workspaceId,
    max_previous_versions: 1,
  };

  const { data, error } = await admin
    .from("workspace_document_version_settings")
    .insert(payload)
    .select(
      "workspace_id,max_previous_versions,updated_by,created_at,updated_at",
    )
    .single();

  if (error?.code === "23505") {
    const collided = await getWorkspaceVersionSettings(workspaceId);
    if (collided) return collided;
  }

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to ensure version settings");
  }

  return data as WorkspaceVersionSettingsRow;
};

export const updateWorkspaceVersionSettings = async (params: {
  workspaceId: string;
  maxPreviousVersions: number;
  updatedBy: string;
}): Promise<WorkspaceVersionSettingsRow> => {
  const admin = createSupabaseServiceClient();
  const payload: TablesInsert<"workspace_document_version_settings"> = {
    workspace_id: params.workspaceId,
    max_previous_versions: params.maxPreviousVersions,
    updated_by: params.updatedBy,
  };

  const { data, error } = await admin
    .from("workspace_document_version_settings")
    .upsert(payload, { onConflict: "workspace_id" })
    .select(
      "workspace_id,max_previous_versions,updated_by,created_at,updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update version settings");
  }

  return data as WorkspaceVersionSettingsRow;
};

export const getFoldersForScope = async (params: {
  workspaceId: string;
  dataRoomId: string | null;
}): Promise<FolderRow[]> => {
  const admin = createSupabaseServiceClient();
  let query = admin
    .from("folders")
    .select("id,parent_folder_id,name")
    .eq("workspace_id", params.workspaceId);

  query = params.dataRoomId
    ? query.eq("data_room_id", params.dataRoomId)
    : query.is("data_room_id", null);

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data as FolderRow[] | null) ?? [];
};

export const getDocumentsForConflicts = async (params: {
  workspaceId: string;
  dataRoomId: string | null;
}): Promise<Array<Pick<Tables<"documents">, "id" | "folder_id" | "title">>> => {
  const admin = createSupabaseServiceClient();
  let query = admin
    .from("documents")
    .select("id,folder_id,title")
    .eq("workspace_id", params.workspaceId);

  query = params.dataRoomId
    ? query.eq("data_room_id", params.dataRoomId)
    : query.is("data_room_id", null);

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (
    (data as Array<
      Pick<Tables<"documents">, "id" | "folder_id" | "title">
    > | null) ?? []
  );
};

export const listWorkspaceDocumentIds = async (
  workspaceId: string,
): Promise<string[]> => {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin
    .from("documents")
    .select("id")
    .eq("workspace_id", workspaceId);

  if (error) {
    throw new Error(error.message);
  }

  return ((data as Array<Pick<Tables<"documents">, "id">> | null) ?? []).map(
    (item) => item.id,
  );
};

export const listAvailableVersionsForDocument = async (
  documentId: string,
): Promise<DocumentVersionRow[]> => {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin
    .from("document_versions")
    .select("*")
    .eq("document_id", documentId)
    .eq("state", "available")
    .order("replaced_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data as DocumentVersionRow[] | null) ?? [];
};

export const insertArchivedVersion = async (
  document: DocumentWithScope,
): Promise<DocumentVersionRow> => {
  const admin = createSupabaseServiceClient();
  const payload: TablesInsert<"document_versions"> = {
    workspace_id: document.workspace_id,
    document_id: document.id,
    source_scope_data_room_id: document.data_room_id,
    source_folder_id: document.folder_id,
    title: document.title,
    file_type: document.file_type,
    storage_path: document.storage_path,
    converted_storage_path: document.converted_storage_path,
    conversion_status: document.conversion_status,
    size_bytes: document.size_bytes,
    created_by: document.created_by,
    original_created_at: document.created_at,
    state: "available",
    counts_towards_storage: false,
    is_free_included: false,
  };

  const { data, error } = await admin
    .from("document_versions")
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) {
    throwVersioningRepositoryError(error, "Failed to archive document version");
  }

  return data as DocumentVersionRow;
};

export const updateDocumentCurrentFromUpload = async (params: {
  documentId: string;
  workspaceId: string;
  title: string;
  fileType: string;
  storagePath: string;
  convertedStoragePath: string | null;
  conversionStatus: string;
  sizeBytes: number;
  numPages?: number | null;
  folderId: string | null;
  dataRoomId: string | null;
}): Promise<DocumentWithScope> => {
  const admin = createSupabaseServiceClient();
  const payload: TablesUpdate<"documents"> = {
    title: params.title,
    file_type: params.fileType,
    storage_path: params.storagePath,
    converted_storage_path: params.convertedStoragePath,
    conversion_status: params.conversionStatus,
    conversion_claim_id: null,
    size_bytes: params.sizeBytes,
    num_pages: params.numPages === undefined ? undefined : params.numPages,
    folder_id: params.folderId,
    data_room_id: params.dataRoomId,
  };

  const { data, error } = await admin
    .from("documents")
    .update(payload)
    .eq("id", params.documentId)
    .eq("workspace_id", params.workspaceId)
    .select(
      "id,workspace_id,data_room_id,folder_id,title,file_type,storage_path,converted_storage_path,conversion_status,size_bytes,created_at,created_by",
    )
    .single();

  if (error || !data) {
    throwVersioningRepositoryError(error, "Failed to update current document");
  }

  return data as DocumentWithScope;
};

export const updateVersionStates = async (
  updates: Array<{
    id: string;
    isFreeIncluded: boolean;
    countsTowardsStorage: boolean;
    state: "available" | "pruned";
    prunedAt: string | null;
    prunedReason: "limit_auto" | "limit_decrease" | "manual_cleanup" | null;
  }>,
): Promise<void> => {
  if (updates.length === 0) return;
  const admin = createSupabaseServiceClient();

  for (const update of updates) {
    const payload: TablesUpdate<"document_versions"> = {
      is_free_included: update.isFreeIncluded,
      counts_towards_storage: update.countsTowardsStorage,
      state: update.state,
      pruned_at: update.prunedAt,
      pruned_reason: update.prunedReason,
    };

    const { error } = await admin
      .from("document_versions")
      .update(payload)
      .eq("id", update.id);

    if (error) {
      throwVersioningRepositoryError(error, "Failed to update version state");
    }
  }
};

export const listHistoryForDocument = async (params: {
  documentId: string;
  cursor: string | null;
  limit: number;
}): Promise<DocumentVersionRow[]> => {
  const admin = createSupabaseServiceClient();
  let query = admin
    .from("document_versions")
    .select("*")
    .eq("document_id", params.documentId)
    .order("replaced_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(params.limit + 1);

  if (params.cursor) {
    query = query.lt("replaced_at", params.cursor);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data as DocumentVersionRow[] | null) ?? [];
};

export const getVersionById = async (
  versionId: string,
): Promise<DocumentVersionRow | null> => {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin
    .from("document_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(error.message);
  }

  return (data as DocumentVersionRow | null) ?? null;
};

export const cleanupExpiredPrunedMetadata = async (params: {
  workspaceId?: string;
  documentId?: string;
}): Promise<number> => {
  const admin = createSupabaseServiceClient();
  const thresholdIso = new Date(
    Date.now() - 365 * 24 * 60 * 60 * 1000,
  ).toISOString();

  let query = admin
    .from("document_versions")
    .delete()
    .eq("state", "pruned")
    .lt("pruned_at", thresholdIso);

  if (params.workspaceId) {
    query = query.eq("workspace_id", params.workspaceId);
  }
  if (params.documentId) {
    query = query.eq("document_id", params.documentId);
  }

  const { data, error } = await query.select("id");
  if (error) {
    throwVersioningRepositoryError(
      error,
      "Failed to clean up expired version metadata",
    );
  }

  return data?.length ?? 0;
};

export const getWorkspaceStorageUsedBytes = async (
  workspaceId: string,
): Promise<number> => {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin
    .from("workspace_storage_current")
    .select("storage_used_bytes")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(error.message);
  }

  return data?.storage_used_bytes ?? 0;
};

export const getWorkspacePlanId = async (
  workspaceId: string,
): Promise<string | null> => {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin
    .from("workspace_subscriptions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(error.message);
  }

  const subscription = mapWorkspaceSubscriptionRow(
    (data as Tables<"workspace_subscriptions"> | null) ?? null,
  );
  return hasEntitlementNow(subscription)
    ? (subscription?.planId ?? null)
    : null;
};

export const computeConflictMap = (params: {
  files: Array<{
    clientFileKey: string;
    relativePath: string;
    filename: string;
  }>;
  baseFolderId: string | null;
  existingFolders: FolderRow[];
  existingDocuments: Array<
    Pick<Tables<"documents">, "id" | "folder_id" | "title">
  >;
}): {
  conflicts: Array<{
    clientFileKey: string;
    existingDocumentId: string;
    existingTitle: string;
    destinationFolderId: string | null;
  }>;
  nonConflicts: Array<{
    clientFileKey: string;
    destinationFolderId: string | null;
  }>;
} => {
  const folderByParentAndName = new Map<string, string>();
  for (const folder of params.existingFolders) {
    const key = `${folder.parent_folder_id ?? "root"}|${normalizeName(folder.name)}`;
    folderByParentAndName.set(key, folder.id);
  }

  const destinationFolderForFile = (file: {
    relativePath: string;
  }): string | null => {
    const segments = file.relativePath.split("/").filter(Boolean).slice(0, -1);

    let parentId: string | null = params.baseFolderId;
    for (const segment of segments) {
      const key = `${parentId ?? "root"}|${normalizeName(segment)}`;
      const match = folderByParentAndName.get(key);
      if (!match) {
        return null;
      }
      parentId = match;
    }
    return parentId;
  };

  const docByFolderAndTitle = new Map<
    string,
    Pick<Tables<"documents">, "id" | "folder_id" | "title">
  >();
  for (const doc of params.existingDocuments) {
    const key = `${doc.folder_id ?? "root"}|${normalizeName(doc.title)}`;
    if (!docByFolderAndTitle.has(key)) {
      docByFolderAndTitle.set(key, doc);
    }
  }

  const conflicts: Array<{
    clientFileKey: string;
    existingDocumentId: string;
    existingTitle: string;
    destinationFolderId: string | null;
  }> = [];
  const nonConflicts: Array<{
    clientFileKey: string;
    destinationFolderId: string | null;
  }> = [];

  for (const file of params.files) {
    const destinationFolderId = destinationFolderForFile(file);
    const key = `${destinationFolderId ?? "root"}|${normalizeName(file.filename)}`;
    const existing = docByFolderAndTitle.get(key);

    if (existing) {
      conflicts.push({
        clientFileKey: file.clientFileKey,
        existingDocumentId: existing.id,
        existingTitle: existing.title,
        destinationFolderId,
      });
      continue;
    }

    nonConflicts.push({
      clientFileKey: file.clientFileKey,
      destinationFolderId,
    });
  }

  return { conflicts, nonConflicts };
};
