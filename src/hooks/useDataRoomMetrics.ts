import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";

interface DataRoomMetrics {
  totalViews: number;
  uniqueViews: number;
  totalTimeMs: number;
  totalDownloads: number;
  feedbackCount: number;
  qaCount: number;
}

export function useDataRoomMetrics(
  workspaceId: string | null,
  dataRoomIds: string[],
) {
  const [metrics, setMetrics] = useState<Record<string, DataRoomMetrics>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId || !dataRoomIds.length) {
      setMetrics({});
      setError(false);
      setHasLoaded(true);
      return;
    }

    setIsLoading(true);
    const supabase = createSupabaseBrowserClient();
    try {
      const acc: Record<string, DataRoomMetrics> = {};
      dataRoomIds.forEach((id) => {
        acc[id] = {
          totalViews: 0,
          uniqueViews: 0,
          totalTimeMs: 0,
          totalDownloads: 0,
          feedbackCount: 0,
          qaCount: 0,
        };
      });

      const { data, error: rpcError } = await supabase.rpc(
        "get_data_room_metrics_v2",
        {
          p_workspace_id: workspaceId,
          p_data_room_ids: dataRoomIds,
          p_from_ts: undefined,
          p_to_ts: undefined,
        },
      );

      if (rpcError) {
        console.error(
          "Failed to fetch analytics v2 data room metrics",
          rpcError,
        );
        setMetrics(acc);
        setError(true);
        return;
      }

      (data ?? []).forEach((row) => {
        const roomId = (row as { data_room_id?: string | null }).data_room_id;
        if (!roomId || !acc[roomId]) return;
        const totalViews = Number(
          (row as { total_views?: number | null }).total_views ?? 0,
        );
        const uniqueViews = Number(
          (row as { unique_views?: number | null }).unique_views ?? 0,
        );
        const totalTimeMs = Number(
          (row as { total_time_ms?: number | null }).total_time_ms ?? 0,
        );
        const totalDownloads = Number(
          (row as { total_downloads?: number | null }).total_downloads ?? 0,
        );
        acc[roomId].totalViews = totalViews;
        acc[roomId].uniqueViews = uniqueViews;
        acc[roomId].totalTimeMs = totalTimeMs;
        acc[roomId].totalDownloads = totalDownloads;
      });

      setMetrics(acc);
      setError(false);
    } catch (e) {
      console.error("Unexpected error loading data room metrics", e);
      setError(true);
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, [dataRoomIds, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { metrics, isLoading, hasLoaded, error, refetch: load };
}
