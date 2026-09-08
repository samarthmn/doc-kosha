import type { ComponentType } from "react";

import type { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import type { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";

export type LinkAlcGroupViewerSeeds = {
  viewerGroupIds: string[];
  roomMatched: boolean;
  folderIds: string[];
  documentIds: string[];
};

export type LinkAlcGroupRuleRows = {
  roomGroupIds: string[];
  folderGroupRows: Array<{ folderId: string; groupId: string }>;
  documentGroupRows: Array<{ documentId: string; groupId: string }>;
};

export type AlcGroupPickerProps = {
  label: string;
  userGroups: Array<{ id: string; name: string; emailCount: number }>;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

export type GroupServiceClient = ReturnType<typeof createSupabaseServiceClient>;
export type GroupBrowserClient = ReturnType<typeof createSupabaseBrowserClient>;

export type ClientGroupsFeature = {
  loadManagementComponent: () => Promise<{
    default: ComponentType<Record<string, never>>;
  }>;
  loadAlcGroupPicker: () => Promise<{
    default: ComponentType<AlcGroupPickerProps>;
  }>;
  fetchLinkAlcGroupRules: (
    supabase: GroupBrowserClient,
    linkId: string,
  ) => Promise<LinkAlcGroupRuleRows>;
};

export type ServerGroupsFeature = {
  hasLinkAlcGroupRules: (
    supabase: GroupServiceClient,
    linkId: string,
  ) => Promise<boolean>;
  fetchLinkAlcViewerGroupSeeds: (
    supabase: GroupServiceClient,
    params: { linkId: string; workspaceId: string; viewerEmail: string },
  ) => Promise<LinkAlcGroupViewerSeeds>;
};

export type GroupsFeature = ClientGroupsFeature & ServerGroupsFeature;
