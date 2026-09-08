"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { Scissors } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useInternalDocumentViewer } from "@/components/documents/internal/InternalDocumentViewerContext";
import DocumentVersionHistory from "@/components/documents/internal/DocumentVersionHistory";
import {
  isCompletedConversionEligibleExtension,
  isPdfExtension,
} from "@/lib/fileTypes";
import { formatBytes } from "@/lib/format";

const InternalDocumentOverviewPanel: React.FC = () => {
  const { doc, dataRoom } = useInternalDocumentViewer();
  const fileType = (doc.file_type ?? "").toLowerCase();
  const supportsRedaction =
    isPdfExtension(fileType) ||
    isCompletedConversionEligibleExtension(fileType);
  const redactionHref = dataRoom
    ? `/data-rooms/${dataRoom.id}/documents/redaction/${doc.id}`
    : `/documents/redaction/${doc.id}`;

  const conversionLabel = useMemo(() => {
    const status = doc.conversion_status;
    if (!status) return "—";
    if (status === "completed") return "Ready";
    if (status === "in_progress") return "Processing";
    if (status === "pending") return "Processing";
    if (status === "failed") return "Failed";
    return status;
  }, [doc.conversion_status]);

  return (
    <div className="space-y-4 p-4 lg:p-5">
      <Card className="relative overflow-hidden border-border/70 bg-card/55">
        <div
          className="absolute inset-x-0 top-0 h-px bg-primary/55"
          aria-hidden="true"
        />
        <CardHeader className="space-y-2 border-b border-border/60">
          <CardTitle className="text-base font-medium">
            Document details
          </CardTitle>
          {dataRoom ? (
            <div className="pb-2 text-xs text-muted-foreground">
              Viewing inside <Badge variant="secondary">{dataRoom.name}</Badge>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded border border-border/60 bg-background/25 p-3">
              <dt className="dk-nocturne-kicker">File type</dt>
              <dd className="mt-1.5 font-medium">
                {doc.file_type ? doc.file_type.toUpperCase() : "—"}
              </dd>
            </div>
            <div className="rounded border border-border/60 bg-background/25 p-3">
              <dt className="dk-nocturne-kicker">Size</dt>
              <dd className="mt-1.5 font-medium">
                {doc.size_bytes ? formatBytes(doc.size_bytes) : "—"}
              </dd>
            </div>
            <div className="rounded border border-border/60 bg-background/25 p-3">
              <dt className="dk-nocturne-kicker">Pages</dt>
              <dd className="mt-1.5 font-medium">
                {doc.num_pages ? doc.num_pages : "—"}
              </dd>
            </div>
            <div className="rounded border border-border/60 bg-background/25 p-3">
              <dt className="dk-nocturne-kicker">Processing</dt>
              <dd className="mt-1.5 font-medium">{conversionLabel}</dd>
            </div>
          </dl>
          {supportsRedaction ? (
            <div className="mt-4 border-t border-border/60 pt-4">
              <Button asChild variant="outline" size="sm">
                <Link href={redactionHref}>
                  <Scissors className="mr-2 h-4 w-4" aria-hidden="true" />
                  Redact Document
                </Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <DocumentVersionHistory />
    </div>
  );
};

export default InternalDocumentOverviewPanel;
