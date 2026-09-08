"use client";

import React from "react";
import DataRoomAnalyticsClient from "@/components/pages/DataRoomAnalyticsClient";
import { useDataRoom } from "@/modules/data-rooms/DataRoomProvider";

const DataRoomAnalyticsRouteClient: React.FC = () => {
  const { dataRoom } = useDataRoom();
  return (
    <div className="min-w-0">
      <DataRoomAnalyticsClient dataRoom={dataRoom} />
    </div>
  );
};

export default DataRoomAnalyticsRouteClient;
