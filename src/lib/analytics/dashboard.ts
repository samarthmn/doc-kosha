import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/generated/supabase";

type DashboardKPIs = {
  totalViews: number;
  uniqueViewers: number;
  totalDownloads: number;
};

export const getDashboardKPIs = async (
  supabase: SupabaseClient<Database>,
  workspaceId: string,
): Promise<DashboardKPIs> => {
  const { data, error } = await supabase.rpc("get_workspace_kpis_v2", {
    p_workspace_id: workspaceId,
    p_from_ts: undefined,
    p_to_ts: undefined,
  });

  if (error) throw error;

  const row = (data ?? [])[0] as
    | {
        total_views?: number | null;
        unique_viewers?: number | null;
        total_downloads?: number | null;
      }
    | undefined;

  const totalViews = Number(row?.total_views ?? 0);
  const uniqueViewers = Number(row?.unique_viewers ?? 0);
  const totalDownloads = Number(row?.total_downloads ?? 0);

  return {
    totalViews,
    uniqueViewers,
    totalDownloads,
  };
};

export type ActiveContent = {
  resourceId: string;
  resourceType: "document" | "data_room";
  title: string;
  totalViews: number;
  dataRoomName?: string | null;
};

export const getMostActiveContent = async (
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  limit = 5,
): Promise<ActiveContent[]> => {
  const { data, error } = await supabase.rpc(
    "get_workspace_most_active_documents_v2",
    {
      p_workspace_id: workspaceId,
      p_limit: limit,
      p_from_ts: undefined,
      p_to_ts: undefined,
    },
  );

  if (error) throw error;

  const docIds = (data ?? [])
    .map((row) => (row as { document_id?: string | null }).document_id)
    .filter((id): id is string => Boolean(id));

  const titlesMap = new Map<string, string>();
  const dataRoomIdMap = new Map<string, string>();
  const dataRoomNameMap = new Map<string, string>();

  if (docIds.length > 0) {
    const { data: docs } = await supabase
      .from("documents")
      .select("id, title, data_room_id")
      .in("id", docIds);

    const dataRoomIds: string[] = [];
    docs?.forEach((d) => {
      titlesMap.set(d.id, d.title);
      if (d.data_room_id) {
        dataRoomIdMap.set(d.id, d.data_room_id);
        dataRoomIds.push(d.data_room_id);
      }
    });

    if (dataRoomIds.length > 0) {
      const { data: rooms } = await supabase
        .from("data_rooms")
        .select("id, name")
        .in("id", dataRoomIds);
      rooms?.forEach((r) => dataRoomNameMap.set(r.id, r.name));
    }
  }

  const viewsByDocId = new Map<string, number>();
  (data ?? []).forEach((row) => {
    const docId = (row as { document_id?: string | null }).document_id;
    if (!docId) return;
    viewsByDocId.set(
      docId,
      Number((row as { total_views?: number | null }).total_views ?? 0),
    );
  });

  return docIds.map((docId) => {
    const drId = dataRoomIdMap.get(docId);
    const drName = drId ? dataRoomNameMap.get(drId) : null;
    return {
      resourceId: docId,
      resourceType: "document",
      title: titlesMap.get(docId) || "Unknown",
      totalViews: viewsByDocId.get(docId) ?? 0,
      dataRoomName: drName,
    };
  });
};

export type CountryStat = {
  countryCode: string;
  totalViews: number;
};

export const getTopCountriesByDocumentViews = async (
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  limit = 5,
): Promise<CountryStat[]> => {
  const { data, error } = await supabase.rpc("get_workspace_top_countries_v2", {
    p_workspace_id: workspaceId,
    p_limit: limit,
    p_from_ts: undefined,
    p_to_ts: undefined,
  });

  if (error) {
    console.warn("Failed to fetch country stats", error);
    return [];
  }

  return (
    data?.map((row) => ({
      countryCode: (row as { country_code?: string | null }).country_code ?? "",
      totalViews: Number(
        (row as { total_views?: number | null }).total_views ?? 0,
      ),
    })) ?? []
  );
};

export const getRecentDocuments = async (
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  limit = 5,
) => {
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, updated_at, file_type")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
};

export const getRecentDataRooms = async (
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  limit = 5,
) => {
  const { data, error } = await supabase
    .from("data_rooms")
    .select("id, name, created_at, description")
    .eq("workspace_id", workspaceId)
    .eq("is_disabled", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
};
