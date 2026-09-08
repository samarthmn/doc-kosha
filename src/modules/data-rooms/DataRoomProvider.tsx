"use client";

import React, { createContext, useContext, useMemo } from "react";
import type { Tables } from "@/types/generated/supabase";

type DataRoomContextValue = {
  dataRoom: Tables<"data_rooms">;
};

const DataRoomContext = createContext<DataRoomContextValue | null>(null);

interface DataRoomProviderProps {
  dataRoom: Tables<"data_rooms">;
  children: React.ReactNode;
}

export const DataRoomProvider: React.FC<DataRoomProviderProps> = ({
  dataRoom,
  children,
}) => {
  const value = useMemo(() => ({ dataRoom }), [dataRoom]);
  return (
    <DataRoomContext.Provider value={value}>
      {children}
    </DataRoomContext.Provider>
  );
};

export const useDataRoom = (): DataRoomContextValue => {
  const context = useContext(DataRoomContext);
  if (!context) {
    throw new Error("useDataRoom must be used within a DataRoomProvider");
  }
  return context;
};
