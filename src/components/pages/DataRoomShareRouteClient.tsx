"use client";

import React from "react";
import DataRoomShareClient from "@/components/pages/DataRoomShareClient";
import { useDataRoom } from "@/modules/data-rooms/DataRoomProvider";

const DataRoomShareRouteClient: React.FC = () => {
  const { dataRoom } = useDataRoom();
  return (
    <div className="min-w-0">
      <DataRoomShareClient dataRoom={dataRoom} />
    </div>
  );
};

export default DataRoomShareRouteClient;
