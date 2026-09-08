import type { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { normalizeEmail } from "@/lib/email";
import {
  fetchLinkAlcViewerGroupSeeds,
  hasLinkAlcGroupRules,
} from "@/modules/user-groups/server/alcGroupEvaluation";
import type { LinkAlcGroupViewerSeeds } from "@/modules/user-groups";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * The contribution an ABSENT groups hook makes to EVALUATION: the viewer
 * belongs to no groups and no group rule matches, so nothing is granted.
 *
 * Note this is deliberately not the same as "no group rules exist". Whether
 * rules EXIST is a row count on core tables and is answered in core by
 * `hasLinkAlcGroupRows` below, so a link restricted only by groups still
 * activates its access-control gate even when no group membership matches.
 * Treating existence as false would open the whole room instead.
 */
type LinkAlcViewerSeeds = {
  roomAllowed: boolean;
  allowedFolderSeedIds: Set<string>;
  allowedDocumentSeedIds: Set<string>;
  viewerGroupIds: string[];
};

type DataRoomFolderRow = {
  id: string;
  parent_folder_id: string | null;
  name?: string | null;
};

type DataRoomDocumentRow = {
  id: string;
  folder_id: string | null;
  title?: string | null;
};

const normalizeViewerEmail = (email: string): string => normalizeEmail(email);

const uniqueStrings = (values: Array<string | null | undefined>): string[] =>
  Array.from(
    new Set(
      values
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter(Boolean),
    ),
  );

const safeRowCount = (data: unknown): number =>
  Array.isArray(data) ? data.length : 0;

/**
 * Do any GROUP rows exist for this link?
 *
 * These are row counts on core migrations
 * (link_alc_allowed_groups and friends ship in 0006), they encode no group
 * semantics, and the invite route already reads the same table from core. If
 * Keeping this row count in the core evaluator ensures a group-restricted link
 * cannot skip access control.
 */
const hasLinkAlcGroupRows = async (
  supabase: ServiceClient,
  linkId: string,
): Promise<{ present: boolean; failed: boolean }> => {
  const results = await Promise.all([
    supabase
      .from("link_alc_allowed_groups" as never)
      .select("id")
      .eq("link_id", linkId)
      .limit(1),
    supabase
      .from("link_alc_allowed_folders_groups" as never)
      .select("id")
      .eq("link_id", linkId)
      .limit(1),
    supabase
      .from("link_alc_allowed_documents_groups" as never)
      .select("id")
      .eq("link_id", linkId)
      .limit(1),
  ]);
  const failed = results.some((result) => Boolean(result.error));
  if (failed) {
    console.error("[link-alc] group row existence check failed", { linkId });
  }
  return {
    present: results.some((result) => safeRowCount(result.data) > 0),
    failed,
  };
};

export const isLinkAlcActive = async (
  supabase: ServiceClient,
  linkId: string,
): Promise<boolean> => {
  const groupRowCheck = hasLinkAlcGroupRows(supabase, linkId);

  const emailChecks = Promise.all([
    supabase
      .from("link_alc_allowed_emails" as never)
      .select("id")
      .eq("link_id", linkId)
      .limit(1),
    supabase
      .from("link_alc_allowed_folders_emails" as never)
      .select("id")
      .eq("link_id", linkId)
      .limit(1),
    supabase
      .from("link_alc_allowed_documents_emails" as never)
      .select("id")
      .eq("link_id", linkId)
      .limit(1),
  ]);

  // Existence of group rules is answered by core row counts; the group module
  // may refine the answer but can never turn existing rows into "no rules".
  const groupRows = await groupRowCheck;
  let hasGroupRules = groupRows.present;
  let groupCheckFailed = groupRows.failed;
  try {
    hasGroupRules =
      hasGroupRules || (await hasLinkAlcGroupRules(supabase, linkId));
  } catch (error) {
    console.error("[link-alc] group rule status check threw", {
      linkId,
      error,
    });
    groupCheckFailed = true;
  }

  const [roomEmails, folderEmails, docEmails] = await emailChecks;

  const anyError = roomEmails.error || folderEmails.error || docEmails.error;

  if (anyError || groupCheckFailed) {
    // Fail closed: treat as active so callers require email + deny unless evaluated.
    console.error("[link-alc] failed to check active status", {
      linkId,
      roomEmailsError: roomEmails.error,
      folderEmailsError: folderEmails.error,
      docEmailsError: docEmails.error,
      groupCheckFailed,
    });
    return true;
  }

  return (
    safeRowCount(roomEmails.data) > 0 ||
    safeRowCount(folderEmails.data) > 0 ||
    safeRowCount(docEmails.data) > 0 ||
    hasGroupRules
  );
};

export const fetchLinkAlcViewerSeeds = async (
  supabase: ServiceClient,
  params: { linkId: string; workspaceId: string; viewerEmail: string },
): Promise<LinkAlcViewerSeeds> => {
  const email = normalizeViewerEmail(params.viewerEmail);
  if (!email) {
    throw new Error("viewerEmail required");
  }

  const groupSeedsPromise: Promise<LinkAlcGroupViewerSeeds> =
    fetchLinkAlcViewerGroupSeeds(supabase, {
      linkId: params.linkId,
      workspaceId: params.workspaceId,
      viewerEmail: email,
    });

  const emailSeedsPromise = Promise.all([
    supabase
      .from("link_alc_allowed_emails" as never)
      .select("id")
      .eq("link_id", params.linkId)
      .eq("email", email)
      .limit(1),
    supabase
      .from("link_alc_allowed_folders_emails" as never)
      .select("folder_id")
      .eq("link_id", params.linkId)
      .eq("email", email),
    supabase
      .from("link_alc_allowed_documents_emails" as never)
      .select("document_id")
      .eq("link_id", params.linkId)
      .eq("email", email),
  ]);

  const [groupSeeds, [roomEmailRes, folderEmailRes, docEmailRes]] =
    await Promise.all([groupSeedsPromise, emailSeedsPromise]);

  const anyError =
    roomEmailRes.error || folderEmailRes.error || docEmailRes.error;

  if (anyError) {
    console.error("[link-alc] failed to load viewer seeds", {
      linkId: params.linkId,
      workspaceId: params.workspaceId,
      roomEmailError: roomEmailRes.error,
      folderEmailError: folderEmailRes.error,
      docEmailError: docEmailRes.error,
    });
    throw roomEmailRes.error || folderEmailRes.error || docEmailRes.error;
  }

  const roomAllowed =
    safeRowCount(roomEmailRes.data) > 0 || groupSeeds.roomMatched;

  const allowedFolderSeedIds = new Set(
    uniqueStrings(
      [
        ...(
          (folderEmailRes.data ?? []) as Array<{ folder_id?: string | null }>
        ).map((row) => row.folder_id),
        ...groupSeeds.folderIds,
      ].map((value) => value ?? ""),
    ),
  );

  const allowedDocumentSeedIds = new Set(
    uniqueStrings(
      [
        ...(
          (docEmailRes.data ?? []) as Array<{ document_id?: string | null }>
        ).map((row) => row.document_id),
        ...groupSeeds.documentIds,
      ].map((value) => value ?? ""),
    ),
  );

  return {
    roomAllowed,
    allowedFolderSeedIds,
    allowedDocumentSeedIds,
    viewerGroupIds: groupSeeds.viewerGroupIds,
  };
};

const buildFolderMaps = (folders: DataRoomFolderRow[]) => {
  const byId = new Map<string, DataRoomFolderRow>();
  const childrenByParent = new Map<string | null, string[]>();

  for (const f of folders) {
    if (!f?.id) continue;
    byId.set(f.id, f);
    const parent = f.parent_folder_id ?? null;
    const children = childrenByParent.get(parent) ?? [];
    children.push(f.id);
    childrenByParent.set(parent, children);
  }

  return { byId, childrenByParent };
};

const collectAncestorIds = (
  folderId: string,
  folderById: Map<string, DataRoomFolderRow>,
): string[] => {
  const result: string[] = [];
  let current: string | null = folderId;
  const seen = new Set<string>();

  while (current) {
    if (seen.has(current)) break;
    seen.add(current);
    result.push(current);
    const parent: string | null =
      folderById.get(current)?.parent_folder_id ?? null;
    current = parent;
  }

  return result;
};

const collectDescendantIds = (
  folderId: string,
  childrenByParent: Map<string | null, string[]>,
): string[] => {
  const result: string[] = [];
  const stack: string[] = [folderId];
  const seen = new Set<string>();

  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) continue;
    if (seen.has(next)) continue;
    seen.add(next);
    result.push(next);
    const children = childrenByParent.get(next) ?? [];
    for (const child of children) {
      stack.push(child);
    }
  }

  return result;
};

export const filterDataRoomContentByAlc = <
  TF extends DataRoomFolderRow,
  TD extends DataRoomDocumentRow,
>(params: {
  folders: TF[];
  documents: TD[];
  roomAllowed: boolean;
  allowedFolderSeedIds: Set<string>;
  allowedDocumentSeedIds: Set<string>;
}): {
  allowedFolderIds: Set<string>;
  allowedDocumentIds: Set<string>;
  filteredFolders: TF[];
  filteredDocuments: TD[];
} => {
  if (params.roomAllowed) {
    const allowedFolderIds = new Set(
      params.folders.map((f) => f.id).filter(Boolean),
    );
    const allowedDocumentIds = new Set(
      params.documents.map((d) => d.id).filter(Boolean),
    );
    return {
      allowedFolderIds,
      allowedDocumentIds,
      filteredFolders: params.folders,
      filteredDocuments: params.documents,
    };
  }

  const { byId: folderById, childrenByParent } = buildFolderMaps(
    params.folders,
  );

  // 1) Descendants of allowed folders (recursive allow).
  const allowedFolderDescendants = new Set<string>();
  for (const seedFolderId of params.allowedFolderSeedIds) {
    for (const id of collectDescendantIds(seedFolderId, childrenByParent)) {
      allowedFolderDescendants.add(id);
    }
  }

  // 2) Allowed documents = explicit doc rules + docs in allowed folder descendants.
  const allowedDocumentIds = new Set<string>(
    Array.from(params.allowedDocumentSeedIds),
  );
  for (const doc of params.documents) {
    if (!doc?.id) continue;
    const folderId = doc.folder_id ?? null;
    if (folderId && allowedFolderDescendants.has(folderId)) {
      allowedDocumentIds.add(doc.id);
    }
  }

  // 3) Allowed folders include:
  // - descendants (so nested folder navigation works)
  // - ancestors of seed folders (so the tree path is visible)
  // - ancestors of folders containing allowed docs (so doc navigation works)
  const allowedFolderIds = new Set<string>(
    Array.from(allowedFolderDescendants),
  );

  for (const seedFolderId of params.allowedFolderSeedIds) {
    for (const id of collectAncestorIds(seedFolderId, folderById)) {
      allowedFolderIds.add(id);
    }
  }

  for (const doc of params.documents) {
    if (!doc?.id) continue;
    if (!allowedDocumentIds.has(doc.id)) continue;
    const folderId = doc.folder_id ?? null;
    if (!folderId) continue;
    for (const id of collectAncestorIds(folderId, folderById)) {
      allowedFolderIds.add(id);
    }
  }

  const filteredFolders = params.folders.filter((f) =>
    allowedFolderIds.has(f.id),
  );
  const filteredDocuments = params.documents.filter((d) =>
    allowedDocumentIds.has(d.id),
  );

  return {
    allowedFolderIds,
    allowedDocumentIds,
    filteredFolders,
    filteredDocuments,
  };
};

export const isAlcSeedEmpty = (
  seeds: Pick<
    LinkAlcViewerSeeds,
    "roomAllowed" | "allowedFolderSeedIds" | "allowedDocumentSeedIds"
  >,
): boolean =>
  !seeds.roomAllowed &&
  seeds.allowedFolderSeedIds.size === 0 &&
  seeds.allowedDocumentSeedIds.size === 0;
