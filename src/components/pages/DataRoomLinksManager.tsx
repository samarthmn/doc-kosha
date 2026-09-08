"use client";

import React from "react";
import type { Tables } from "@/types/generated/supabase";
import LinksManagerCard from "@/components/links/LinksManagerCard";

interface DataRoomLinksManagerProps {
  dataRoom: Tables<"data_rooms">;
}

const DataRoomLinksManager: React.FC<DataRoomLinksManagerProps> = ({
  dataRoom,
}) => {
  return (
    <div className="min-w-0">
      <LinksManagerCard
        resourceType="data_room"
        resourceId={dataRoom.id}
        workspaceId={dataRoom.workspace_id}
        resourceName={dataRoom.name}
        defaultLinkName={`${dataRoom.name} link`}
        dataGuideCard="data-room-links-card"
        dataGuideNewButton="data-room-links-new-button"
        dataGuideList="data-room-links-list"
      />
    </div>
  );
};

export default DataRoomLinksManager;
