"use client";

import React from "react";
import { useRouter } from "next/navigation";
import InternalAuditLogSection from "@/components/analytics/InternalAuditLogSection";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { useDataRoom } from "@/modules/data-rooms/DataRoomProvider";
import { ArrowLeft, ShieldCheck as Shield } from "@phosphor-icons/react";

const DataRoomAuditLogClient: React.FC = () => {
  const { dataRoom } = useDataRoom();
  const router = useRouter();
  const { role: workspaceRole } = useWorkspaceRole(dataRoom.workspace_id);
  const isOwner = workspaceRole === "owner";

  return (
    <PageContainer maxWidth="7xl" className="pb-24 md:pb-10">
      <Button
        variant="ghost"
        size="sm"
        className="mb-3 w-fit px-1 text-muted-foreground hover:text-foreground"
        onClick={() => router.push(`/data-rooms/${dataRoom.id}`)}
      >
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
        Back to data room
      </Button>
      <PageHeader
        title="Internal audit log"
        description={`Owner-only member activity for ${dataRoom.name}.`}
        className="mb-6"
      />

      <section className="mt-6 space-y-5">
        {isOwner ? (
          <div className="min-w-0">
            <InternalAuditLogSection
              workspaceId={dataRoom.workspace_id}
              dataRoomId={dataRoom.id}
            />
          </div>
        ) : (
          <EmptyState
            title="Access restricted"
            description="Only workspace owners can view internal audit logs."
            icon={
              <Shield className="h-6 w-6 text-muted-foreground" aria-hidden />
            }
            compact
            className="border-primary/20 bg-card/35 py-10"
          />
        )}
      </section>
    </PageContainer>
  );
};

export default DataRoomAuditLogClient;
