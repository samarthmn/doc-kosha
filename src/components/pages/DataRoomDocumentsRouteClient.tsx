"use client";

import React from "react";
import DataRoomPageClient from "@/components/pages/DataRoomPageClient";
import { useDataRoom } from "@/modules/data-rooms/DataRoomProvider";

interface DataRoomDocumentsRouteClientProps {
  slug?: string[];
}

const DataRoomDocumentsRouteClient: React.FC<
  DataRoomDocumentsRouteClientProps
> = ({ slug }) => {
  const { dataRoom } = useDataRoom();
  return (
    <div className="min-w-0">
      <DataRoomPageClient dataRoom={dataRoom} slug={slug} />
    </div>
  );
};

export default DataRoomDocumentsRouteClient;
