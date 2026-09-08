import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/generated/supabase";

const BLOCKING_CONVERSION_STATUSES = new Set(["pending", "in_progress"]);

export const isDocumentMetadataMutationBlocked = (
  conversionStatus: string | null | undefined,
): boolean =>
  typeof conversionStatus === "string" &&
  BLOCKING_CONVERSION_STATUSES.has(conversionStatus);

export const normalizeDocumentTitle = (title: string): string =>
  title.trim().toLowerCase();

const SIBLING_TITLE_CANDIDATE_LIMIT = 20;

type SiblingTitleConflictResult =
  { ok: true; hasConflict: boolean } | { ok: false; error: unknown };

/**
 * Duplicate-title check shared by move and rename. The ILIKE filter narrows
 * the candidate set in the database, so a folder larger than PostgREST's
 * max-rows page cannot hide a conflict; wildcard characters in a title only
 * widen the candidates, and the normalized comparison decides. This check is
 * advisory — without a DB unique index, two concurrent mutations can still
 * both pass it (rename maps 23505 for the day such an index exists).
 */
export const findSiblingTitleConflict = async (options: {
  client: SupabaseClient<Database>;
  workspaceId: string;
  dataRoomId: string | null;
  folderId: string | null;
  excludeDocumentId: string;
  title: string;
}): Promise<SiblingTitleConflictResult> => {
  const normalizedTitle = normalizeDocumentTitle(options.title);

  let query = options.client
    .from("documents")
    .select("id, title")
    .eq("workspace_id", options.workspaceId)
    .neq("id", options.excludeDocumentId)
    .ilike("title", normalizedTitle);
  query = options.dataRoomId
    ? query.eq("data_room_id", options.dataRoomId)
    : query.is("data_room_id", null);
  query = options.folderId
    ? query.eq("folder_id", options.folderId)
    : query.is("folder_id", null);

  const { data, error } = await query.limit(SIBLING_TITLE_CANDIDATE_LIMIT);
  if (error) return { ok: false, error };

  return {
    ok: true,
    hasConflict: (data ?? []).some(
      (sibling) =>
        normalizeDocumentTitle(sibling.title ?? "") === normalizedTitle,
    ),
  };
};
