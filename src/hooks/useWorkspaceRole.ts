import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";

type WorkspaceRole = "owner" | "editor" | "viewer";

type UseWorkspaceRoleResult = {
  role: WorkspaceRole | null;
  isLoading: boolean;
};

export const useWorkspaceRole = (
  workspaceId?: string | null,
): UseWorkspaceRoleResult => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!!workspaceId);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!workspaceId) {
        setRole(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setRole(null);
          setIsLoading(false);
        }
        return;
      }

      if (cancelled) return;

      const { data: workspace, error: workspaceError } = await supabase
        .from("workspaces")
        .select("created_by")
        .eq("id", workspaceId)
        .maybeSingle();

      if (cancelled) return;

      if (workspaceError) {
        setRole(null);
        setIsLoading(false);
        return;
      }

      if (workspace?.created_by === user.id) {
        setRole("owner");
        setIsLoading(false);
        return;
      }

      const { data: memberRow, error: memberError } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (memberError) {
        setRole(null);
        setIsLoading(false);
        return;
      }

      setRole(memberRow ? "viewer" : null);
      setIsLoading(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [supabase, workspaceId]);

  return { role, isLoading };
};
