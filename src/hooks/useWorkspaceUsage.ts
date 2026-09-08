import { useCallback, useEffect, useState } from "react";

type WorkspaceUsage = {
  documentsCount: number;
  storageUsedBytes: number;
  dataRoomsCount: number;
  bandwidthUsedBytes: number;
};

export const useWorkspaceUsage = (workspaceId: string | null | undefined) => {
  const [usage, setUsage] = useState<WorkspaceUsage | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchUsage = useCallback(async () => {
    if (!workspaceId) {
      setUsage(null);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/settings/subscription-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) {
        console.error(
          "[workspace-usage] failed to load usage",
          await res.text(),
        );
        return;
      }
      const payload = (await res.json()) as WorkspaceUsage;
      setUsage(payload);
    } catch (err) {
      console.error("[workspace-usage] unexpected error", err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void fetchUsage();
  }, [fetchUsage]);

  return { usage, isLoading, refetch: fetchUsage };
};
