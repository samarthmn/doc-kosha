import type { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import type { LinkAlcGroupRuleRows } from "../types";

type SupabaseClient = ReturnType<typeof createSupabaseBrowserClient>;

/**
 * The group half of fetchLinkAlcRules: the raw group-rule rows for one link.
 * Rows are returned untrimmed/undeduped — the core merge applies the exact
 * same normalization it applies to email rows. Throws on any query error so
 * the management UI surfaces the failure instead of showing partial rules.
 */
export const fetchLinkAlcGroupRules = async (
  supabase: SupabaseClient,
  linkId: string,
): Promise<LinkAlcGroupRuleRows> => {
  const [
    { data: roomGroupRows, error: roomGroupError },
    { data: folderGroupRows, error: folderGroupError },
    { data: docGroupRows, error: docGroupError },
  ] = await Promise.all([
    supabase
      .from("link_alc_allowed_groups")
      .select("group_id")
      .eq("link_id", linkId),
    supabase
      .from("link_alc_allowed_folders_groups")
      .select("folder_id, group_id")
      .eq("link_id", linkId),
    supabase
      .from("link_alc_allowed_documents_groups")
      .select("document_id, group_id")
      .eq("link_id", linkId),
  ]);

  const anyError = roomGroupError || folderGroupError || docGroupError;
  if (anyError) {
    console.error("[link-alc-client] group rules fetch failed", {
      linkId,
      roomGroupError,
      folderGroupError,
      docGroupError,
    });
    throw anyError;
  }

  return {
    roomGroupIds: (roomGroupRows ?? []).map((row) => row.group_id),
    folderGroupRows: (folderGroupRows ?? []).map((row) => ({
      folderId: row.folder_id,
      groupId: row.group_id,
    })),
    documentGroupRows: (docGroupRows ?? []).map((row) => ({
      documentId: row.document_id,
      groupId: row.group_id,
    })),
  };
};
