import { cache } from "react";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import type { Tables, TablesInsert } from "@/types/generated/supabase";
import {
  DEFAULT_PUBLIC_LANGUAGE,
  normalizePublicLanguage,
  normalizePublicLanguageOverride,
  type PublicLanguage,
} from "@/modules/public-links/types";

type WorkspacePublicSettingsRow = Tables<"workspace_public_settings">;

const getWorkspacePublicSettingsRow = async (
  workspaceId: string,
): Promise<WorkspacePublicSettingsRow | null> => {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin
    .from("workspace_public_settings")
    .select(
      "workspace_id,default_public_language,updated_by,created_at,updated_at",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(error.message);
  }

  return (data as WorkspacePublicSettingsRow | null) ?? null;
};

export const ensureWorkspacePublicSettings = async (
  workspaceId: string,
): Promise<WorkspacePublicSettingsRow> => {
  const existing = await getWorkspacePublicSettingsRow(workspaceId);
  if (existing) return existing;

  const admin = createSupabaseServiceClient();
  const payload: TablesInsert<"workspace_public_settings"> = {
    workspace_id: workspaceId,
    default_public_language: DEFAULT_PUBLIC_LANGUAGE,
  };

  const { data, error } = await admin
    .from("workspace_public_settings")
    .insert(payload)
    .select(
      "workspace_id,default_public_language,updated_by,created_at,updated_at",
    )
    .single();

  if (error?.code === "23505") {
    const collided = await getWorkspacePublicSettingsRow(workspaceId);
    if (collided) return collided;
  }

  if (error || !data) {
    throw new Error(
      error?.message ?? "Failed to ensure workspace public settings",
    );
  }

  return data as WorkspacePublicSettingsRow;
};

const getWorkspaceDefaultPublicLanguage = async (
  workspaceId: string,
): Promise<PublicLanguage> => {
  const settings = await ensureWorkspacePublicSettings(workspaceId);
  return normalizePublicLanguage(settings.default_public_language);
};

export const updateWorkspaceDefaultPublicLanguage = async (params: {
  workspaceId: string;
  defaultPublicLanguage: PublicLanguage;
  updatedBy: string;
}): Promise<WorkspacePublicSettingsRow> => {
  const admin = createSupabaseServiceClient();
  const payload: TablesInsert<"workspace_public_settings"> = {
    workspace_id: params.workspaceId,
    default_public_language: params.defaultPublicLanguage,
    updated_by: params.updatedBy,
  };

  const { data, error } = await admin
    .from("workspace_public_settings")
    .upsert(payload, { onConflict: "workspace_id" })
    .select(
      "workspace_id,default_public_language,updated_by,created_at,updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error(
      error?.message ?? "Failed to update workspace public settings",
    );
  }

  return data as WorkspacePublicSettingsRow;
};

export const resolveEffectivePublicLanguage = async (params: {
  workspaceId: string;
  linkPublicLanguageOverride?: unknown;
}): Promise<PublicLanguage> => {
  const override = normalizePublicLanguageOverride(
    params.linkPublicLanguageOverride,
  );
  if (override) return override;
  return getWorkspaceDefaultPublicLanguage(params.workspaceId);
};

export const getEffectivePublicLanguageForLink = cache(
  async (params: {
    linkId: string;
    documentId?: string;
    dataRoomId?: string;
  }): Promise<PublicLanguage> => {
    const admin = createSupabaseServiceClient();
    const { data, error } = await admin
      .from("links")
      .select(
        "id,workspace_id,document_id,data_room_id,public_language_override",
      )
      .eq("id", params.linkId)
      .maybeSingle();

    if (error || !data) {
      return DEFAULT_PUBLIC_LANGUAGE;
    }

    if (params.documentId && data.document_id !== params.documentId) {
      return DEFAULT_PUBLIC_LANGUAGE;
    }

    if (params.dataRoomId && data.data_room_id !== params.dataRoomId) {
      return DEFAULT_PUBLIC_LANGUAGE;
    }

    return resolveEffectivePublicLanguage({
      workspaceId: data.workspace_id,
      linkPublicLanguageOverride: data.public_language_override,
    });
  },
);
