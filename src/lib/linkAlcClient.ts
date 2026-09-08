import { normalizeEmail } from "@/lib/email";
import { groups } from "@/modules/user-groups";
import type { LinkAlcGroupRuleRows } from "@/modules/user-groups";
import type { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";

type SupabaseClient = ReturnType<typeof createSupabaseBrowserClient>;

export type LinkAlcRoomRules = {
  allowedEmails: string[];
  allowedGroupIds: string[];
};

export type LinkAlcFolderRule = {
  folderId: string;
  allowedEmails: string[];
  allowedGroupIds: string[];
};

export type LinkAlcDocumentRule = {
  documentId: string;
  allowedEmails: string[];
  allowedGroupIds: string[];
};

export type LinkAlcRules = {
  room: LinkAlcRoomRules;
  folders: LinkAlcFolderRule[];
  documents: LinkAlcDocumentRule[];
};

const uniqueEmails = (emails: string[]): string[] =>
  Array.from(new Set(emails.map((email) => normalizeEmail(email)))).filter(
    Boolean,
  );

const uniqueIds = (values: string[]): string[] =>
  Array.from(new Set(values.map((v) => v.trim()))).filter(Boolean);

const groupById = <T extends { id: string }>(rows: T[]): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    if (!row?.id) continue;
    const existing = map.get(row.id) ?? [];
    existing.push(row);
    map.set(row.id, existing);
  }
  return map;
};

export const isLinkAlcRulesActive = (rules: LinkAlcRules): boolean => {
  return (
    rules.room.allowedEmails.length > 0 ||
    rules.room.allowedGroupIds.length > 0 ||
    rules.folders.length > 0 ||
    rules.documents.length > 0
  );
};

export const fetchLinkAlcRules = async (
  supabase: SupabaseClient,
  linkId: string,
): Promise<LinkAlcRules> => {
  const groupRulesPromise: Promise<LinkAlcGroupRuleRows> =
    groups.fetchLinkAlcGroupRules(supabase, linkId);

  const emailRowsPromise = Promise.all([
    supabase
      .from("link_alc_allowed_emails")
      .select("email")
      .eq("link_id", linkId),
    supabase
      .from("link_alc_allowed_folders_emails")
      .select("folder_id, email")
      .eq("link_id", linkId),
    supabase
      .from("link_alc_allowed_documents_emails")
      .select("document_id, email")
      .eq("link_id", linkId),
  ]);

  const [
    groupRules,
    [
      { data: roomEmailRows, error: roomEmailError },
      { data: folderEmailRows, error: folderEmailError },
      { data: docEmailRows, error: docEmailError },
    ],
  ] = await Promise.all([groupRulesPromise, emailRowsPromise]);

  if (roomEmailError || folderEmailError || docEmailError) {
    console.error("[link-alc-client] fetch failed", {
      linkId,
      roomEmailError,
      folderEmailError,
      docEmailError,
    });
    throw roomEmailError || folderEmailError || docEmailError;
  }

  const roomAllowedEmails = uniqueEmails(
    (roomEmailRows ?? []).map((row) => row.email),
  );
  const roomAllowedGroupIds = uniqueIds(groupRules.roomGroupIds);

  const folderEmailPairs = folderEmailRows ?? [];
  const folderGroupPairs = groupRules.folderGroupRows;

  const folderEmailRowsByFolder = groupById(
    folderEmailPairs
      .map((row) => ({
        id: row.folder_id.trim(),
        email: normalizeEmail(row.email),
      }))
      .filter((row) => row.id && row.email),
  );
  const folderGroupRowsByFolder = groupById(
    folderGroupPairs
      .map((row) => ({
        id: row.folderId.trim(),
        groupId: row.groupId.trim(),
      }))
      .filter((row) => row.id && row.groupId),
  );

  const folderIds = uniqueIds([
    ...folderEmailPairs.map((r) => r.folder_id),
    ...folderGroupPairs.map((r) => r.folderId),
  ]);

  const folderRules: LinkAlcFolderRule[] = folderIds.map((folderId) => ({
    folderId,
    allowedEmails: uniqueEmails(
      (folderEmailRowsByFolder.get(folderId) ?? []).map((r) => r.email),
    ),
    allowedGroupIds: uniqueIds(
      (folderGroupRowsByFolder.get(folderId) ?? []).map((r) => r.groupId),
    ),
  }));

  const docEmailPairs = docEmailRows ?? [];
  const docGroupPairs = groupRules.documentGroupRows;

  const docEmailRowsByDoc = groupById(
    docEmailPairs
      .map((row) => ({
        id: row.document_id.trim(),
        email: normalizeEmail(row.email),
      }))
      .filter((row) => row.id && row.email),
  );
  const docGroupRowsByDoc = groupById(
    docGroupPairs
      .map((row) => ({
        id: row.documentId.trim(),
        groupId: row.groupId.trim(),
      }))
      .filter((row) => row.id && row.groupId),
  );

  const documentIds = uniqueIds([
    ...docEmailPairs.map((r) => r.document_id),
    ...docGroupPairs.map((r) => r.documentId),
  ]);

  const documentRules: LinkAlcDocumentRule[] = documentIds.map(
    (documentId) => ({
      documentId,
      allowedEmails: uniqueEmails(
        (docEmailRowsByDoc.get(documentId) ?? []).map((r) => r.email),
      ),
      allowedGroupIds: uniqueIds(
        (docGroupRowsByDoc.get(documentId) ?? []).map((r) => r.groupId),
      ),
    }),
  );

  return {
    room: {
      allowedEmails: roomAllowedEmails,
      allowedGroupIds: roomAllowedGroupIds,
    },
    folders: folderRules
      .filter(
        (rule) =>
          rule.allowedEmails.length > 0 || rule.allowedGroupIds.length > 0,
      )
      .sort((a, b) => a.folderId.localeCompare(b.folderId)),
    documents: documentRules
      .filter(
        (rule) =>
          rule.allowedEmails.length > 0 || rule.allowedGroupIds.length > 0,
      )
      .sort((a, b) => a.documentId.localeCompare(b.documentId)),
  };
};

export const replaceLinkAlcRules = async (
  supabase: SupabaseClient,
  params: {
    linkId: string;
    workspaceId: string;
    rules: LinkAlcRules;
  },
): Promise<void> => {
  const payload = {
    room: {
      allowedEmails: uniqueEmails(params.rules.room.allowedEmails),
      allowedGroupIds: uniqueIds(params.rules.room.allowedGroupIds),
    },
    folders: (params.rules.folders ?? []).map((r) => ({
      folderId: r.folderId,
      allowedEmails: uniqueEmails(r.allowedEmails ?? []),
      allowedGroupIds: uniqueIds(r.allowedGroupIds ?? []),
    })),
    documents: (params.rules.documents ?? []).map((r) => ({
      documentId: r.documentId,
      allowedEmails: uniqueEmails(r.allowedEmails ?? []),
      allowedGroupIds: uniqueIds(r.allowedGroupIds ?? []),
    })),
  };

  const { error } = await supabase.rpc("replace_link_alc_rules", {
    p_workspace_id: params.workspaceId,
    p_link_id: params.linkId,
    p_payload: payload,
  });

  if (error) throw error;
};
