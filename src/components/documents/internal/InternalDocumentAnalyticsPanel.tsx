"use client";

import React, { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInternalDocumentViewer } from "@/components/documents/internal/InternalDocumentViewerContext";
import MergedDocumentAnalyticsPanel from "@/components/analytics/MergedDocumentAnalyticsPanel";

type AnalyticsScope = "room" | "document";

const InternalDocumentAnalyticsPanel: React.FC = () => {
  const { doc, dataRoom, workspaceId } = useInternalDocumentViewer();
  const [scope, setScope] = useState<AnalyticsScope>(
    dataRoom ? "room" : "document",
  );

  const linksScope = useMemo(() => {
    if (scope === "room" && dataRoom) {
      return { kind: "dataRoom" as const, dataRoomId: dataRoom.id };
    }
    return { kind: "document" as const, documentId: doc.id };
  }, [dataRoom, doc.id, scope]);

  return (
    <div className="space-y-5 p-4 lg:p-5">
      {dataRoom ? (
        <div className="dk-nocturne-surface flex flex-wrap items-center justify-between gap-3 rounded-lg p-4">
          <div>
            <p className="text-sm font-medium">Analytics scope</p>
            <p className="text-xs text-muted-foreground">
              Switch between room-level and document-level link analytics.
            </p>
          </div>
          <Tabs
            value={scope}
            onValueChange={(next) => setScope(next as AnalyticsScope)}
          >
            <TabsList>
              <TabsTrigger value="room">In room</TabsTrigger>
              <TabsTrigger value="document">Document links</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      ) : null}

      <MergedDocumentAnalyticsPanel
        documentId={doc.id}
        workspaceId={workspaceId}
        documentTitle={doc.title || "Untitled document"}
        documentFileType={doc.file_type}
        documentStoragePath={doc.storage_path ?? ""}
        linksScope={linksScope}
      />
    </div>
  );
};

export default InternalDocumentAnalyticsPanel;
