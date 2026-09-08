"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import DataRoomLinksManager from "@/components/pages/DataRoomLinksManager";
import type { Tables } from "@/types/generated/supabase";

interface DataRoomShareClientProps {
  dataRoom: Tables<"data_rooms">;
}

const DataRoomShareClient: React.FC<DataRoomShareClientProps> = ({
  dataRoom,
}) => {
  const router = useRouter();

  return (
    <PageContainer maxWidth="7xl" className="pb-24 md:pb-10">
      <Button
        variant="ghost"
        size="sm"
        className="mb-3 w-fit px-1 text-muted-foreground hover:text-foreground"
        onClick={() => router.push(`/data-rooms/${dataRoom.id}/documents`)}
      >
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
        Back to data room
      </Button>
      <PageHeader
        title="Share"
        description={`Manage share links for ${dataRoom.name}.`}
        className="mb-6"
      />
      <section className="space-y-3">
        <DataRoomLinksManager dataRoom={dataRoom} />
      </section>
    </PageContainer>
  );
};

export default DataRoomShareClient;
