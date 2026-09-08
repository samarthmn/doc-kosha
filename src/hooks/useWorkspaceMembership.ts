import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";

type AccessLevel = "none" | "viewer" | "editor";

type WorkspaceMembership = {
  isOwner: boolean;
  documentsAccess: AccessLevel;
  dataRoomsAccessAll: AccessLevel;
};

type UseWorkspaceMembershipResult = {
  membership: WorkspaceMembership | null;
  isLoading: boolean;
};

export const useWorkspaceMembership = (
  workspaceId?: string | null,
): UseWorkspaceMembershipResult => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [membership, setMembership] = useState<WorkspaceMembership | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState<boolean>(!!workspaceId);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!workspaceId) {
        setMembership(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setMembership(null);
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

      if (workspaceError || !workspace) {
        setMembership(null);
        setIsLoading(false);
        return;
      }

      const isOwner = workspace.created_by === user.id;

      const { data, error } = await supabase
        .from("workspace_members")
        .select("documents_access, data_rooms_access_all")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setMembership(null);
        setIsLoading(false);
        return;
      }

      const documentsAccess: AccessLevel = isOwner
        ? "editor"
        : (data.documents_access ?? "none");
      const dataRoomsAccessAll: AccessLevel = isOwner
        ? "editor"
        : (data.data_rooms_access_all ?? "none");

      setMembership({ isOwner, documentsAccess, dataRoomsAccessAll });
      setIsLoading(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [supabase, workspaceId]);

  return { membership, isLoading };
};
