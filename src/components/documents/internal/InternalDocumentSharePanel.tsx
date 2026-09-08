"use client";

import React, { useMemo, useState } from "react";
import LinksManagerCard from "@/components/links/LinksManagerCard";
import { useInternalDocumentViewer } from "@/components/documents/internal/InternalDocumentViewerContext";
import { cn } from "@/lib/utils";

type ShareScope = "room" | "document";

const InternalDocumentSharePanel: React.FC = () => {
  const { doc, dataRoom, workspaceId } = useInternalDocumentViewer();
  const [scope, setScope] = useState<ShareScope>("document");

  const documentName = doc.title || "Untitled document";
  const documentDefaultLinkName = useMemo(() => {
    const trimmed = documentName.trim();
    return trimmed ? `${trimmed} link` : "Document link";
  }, [documentName]);

  return (
    <div className="space-y-5 p-4 lg:p-5">
      {dataRoom ? (
        <div className="dk-nocturne-surface space-y-3 rounded-lg p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Share scope</p>
            <p className="text-xs text-muted-foreground">
              Choose whether this link unlocks the room or just this document.
            </p>
          </div>

          <div
            role="radiogroup"
            aria-label="Share scope"
            className="grid gap-2 sm:grid-cols-2"
          >
            <button
              type="button"
              role="radio"
              aria-checked={scope === "document"}
              onClick={() => setScope("document")}
              className={cn(
                "w-full rounded-lg border border-border/60 bg-card p-3 text-left transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                scope === "document"
                  ? "border-primary/45 bg-primary/[0.06] shadow-[inset_2px_0_0_var(--primary)]"
                  : "ring-0 hover:border-primary/30 hover:bg-primary/[0.025]",
              )}
            >
              <p className="text-sm font-medium">Document link</p>
              <p className="text-xs text-muted-foreground">
                Opens only this document (recommended for one-offs).
              </p>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={scope === "room"}
              onClick={() => setScope("room")}
              className={cn(
                "w-full rounded-lg border border-border/60 bg-card p-3 text-left transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                scope === "room"
                  ? "border-primary/45 bg-primary/[0.06] shadow-[inset_2px_0_0_var(--primary)]"
                  : "ring-0 hover:border-primary/30 hover:bg-primary/[0.025]",
              )}
            >
              <p className="text-sm font-medium">Room link</p>
              <p className="text-xs text-muted-foreground">
                Browse folders and open documents in this data room.
              </p>
            </button>
          </div>
        </div>
      ) : null}

      {scope === "room" && dataRoom ? (
        <LinksManagerCard
          resourceType="data_room"
          resourceId={dataRoom.id}
          workspaceId={workspaceId}
          resourceName={dataRoom.name}
          defaultLinkName={`${dataRoom.name} link`}
        />
      ) : (
        <LinksManagerCard
          resourceType="document"
          resourceId={doc.id}
          workspaceId={workspaceId}
          resourceName={documentName}
          defaultLinkName={documentDefaultLinkName}
          document={doc}
        />
      )}
    </div>
  );
};

export default InternalDocumentSharePanel;
