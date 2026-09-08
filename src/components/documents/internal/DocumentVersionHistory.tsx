"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ClockCounterClockwise } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { showError, showSuccess } from "@/lib/toast";
import { useInternalDocumentViewer } from "@/components/documents/internal/InternalDocumentViewerContext";
import Viewer from "@/components/documents/Viewer";
import { formatBytes } from "@/lib/format";

type HistoryItem = {
  kind: "current" | "previous";
  id: string;
  documentId: string;
  title: string;
  fileType: string;
  conversionStatus: string;
  sizeBytes: number;
  replacedAt: string;
  state: "current" | "available" | "pruned";
  isFreeIncluded: boolean;
  countsTowardsStorage: boolean;
  prunedAt: string | null;
  storagePath?: string;
  convertedStoragePath?: string | null;
  sourceScopeDataRoomId?: string | null;
};

type VersioningSettingsResponse = {
  upgradeRequired?: boolean;
};

const formatTimestamp = (value: string): string => {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

const DocumentVersionHistory: React.FC = () => {
  const { doc, workspaceId, refreshDoc } = useInternalDocumentViewer();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<HistoryItem | null>(null);
  const [restoreUpgradeRequired, setRestoreUpgradeRequired] = useState(false);

  const fetchHistory = useCallback(
    async (cursor?: string | null): Promise<void> => {
      if (!doc.id) return;

      const params = new URLSearchParams({ documentId: doc.id, limit: "20" });
      if (cursor) {
        params.set("cursor", cursor);
      }

      const res = await fetch(
        `/api/documents/versioning/history?${params.toString()}`,
        {
          credentials: "include",
        },
      );

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Failed to load version history");
      }

      const payload = (await res.json()) as {
        items: HistoryItem[];
        nextCursor: string | null;
      };

      setItems((prev) => {
        if (!cursor) return payload.items;
        return [
          ...prev,
          ...payload.items.filter((item) => item.kind === "previous"),
        ];
      });
      setNextCursor(payload.nextCursor);
    },
    [doc.id],
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        await fetchHistory(null);
      } catch (error) {
        if (!cancelled) {
          console.error("[document.version-history] load failed", error);
          showError(
            error instanceof Error
              ? error.message
              : "Failed to load version history",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [doc.id, fetchHistory]);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async (): Promise<void> => {
      const params = new URLSearchParams({ workspaceId });
      const res = await fetch(
        `/api/settings/document-versioning?${params.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) return;
      const payload = (await res.json()) as VersioningSettingsResponse;
      if (!cancelled) {
        setRestoreUpgradeRequired(Boolean(payload.upgradeRequired));
      }
    };

    void loadSettings().catch((error) => {
      console.warn("[document.version-history] settings load failed", error);
    });

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const handleLoadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      await fetchHistory(nextCursor);
    } catch (error) {
      console.error("[document.version-history] load more failed", error);
      showError(error instanceof Error ? error.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  };

  const handlePreview = (item: HistoryItem) => {
    if (!item.storagePath) return;
    setPreviewItem(item);
  };

  const handleRestore = async (item: HistoryItem) => {
    if (restoreUpgradeRequired) return;
    if (item.kind !== "previous") return;
    if (item.state !== "available") return;

    setRestoringId(item.id);
    try {
      const res = await fetch("/api/documents/versioning/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workspaceId,
          documentId: doc.id,
          versionId: item.id,
          idempotencyKey: `restore:${doc.id}:${item.id}`,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Restore failed");
      }

      await refreshDoc();
      await fetchHistory(null);
      showSuccess("Version restored");
    } catch (error) {
      console.error("[document.version-history] restore failed", error);
      showError(error instanceof Error ? error.message : "Restore failed");
    } finally {
      setRestoringId(null);
    }
  };

  const previousItems = useMemo(
    () => items.filter((item) => item.kind === "previous"),
    [items],
  );
  const hasPrunedItems = useMemo(
    () => previousItems.some((item) => item.state === "pruned"),
    [previousItems],
  );
  const previewDoc = useMemo(() => {
    if (!previewItem || !previewItem.storagePath) return null;

    return {
      id: `preview:${previewItem.id}`,
      title: previewItem.title,
      file_type: previewItem.fileType,
      size_bytes: previewItem.sizeBytes,
      num_pages: null,
      storage_path: previewItem.storagePath,
      converted_storage_path: previewItem.convertedStoragePath ?? null,
      conversion_status: previewItem.conversionStatus,
      workspace_id: workspaceId,
      data_room_id: previewItem.sourceScopeDataRoomId ?? null,
    };
  }, [previewItem, workspaceId]);

  return (
    <div className="dk-nocturne-surface relative space-y-4 overflow-hidden rounded-lg p-4">
      <div
        className="absolute inset-x-0 top-0 h-px bg-primary/45"
        aria-hidden="true"
      />
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Version History</h3>
        <p className="text-xs text-muted-foreground">
          Previous versions are listed by replacement time.
        </p>
      </div>
      {hasPrunedItems ? (
        <div className="rounded bg-muted/25 p-3 text-xs leading-relaxed text-muted-foreground">
          Older versions are currently unavailable. You can increase retained
          versions in{" "}
          <Link href="/settings?tab=subscription" className="underline">
            Settings
          </Link>
          , but this applies only to future replacements.
        </div>
      ) : null}
      {restoreUpgradeRequired ? (
        <div className="rounded border border-primary/30 bg-primary/[0.055] p-3 text-xs">
          <p className="font-medium">Restore requires a paid plan</p>
          <p className="mt-1 text-muted-foreground">
            Free workspaces keep only the current document version. Upgrade in{" "}
            <Link href="/settings?tab=subscription" className="underline">
              Settings
            </Link>{" "}
            to retain and restore previous versions.
          </p>
        </div>
      ) : null}

      {loading ? (
        <div
          className="rounded border border-border/60 bg-background/25 p-3 text-xs text-muted-foreground"
          role="status"
        >
          Loading history…
        </div>
      ) : previousItems.length === 0 ? (
        <EmptyState
          variant="bare"
          compact
          icon={
            <ClockCounterClockwise
              aria-hidden
              className="h-6 w-6 text-muted-foreground"
            />
          }
          title="No previous versions yet"
          description="Previous versions appear here after this document is replaced."
        />
      ) : (
        <div className="space-y-2">
          {previousItems.map((item) => (
            <div
              key={item.id}
              className={`rounded border bg-background/25 p-3 transition-colors hover:border-primary/25 ${
                item.state === "pruned"
                  ? "border-dashed border-border/70"
                  : "border-border/65"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      item.state === "pruned" ? "text-muted-foreground" : ""
                    }`}
                  >
                    {formatTimestamp(item.replacedAt)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.title} · {item.fileType.toUpperCase()} ·{" "}
                    {formatBytes(item.sizeBytes)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {item.isFreeIncluded ? (
                    <Badge variant="secondary">Free included</Badge>
                  ) : null}
                  {item.countsTowardsStorage ? (
                    <Badge variant="secondary">Counts toward storage</Badge>
                  ) : null}
                  {item.state === "pruned" ? (
                    <Badge variant="outline">Pruned</Badge>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handlePreview(item)}
                  disabled={item.state === "pruned" || !item.storagePath}
                >
                  Preview
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleRestore(item)}
                  disabled={
                    restoreUpgradeRequired ||
                    item.state === "pruned" ||
                    restoringId === item.id
                  }
                >
                  {restoringId === item.id ? "Restoring…" : "Restore"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {nextCursor ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void handleLoadMore()}
          disabled={loadingMore}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      ) : null}

      <Dialog
        open={Boolean(previewItem)}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewItem(null);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-6xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border/70 px-4 py-3">
            <DialogTitle className="text-base">
              Version Preview: {previewItem?.title ?? ""}
            </DialogTitle>
            <DialogDescription>
              {previewItem
                ? `Replaced on ${formatTimestamp(previewItem.replacedAt)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="h-[78vh] bg-muted/25 p-3">
            {previewDoc ? (
              <Viewer
                doc={previewDoc}
                accessMode="authenticated"
                className="h-full"
                allowDownload={false}
                // Preview ids are synthetic ("preview:<versionId>"); do not
                // emit document_viewed analytics for them.
                trackViewEvent={false}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentVersionHistory;
