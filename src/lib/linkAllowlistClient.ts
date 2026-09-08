import { normalizeEmail } from "@/lib/email";
import type { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";

type SupabaseClient = ReturnType<typeof createSupabaseBrowserClient>;

export type LinkAccessRules = {
  allowedEmails: string[];
  blockedEmails: string[];
  allowedGroupIds: string[];
  blockedGroupIds: string[];
};

export type WorkspaceUserGroup = {
  id: string;
  name: string;
  emailCount: number;
};

export type LinkPresetSummary = {
  id: string;
  name: string;
  settingsJson: Record<string, unknown>;
};

export type LinkPresetDetails = LinkPresetSummary & LinkAccessRules;

export class LinkAccessRuleOverlapError extends Error {
  overlappingEmails: string[];

  constructor(overlappingEmails: string[]) {
    super(
      `Overlapping emails found in allowlist and blocklist: ${overlappingEmails
        .slice(0, 8)
        .join(", ")}${overlappingEmails.length > 8 ? "…" : ""}`,
    );
    this.name = "LinkAccessRuleOverlapError";
    this.overlappingEmails = overlappingEmails;
  }
}

const uniqueEmails = (emails: string[]): string[] =>
  Array.from(new Set(emails.map((email) => normalizeEmail(email)))).filter(
    (email) => !!email,
  );

const uniqueIds = (ids: string[]): string[] =>
  Array.from(new Set(ids.map((value) => value.trim()))).filter(
    (value) => !!value,
  );

const resolveGroupEmails = async (
  supabase: SupabaseClient,
  params: { workspaceId: string; groupIds: string[] },
): Promise<Map<string, Set<string>>> => {
  const groupIds = uniqueIds(params.groupIds);
  const result = new Map<string, Set<string>>();
  if (groupIds.length === 0) return result;

  const { data, error } = await supabase
    .from("workspace_user_group_emails" as never)
    .select("group_id, email")
    .eq("workspace_id", params.workspaceId)
    .in("group_id", groupIds);
  if (error) throw error;

  for (const row of (data ?? []) as Array<{
    group_id?: string | null;
    email?: string | null;
  }>) {
    const groupId = (row.group_id ?? "").trim();
    const email = normalizeEmail(row.email ?? "");
    if (!groupId || !email) continue;
    const current = result.get(groupId) ?? new Set<string>();
    current.add(email);
    result.set(groupId, current);
  }
  return result;
};

const assertNoOverlap = async (
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    allowedEmails: string[];
    blockedEmails: string[];
    allowedGroupIds: string[];
    blockedGroupIds: string[];
  },
): Promise<void> => {
  const allowedDirect = uniqueEmails(params.allowedEmails);
  const blockedDirect = uniqueEmails(params.blockedEmails);
  const allowedGroupIds = uniqueIds(params.allowedGroupIds);
  const blockedGroupIds = uniqueIds(params.blockedGroupIds);

  const hasAllowed = allowedDirect.length > 0 || allowedGroupIds.length > 0;
  const hasBlocked = blockedDirect.length > 0 || blockedGroupIds.length > 0;
  if (!hasAllowed || !hasBlocked) return;

  const emailOverlap = new Set<string>();
  const blockedDirectSet = new Set(blockedDirect);
  for (const email of allowedDirect) {
    if (blockedDirectSet.has(email)) emailOverlap.add(email);
  }

  if (allowedGroupIds.length > 0 || blockedGroupIds.length > 0) {
    const groupEmails = await resolveGroupEmails(supabase, {
      workspaceId: params.workspaceId,
      groupIds: [...allowedGroupIds, ...blockedGroupIds],
    });

    const allowedViaGroup = new Set<string>();
    for (const groupId of allowedGroupIds) {
      const emails = groupEmails.get(groupId);
      if (!emails) continue;
      for (const email of emails) allowedViaGroup.add(email);
    }

    const blockedViaGroup = new Set<string>();
    for (const groupId of blockedGroupIds) {
      const emails = groupEmails.get(groupId);
      if (!emails) continue;
      for (const email of emails) blockedViaGroup.add(email);
    }

    for (const email of allowedDirect) allowedViaGroup.add(email);
    for (const email of blockedDirect) blockedViaGroup.add(email);

    for (const email of allowedViaGroup) {
      if (blockedViaGroup.has(email)) emailOverlap.add(email);
    }
  }

  if (emailOverlap.size > 0) {
    const overlappingEmails = Array.from(emailOverlap).sort((a, b) =>
      a.localeCompare(b),
    );
    throw new LinkAccessRuleOverlapError(overlappingEmails);
  }
};

export const fetchLinkAccessRules = async (
  supabase: SupabaseClient,
  linkId: string,
): Promise<LinkAccessRules> => {
  const [
    { data: allowedEmailRows, error: allowedEmailError },
    { data: blockedEmailRows, error: blockedEmailError },
    { data: allowedGroupRows, error: allowedGroupError },
    { data: blockedGroupRows, error: blockedGroupError },
  ] = await Promise.all([
    supabase.from("link_allowed_emails").select("email").eq("link_id", linkId),
    supabase
      .from("link_blocked_emails" as never)
      .select("email")
      .eq("link_id", linkId),
    supabase
      .from("link_allowed_groups" as never)
      .select("group_id")
      .eq("link_id", linkId),
    supabase
      .from("link_blocked_groups" as never)
      .select("group_id")
      .eq("link_id", linkId),
  ]);

  if (
    allowedEmailError ||
    blockedEmailError ||
    allowedGroupError ||
    blockedGroupError
  ) {
    console.error("[link-access] fetch failed", {
      linkId,
      allowedEmailError,
      blockedEmailError,
      allowedGroupError,
      blockedGroupError,
    });
    throw (
      allowedEmailError ||
      blockedEmailError ||
      allowedGroupError ||
      blockedGroupError
    );
  }

  return {
    allowedEmails: uniqueEmails(
      (allowedEmailRows ?? [])
        .map((row) => (row as { email?: string | null }).email ?? "")
        .filter((email) => !!email),
    ),
    blockedEmails: uniqueEmails(
      ((blockedEmailRows ?? []) as Array<{ email?: string | null }>)
        .map((row) => row.email ?? "")
        .filter((email) => !!email),
    ),
    allowedGroupIds: uniqueIds(
      ((allowedGroupRows ?? []) as Array<{ group_id?: string | null }>)
        .map((row) => row.group_id ?? "")
        .filter((groupId) => !!groupId),
    ),
    blockedGroupIds: uniqueIds(
      ((blockedGroupRows ?? []) as Array<{ group_id?: string | null }>)
        .map((row) => row.group_id ?? "")
        .filter((groupId) => !!groupId),
    ),
  };
};

export const replaceLinkAccessRules = async (
  supabase: SupabaseClient,
  params: {
    linkId: string;
    workspaceId: string;
    allowedEmails: string[];
    blockedEmails: string[];
    allowedGroupIds: string[];
    blockedGroupIds: string[];
  },
): Promise<void> => {
  const normalizedBlockedEmails = uniqueEmails(params.blockedEmails);
  const normalizedAllowedEmails = uniqueEmails(params.allowedEmails).filter(
    (email) => !normalizedBlockedEmails.includes(email),
  );
  const normalizedBlockedGroups = uniqueIds(params.blockedGroupIds);
  const normalizedAllowedGroups = uniqueIds(params.allowedGroupIds).filter(
    (groupId) => !normalizedBlockedGroups.includes(groupId),
  );

  await assertNoOverlap(supabase, {
    workspaceId: params.workspaceId,
    allowedEmails: normalizedAllowedEmails,
    blockedEmails: normalizedBlockedEmails,
    allowedGroupIds: normalizedAllowedGroups,
    blockedGroupIds: normalizedBlockedGroups,
  });

  const { error } = await supabase.rpc(
    "replace_link_allowlist_rules" as never,
    {
      p_workspace_id: params.workspaceId,
      p_link_id: params.linkId,
      p_allowed_emails: normalizedAllowedEmails,
      p_blocked_emails: normalizedBlockedEmails,
      p_allowed_group_ids: normalizedAllowedGroups,
      p_blocked_group_ids: normalizedBlockedGroups,
    } as never,
  );
  if (error) throw error;
};

export const fetchWorkspaceUserGroups = async (
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<WorkspaceUserGroup[]> => {
  const [
    { data: groupRows, error: groupsError },
    { data: emailRows, error: emailsError },
  ] = await Promise.all([
    supabase
      .from("workspace_user_groups" as never)
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .order("name", { ascending: true }),
    supabase
      .from("workspace_user_group_emails" as never)
      .select("group_id")
      .eq("workspace_id", workspaceId),
  ]);

  if (groupsError || emailsError) {
    console.error("[workspace-groups] fetch failed", {
      workspaceId,
      groupsError,
      emailsError,
    });
    throw groupsError || emailsError;
  }

  const emailCounts = new Map<string, number>();
  for (const row of (emailRows ?? []) as Array<{ group_id?: string | null }>) {
    const groupId = row.group_id ?? null;
    if (!groupId) continue;
    emailCounts.set(groupId, (emailCounts.get(groupId) ?? 0) + 1);
  }

  return ((groupRows ?? []) as Array<{ id: string; name?: string | null }>).map(
    (row) => ({
      id: row.id,
      name: row.name || "Untitled group",
      emailCount: emailCounts.get(row.id) ?? 0,
    }),
  );
};

export const fetchWorkspaceUserGroupEmails = async (
  supabase: SupabaseClient,
  groupId: string,
): Promise<string[]> => {
  const { data, error } = await supabase
    .from("workspace_user_group_emails" as never)
    .select("email")
    .eq("group_id", groupId)
    .order("email", { ascending: true });

  if (error) throw error;
  return uniqueEmails(
    (data as Array<{ email?: string | null }> | null | undefined)?.map(
      (row) => row.email ?? "",
    ) ?? [],
  );
};

export const createWorkspaceUserGroup = async (
  supabase: SupabaseClient,
  params: { workspaceId: string; name: string; emails: string[] },
): Promise<{ id: string; name: string }> => {
  const trimmedName = params.name.trim();
  if (!trimmedName) {
    throw new Error("Group name is required");
  }

  const normalizedEmails = uniqueEmails(params.emails);
  const { data: userRes } = await supabase.auth.getUser();
  const createdBy = userRes?.user?.id ?? null;

  const { data: groupRow, error: groupError } = await supabase
    .from("workspace_user_groups" as never)
    .insert({
      workspace_id: params.workspaceId,
      name: trimmedName,
      created_by: createdBy,
    } as never)
    .select("id, name")
    .single();

  if (groupError) throw groupError;

  const group = groupRow as { id: string; name?: string | null };

  if (normalizedEmails.length > 0) {
    const { error: emailError } = await supabase
      .from("workspace_user_group_emails" as never)
      .insert(
        normalizedEmails.map((email) => ({
          workspace_id: params.workspaceId,
          group_id: group.id,
          email,
          created_by: createdBy,
        })) as never,
      );
    if (emailError) throw emailError;
  }

  return {
    id: group.id,
    name: group.name || trimmedName,
  };
};

export const updateWorkspaceUserGroup = async (
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    groupId: string;
    name: string;
    emails: string[];
  },
): Promise<void> => {
  const trimmedName = params.name.trim();
  if (!trimmedName) {
    throw new Error("Group name is required");
  }

  const normalizedEmails = uniqueEmails(params.emails);

  const { error } = await supabase.rpc(
    "update_workspace_user_group_atomic" as never,
    {
      p_workspace_id: params.workspaceId,
      p_group_id: params.groupId,
      p_name: trimmedName,
      p_emails: normalizedEmails,
    } as never,
  );
  if (error) throw error;
};

export const deleteWorkspaceUserGroup = async (
  supabase: SupabaseClient,
  params: { workspaceId: string; groupId: string },
): Promise<void> => {
  const { error } = await supabase
    .from("workspace_user_groups" as never)
    .delete()
    .eq("id", params.groupId)
    .eq("workspace_id", params.workspaceId);
  if (error) throw error;
};

export const fetchLinkPresetSummaries = async (
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<LinkPresetSummary[]> => {
  const { data, error } = await supabase
    .from("link_presets" as never)
    .select("id, name, settings_json")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });

  if (error) throw error;

  return (
    (data ?? []) as Array<{
      id: string;
      name?: string | null;
      settings_json?: unknown;
    }>
  ).map((row) => ({
    id: row.id,
    name: row.name || "Untitled preset",
    settingsJson:
      row.settings_json && typeof row.settings_json === "object"
        ? (row.settings_json as Record<string, unknown>)
        : {},
  }));
};

export const fetchLinkPresetDetails = async (
  supabase: SupabaseClient,
  presetId: string,
): Promise<LinkPresetDetails | null> => {
  const [
    { data: presetRow, error: presetError },
    { data: allowedEmailRows, error: allowedEmailError },
    { data: blockedEmailRows, error: blockedEmailError },
    { data: allowedGroupRows, error: allowedGroupError },
    { data: blockedGroupRows, error: blockedGroupError },
  ] = await Promise.all([
    supabase
      .from("link_presets" as never)
      .select("id, name, settings_json")
      .eq("id", presetId)
      .maybeSingle(),
    supabase
      .from("link_preset_allowed_emails" as never)
      .select("email")
      .eq("preset_id", presetId),
    supabase
      .from("link_preset_blocked_emails" as never)
      .select("email")
      .eq("preset_id", presetId),
    supabase
      .from("link_preset_allowed_groups" as never)
      .select("group_id")
      .eq("preset_id", presetId),
    supabase
      .from("link_preset_blocked_groups" as never)
      .select("group_id")
      .eq("preset_id", presetId),
  ]);

  if (
    presetError ||
    allowedEmailError ||
    blockedEmailError ||
    allowedGroupError ||
    blockedGroupError
  ) {
    throw (
      presetError ||
      allowedEmailError ||
      blockedEmailError ||
      allowedGroupError ||
      blockedGroupError
    );
  }

  if (!presetRow) return null;

  const preset = presetRow as {
    id: string;
    name?: string | null;
    settings_json?: unknown;
  };

  return {
    id: preset.id,
    name: preset.name || "Untitled preset",
    settingsJson:
      preset.settings_json && typeof preset.settings_json === "object"
        ? (preset.settings_json as Record<string, unknown>)
        : {},
    allowedEmails: uniqueEmails(
      ((allowedEmailRows ?? []) as Array<{ email?: string | null }>)
        .map((row) => row.email ?? "")
        .filter((email) => !!email),
    ),
    blockedEmails: uniqueEmails(
      ((blockedEmailRows ?? []) as Array<{ email?: string | null }>)
        .map((row) => row.email ?? "")
        .filter((email) => !!email),
    ),
    allowedGroupIds: uniqueIds(
      ((allowedGroupRows ?? []) as Array<{ group_id?: string | null }>)
        .map((row) => row.group_id ?? "")
        .filter((groupId) => !!groupId),
    ),
    blockedGroupIds: uniqueIds(
      ((blockedGroupRows ?? []) as Array<{ group_id?: string | null }>)
        .map((row) => row.group_id ?? "")
        .filter((groupId) => !!groupId),
    ),
  };
};

const replacePresetMembers = async (
  supabase: SupabaseClient,
  params: {
    presetId: string;
    workspaceId: string;
    allowedEmails: string[];
    blockedEmails: string[];
    allowedGroupIds: string[];
    blockedGroupIds: string[];
    createdBy: string | null;
  },
): Promise<void> => {
  const blockedEmails = uniqueEmails(params.blockedEmails);
  const allowedEmails = uniqueEmails(params.allowedEmails).filter(
    (email) => !blockedEmails.includes(email),
  );
  const blockedGroupIds = uniqueIds(params.blockedGroupIds);
  const allowedGroupIds = uniqueIds(params.allowedGroupIds).filter(
    (groupId) => !blockedGroupIds.includes(groupId),
  );

  await assertNoOverlap(supabase, {
    workspaceId: params.workspaceId,
    allowedEmails,
    blockedEmails,
    allowedGroupIds,
    blockedGroupIds,
  });

  const { error } = await supabase.rpc(
    "replace_link_preset_rules" as never,
    {
      p_workspace_id: params.workspaceId,
      p_preset_id: params.presetId,
      p_allowed_emails: allowedEmails,
      p_blocked_emails: blockedEmails,
      p_allowed_group_ids: allowedGroupIds,
      p_blocked_group_ids: blockedGroupIds,
    } as never,
  );
  if (error) throw error;
};

export const saveLinkPreset = async (
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    name: string;
    settingsJson: Record<string, unknown>;
    allowedEmails: string[];
    blockedEmails: string[];
    allowedGroupIds: string[];
    blockedGroupIds: string[];
  },
): Promise<{ id: string; name: string }> => {
  const trimmedName = params.name.trim();
  if (!trimmedName) {
    throw new Error("Preset name is required");
  }

  const { data, error } = await supabase.rpc(
    "upsert_link_preset" as never,
    {
      p_workspace_id: params.workspaceId,
      p_name: trimmedName,
      p_settings_json: params.settingsJson,
      p_allowed_emails: params.allowedEmails,
      p_blocked_emails: params.blockedEmails,
      p_allowed_group_ids: params.allowedGroupIds,
      p_blocked_group_ids: params.blockedGroupIds,
    } as never,
  );
  if (error) throw error;

  const saved = (Array.isArray(data) ? data[0] : data) as
    { id?: string | null; name?: string | null } | null | undefined;
  if (!saved?.id) {
    throw new Error("Failed to save preset");
  }

  return { id: saved.id, name: saved.name || trimmedName };
};

export const updateLinkPreset = async (
  supabase: SupabaseClient,
  params: {
    presetId: string;
    workspaceId: string;
    name?: string;
    settingsJson: Record<string, unknown>;
    allowedEmails: string[];
    blockedEmails: string[];
    allowedGroupIds: string[];
    blockedGroupIds: string[];
  },
): Promise<void> => {
  const trimmedName = params.name?.trim();
  if (trimmedName !== undefined && trimmedName.length === 0) {
    throw new Error("Preset name is required");
  }

  const updatePayload: Record<string, unknown> = {
    settings_json: params.settingsJson,
  };
  if (trimmedName !== undefined) updatePayload.name = trimmedName;

  const { error: updateError } = await supabase
    .from("link_presets" as never)
    .update(updatePayload as never)
    .eq("id", params.presetId)
    .eq("workspace_id", params.workspaceId);
  if (updateError) throw updateError;

  await replacePresetMembers(supabase, {
    presetId: params.presetId,
    workspaceId: params.workspaceId,
    allowedEmails: params.allowedEmails,
    blockedEmails: params.blockedEmails,
    allowedGroupIds: params.allowedGroupIds,
    blockedGroupIds: params.blockedGroupIds,
    createdBy: null,
  });
};

export const deleteLinkPreset = async (
  supabase: SupabaseClient,
  params: { presetId: string; workspaceId: string },
): Promise<void> => {
  const { error } = await supabase
    .from("link_presets" as never)
    .delete()
    .eq("id", params.presetId)
    .eq("workspace_id", params.workspaceId);
  if (error) throw error;
};
