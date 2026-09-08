import DataRoomAccessClient from "@/components/pages/DataRoomAccessClient";
import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";

type Params = {
  dataRoomId: string;
};

const DataRoomAccessPage: React.FC<{ params: Promise<Params> }> = async ({
  params,
}) => {
  const p = (await params) as Params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    notFound();
  }

  const { data: dataRoom, error: dataRoomError } = await supabase
    .from("data_rooms")
    .select("id, workspace_id")
    .eq("id", p.dataRoomId)
    .maybeSingle();

  if (dataRoomError || !dataRoom) {
    notFound();
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, created_by")
    .eq("id", dataRoom.workspace_id)
    .maybeSingle();

  if (workspaceError || !workspace || workspace.created_by !== user.id) {
    notFound();
  }

  return <DataRoomAccessClient />;
};

export default DataRoomAccessPage;

export async function generateMetadata(
  { params }: { params: Promise<Params> },
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const p = (await params) as Params;
  return {
    title: `Access – ${p.dataRoomId}`,
    alternates: { canonical: `/data-rooms/${p.dataRoomId}/access` },
  };
}
