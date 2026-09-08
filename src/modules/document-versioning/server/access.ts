import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { DocumentVersioningError } from "./errors";

export const requireAuthenticatedUser = async (): Promise<{ id: string }> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new DocumentVersioningError("unauthorized", "Unauthorized");
  }

  return { id: user.id };
};

export const canReadWorkspace = async (
  workspaceId: string,
  userId: string,
): Promise<boolean> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(data);
};

export const canEditDocumentsScope = async (params: {
  workspaceId: string;
  dataRoomId: string | null;
}): Promise<boolean> => {
  const supabase = await createSupabaseServerClient();

  if (params.dataRoomId) {
    const { data, error } = await supabase.rpc("can_edit_data_room", {
      ws: params.workspaceId,
      room_id: params.dataRoomId,
    });
    return !error && Boolean(data);
  }

  const { data, error } = await supabase.rpc("can_edit_workspace_documents", {
    ws: params.workspaceId,
  });
  return !error && Boolean(data);
};

export const isWorkspaceOwner = async (
  workspaceId: string,
  userId: string,
): Promise<boolean> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("workspaces")
    .select("created_by")
    .eq("id", workspaceId)
    .maybeSingle();

  return Boolean(data?.created_by && data.created_by === userId);
};
