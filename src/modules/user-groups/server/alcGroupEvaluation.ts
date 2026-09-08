import { normalizeEmail } from "@/lib/email";
import type { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import type { LinkAlcGroupViewerSeeds } from "../types";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

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
 * The group half of isLinkAlcActive. Throws on any query error so the core
 * evaluator fails closed (treats ALC as active).
 */
export const hasLinkAlcGroupRules = async (
  supabase: ServiceClient,
  linkId: string,
): Promise<boolean> => {
  const [roomGroups, folderGroups, docGroups] = await Promise.all([
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

  const anyError = roomGroups.error || folderGroups.error || docGroups.error;
  if (anyError) {
    console.error("[link-alc] failed to check group rule status", {
      linkId,
      roomGroupsError: roomGroups.error,
      folderGroupsError: folderGroups.error,
      docGroupsError: docGroups.error,
    });
    throw anyError;
  }

  return (
    safeRowCount(roomGroups.data) > 0 ||
    safeRowCount(folderGroups.data) > 0 ||
    safeRowCount(docGroups.data) > 0
  );
};

const fetchViewerGroupIds = async (
  supabase: ServiceClient,
  params: { workspaceId: string; email: string },
): Promise<string[]> => {
  const { data, error } = await supabase
    .from("workspace_user_group_emails" as never)
    .select("group_id")
    .eq("workspace_id", params.workspaceId)
    .eq("email", params.email);

  if (error) {
    console.error("[link-alc] failed to load viewer group memberships", {
      workspaceId: params.workspaceId,
      error,
    });
    throw error;
  }

  return uniqueStrings(
    ((data ?? []) as Array<{ group_id?: string | null }>).map(
      (row) => row.group_id,
    ),
  );
};

/**
 * The group half of fetchLinkAlcViewerSeeds: resolve the viewer's group
 * memberships in the link's workspace, then the room/folder/document grants
 * those memberships earn. Throws on any query error so callers deny.
 */
export const fetchLinkAlcViewerGroupSeeds = async (
  supabase: ServiceClient,
  params: { linkId: string; workspaceId: string; viewerEmail: string },
): Promise<LinkAlcGroupViewerSeeds> => {
  const email = normalizeEmail(params.viewerEmail);
  if (!email) {
    throw new Error("viewerEmail required");
  }

  const viewerGroupIds = await fetchViewerGroupIds(supabase, {
    workspaceId: params.workspaceId,
    email,
  });

  if (viewerGroupIds.length === 0) {
    // A viewer in no groups matches no group rule; skip the rule queries
    // exactly as the pre-split evaluator did.
    return {
      viewerGroupIds: [],
      roomMatched: false,
      folderIds: [],
      documentIds: [],
    };
  }

  const [roomGroupRes, folderGroupRes, docGroupRes] = await Promise.all([
    supabase
      .from("link_alc_allowed_groups" as never)
      .select("id")
      .eq("link_id", params.linkId)
      .in("group_id", viewerGroupIds)
      .limit(1),
    supabase
      .from("link_alc_allowed_folders_groups" as never)
      .select("folder_id")
      .eq("link_id", params.linkId)
      .in("group_id", viewerGroupIds),
    supabase
      .from("link_alc_allowed_documents_groups" as never)
      .select("document_id")
      .eq("link_id", params.linkId)
      .in("group_id", viewerGroupIds),
  ]);

  const anyError =
    roomGroupRes.error || folderGroupRes.error || docGroupRes.error;
  if (anyError) {
    console.error("[link-alc] failed to load viewer group seeds", {
      linkId: params.linkId,
      workspaceId: params.workspaceId,
      roomGroupError: roomGroupRes.error,
      folderGroupError: folderGroupRes.error,
      docGroupError: docGroupRes.error,
    });
    throw anyError;
  }

  return {
    viewerGroupIds,
    roomMatched: safeRowCount(roomGroupRes.data) > 0,
    folderIds: (
      (folderGroupRes.data ?? []) as Array<{ folder_id?: string | null }>
    ).map((row) => row.folder_id ?? ""),
    documentIds: (
      (docGroupRes.data ?? []) as Array<{ document_id?: string | null }>
    ).map((row) => row.document_id ?? ""),
  };
};
