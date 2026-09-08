import React from "react";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { DataRoomProvider } from "@/modules/data-rooms/DataRoomProvider";
import type { Tables } from "@/types/generated/supabase";

type Params = { dataRoomId: string };

const DataRoomLayout: React.FC<
  React.PropsWithChildren<{ params: Promise<Params> }>
> = async ({ children, params }) => {
  const p = (await params) as Params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    redirect("/auth/sign-in");
  }

  const { data: dataRoom, error } = await supabase
    .from("data_rooms")
    .select("*")
    .eq("id", p.dataRoomId)
    .maybeSingle();

  if (error || !dataRoom) {
    notFound();
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, created_by")
    .eq("id", dataRoom.workspace_id)
    .maybeSingle();

  if (workspaceError || !workspace) {
    notFound();
  }

  const isOwner = workspace.created_by === user.id;

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("data_rooms_access_all")
    .eq("workspace_id", dataRoom.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if ((membershipError || !membership) && !isOwner) {
    notFound();
  }

  const hasAllDataRooms =
    isOwner || (membership?.data_rooms_access_all ?? "none") !== "none";

  if (!isOwner && !hasAllDataRooms) {
    const { data: explicitAccess, error: explicitAccessError } = await supabase
      .from("data_room_members")
      .select("access_level")
      .eq("workspace_id", dataRoom.workspace_id)
      .eq("data_room_id", dataRoom.id)
      .eq("user_id", user.id)
      .maybeSingle();

    const level = explicitAccess?.access_level ?? "none";
    if (explicitAccessError || level === "none") {
      notFound();
    }
  }

  return (
    <DataRoomProvider dataRoom={dataRoom as Tables<"data_rooms">}>
      {children}
    </DataRoomProvider>
  );
};

export default DataRoomLayout;
