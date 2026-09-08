import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";

export const hasWorkspaceEntitlement = async (
  workspaceId: string | null | undefined,
): Promise<boolean> => {
  if (!workspaceId) return false;

  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase.rpc("workspace_has_entitlement", {
      ws: workspaceId,
    });
    if (error) {
      console.error("[entitlement] workspace_has_entitlement failed", error);
      return false;
    }
    return Boolean(data);
  } catch (err) {
    console.error("[entitlement] workspace entitlement check failed", err);
    return false;
  }
};
