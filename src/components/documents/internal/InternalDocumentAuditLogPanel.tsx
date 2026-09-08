"use client";

import React from "react";
import InternalAuditLogSection from "@/components/analytics/InternalAuditLogSection";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { ShieldCheck } from "@phosphor-icons/react";
import { useInternalDocumentViewer } from "@/components/documents/internal/InternalDocumentViewerContext";

const InternalDocumentAuditLogPanel: React.FC = () => {
  const { doc, dataRoom, workspaceId } = useInternalDocumentViewer();
  const { role: workspaceRole } = useWorkspaceRole(workspaceId);
  const isOwner = workspaceRole === "owner";

  if (!isOwner) {
    return (
      <Card className="m-4 border-border/70 bg-card/55 lg:m-5">
        <CardContent className="py-10">
          <EmptyState
            variant="bare"
            title="Access restricted"
            description="Only workspace owners can view internal audit logs."
            icon={
              <ShieldCheck
                className="h-6 w-6 text-muted-foreground"
                aria-hidden
              />
            }
            compact
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="p-4 lg:p-5">
      <InternalAuditLogSection
        workspaceId={workspaceId}
        documentId={doc.id}
        dataRoomId={dataRoom?.id ?? null}
      />
    </div>
  );
};

export default InternalDocumentAuditLogPanel;
