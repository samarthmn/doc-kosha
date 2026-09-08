"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/analytics/MetricCard";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import type { Tables } from "@/types/generated/supabase";
import DocumentsClient, {
  DOCUMENTS_CONTROL_UPLOAD_EVENT,
} from "@/components/pages/DocumentsClient";
import { showError, showSuccess } from "@/lib/toast";
import {
  ArrowLeft,
  ArrowsClockwise as RefreshCw,
  CaretDown as ChevronDown,
  ChartBar as BarChart3,
  Clock,
  DownloadSimple as Download,
  Eye,
  Folder,
  ShareNetwork as Share2,
  Signature as FileSignature,
  SpinnerGap as Loader2,
  UploadSimple as UploadIcon,
  UsersThree as Users,
} from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { extractFilenameFromContentDisposition } from "@/lib/utils";
import { prefetchLinksManagerBootstrap } from "@/modules/performance/prefetchBootstraps";
import { trackProductEvent } from "@/lib/analytics/productEvents";
import { useDataRoomMetrics } from "@/hooks/useDataRoomMetrics";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { formatDuration } from "@/lib/format";

interface DataRoomPageClientProps {
  dataRoom: Tables<"data_rooms">;
  slug?: string[];
}

interface DocumentAggregateMetrics {
  totalViews: number;
  uniqueViews: number;
  totalRevisits: number;
  totalTimeMs: number;
}

const DOC_METRIC_CONFIG: Array<{
  key: keyof DocumentAggregateMetrics;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  formatter?: (value: number) => string;
}> = [
  { key: "totalViews", label: "Document views", icon: Eye },
  { key: "uniqueViews", label: "Unique viewers", icon: Users },
  { key: "totalRevisits", label: "Revisits", icon: RefreshCw },
  {
    key: "totalTimeMs",
    label: "Time spent",
    icon: Clock,
    formatter: formatDuration,
  },
];

const DataRoomPageClient: React.FC<DataRoomPageClientProps> = ({
  dataRoom,
  slug = [],
}) => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  const prefetchedPathsRef = useRef<Set<string>>(new Set());
  const hasTrackedOpenRef = useRef(false);
  const metricsRoomIds = useMemo(() => [dataRoom.id], [dataRoom.id]);
  const {
    metrics: metricsById,
    isLoading: isLoadingMetrics,
    hasLoaded: hasLoadedMetricsOnce,
    error: metricsError,
    refetch: refetchMetrics,
  } = useDataRoomMetrics(dataRoom.workspace_id, metricsRoomIds);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [downloadingZip, setDownloadingZip] = useState<
    "room" | "folder" | null
  >(null);
  const documentsControlId = dataRoom.id;
  const dataRoomSharePath = `/data-rooms/${dataRoom.id}/share`;
  const dataRoomAnalyticsPath = `/data-rooms/${dataRoom.id}/analytics`;
  const dataRoomAuditLogPath = `/data-rooms/${dataRoom.id}/audit-log`;
  const dataRoomAccessPath = `/data-rooms/${dataRoom.id}/access`;
  const { role: workspaceRole } = useWorkspaceRole(dataRoom.workspace_id);
  const isOwner = workspaceRole === "owner";
  const [canEditDataRoom, setCanEditDataRoom] = useState<boolean>(false);
  const [isCheckingDataRoomEdit, setIsCheckingDataRoomEdit] =
    useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const wsId = dataRoom.workspace_id;
      const roomId = dataRoom.id;
      if (!wsId || !roomId) {
        if (!cancelled) {
          setCanEditDataRoom(false);
          setIsCheckingDataRoomEdit(false);
        }
        return;
      }

      setIsCheckingDataRoomEdit(true);
      try {
        const { data, error } = await supabase.rpc("can_edit_data_room", {
          ws: wsId,
          room_id: roomId,
        });
        if (cancelled) return;
        setCanEditDataRoom(!error && Boolean(data));
      } catch (error) {
        console.error("[DataRoomPageClient] failed to check room edit access", {
          workspaceId: wsId,
          dataRoomId: roomId,
          error,
        });
        if (!cancelled) setCanEditDataRoom(false);
      } finally {
        if (!cancelled) setIsCheckingDataRoomEdit(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [dataRoom.id, dataRoom.workspace_id, supabase]);

  useEffect(() => {
    if (hasTrackedOpenRef.current) return;
    hasTrackedOpenRef.current = true;
    trackProductEvent("data_room_opened", {
      data_room_id: dataRoom.id,
      workspace_id: dataRoom.workspace_id,
    });
  }, [dataRoom.id, dataRoom.workspace_id]);

  const prefetchPath = useCallback(
    (path: string) => {
      if (!path) return;
      if (prefetchedPathsRef.current.has(path)) return;
      prefetchedPathsRef.current.add(path);
      router.prefetch(path);
    },
    [router],
  );

  // Determine current folder from slug
  const normalizedSlug = useMemo(() => (slug || []).filter(Boolean), [slug]);
  const currentFolderId = useMemo(
    () =>
      normalizedSlug.length > 0
        ? normalizedSlug[normalizedSlug.length - 1]
        : null,
    [normalizedSlug],
  );

  const handleDownloadZip = useCallback(
    async (scope: "room" | "folder") => {
      const folderId = scope === "folder" ? currentFolderId : null;

      if (scope === "folder" && !folderId) {
        showError("No folder selected for download.");
        return;
      }

      setDownloadingZip(scope);
      try {
        const res = await fetch("/api/data-rooms/download-zip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            dataRoomId: dataRoom.id,
            scope,
            folderId,
          }),
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          const message =
            (typeof payload?.error === "string" && payload.error) ||
            "Unable to download ZIP right now. Please try again.";
          showError(message);
          return;
        }

        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const disposition = res.headers.get("content-disposition");
        const fallbackName =
          scope === "room"
            ? `${(dataRoom.name || "data-room").trim() || "data-room"}.zip`
            : `${(dataRoom.name || "data-room").trim() || "data-room"}-folder.zip`;
        const filename = disposition
          ? extractFilenameFromContentDisposition(disposition) || fallbackName
          : fallbackName;

        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(objectUrl);
        trackProductEvent("data_room_zip_downloaded", {
          data_room_id: dataRoom.id,
          workspace_id: dataRoom.workspace_id,
          scope,
          folder_id: folderId ?? undefined,
        });
        showSuccess("Download started.");
      } catch (downloadError) {
        console.error("[data-room] zip download failed", downloadError);
        showError("Unable to download ZIP right now. Please try again.");
      } finally {
        setDownloadingZip(null);
      }
    },
    [currentFolderId, dataRoom.id, dataRoom.name, dataRoom.workspace_id],
  );

  const dispatchDocumentsEvent = useCallback(
    (eventBase: string) => {
      if (typeof window === "undefined") return;
      window.dispatchEvent(new Event(`${eventBase}:${documentsControlId}`));
    },
    [documentsControlId],
  );

  const handleUploadShortcut = useCallback(() => {
    if (isCheckingDataRoomEdit) return;
    if (!canEditDataRoom) return;
    dispatchDocumentsEvent(DOCUMENTS_CONTROL_UPLOAD_EVENT);
  }, [canEditDataRoom, dispatchDocumentsEvent, isCheckingDataRoomEdit]);

  const navigateTo = useCallback(
    (path: string) => {
      startTransition(() => {
        router.push(path);
      });
    },
    [router, startTransition],
  );

  useEffect(() => {
    prefetchPath(dataRoomSharePath);
    prefetchPath(dataRoomAnalyticsPath);
    if (isOwner) {
      prefetchPath(dataRoomAccessPath);
      prefetchPath(dataRoomAuditLogPath);
    }
  }, [
    dataRoomAccessPath,
    dataRoomAnalyticsPath,
    dataRoomAuditLogPath,
    dataRoomSharePath,
    isOwner,
    prefetchPath,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!dataRoom.workspace_id) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void prefetchLinksManagerBootstrap({
        workspaceId: dataRoom.workspace_id,
        resourceType: "data_room",
        resourceId: dataRoom.id,
      }).catch(() => undefined);
    };

    const withIdle = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (withIdle.requestIdleCallback) {
      const idleId = withIdle.requestIdleCallback(run, { timeout: 1500 });
      return () => {
        cancelled = true;
        withIdle.cancelIdleCallback?.(idleId);
      };
    }

    const timer = window.setTimeout(run, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [dataRoom.id, dataRoom.workspace_id]);

  useEffect(() => {
    if (isLoadingMetrics) {
      setLoadingProgress(10);
      const timer = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 15;
        });
      }, 300);
      return () => clearInterval(timer);
    }
    setLoadingProgress(100);
  }, [isLoadingMetrics]);

  const roomMetrics = metricsById[dataRoom.id];
  const resolvedDocMetrics: DocumentAggregateMetrics = {
    totalViews: roomMetrics?.totalViews ?? 0,
    uniqueViews: roomMetrics?.uniqueViews ?? 0,
    totalRevisits: Math.max(
      (roomMetrics?.totalViews ?? 0) - (roomMetrics?.uniqueViews ?? 0),
      0,
    ),
    totalTimeMs: roomMetrics?.totalTimeMs ?? 0,
  };
  const hasDocAnalytics = Boolean(
    resolvedDocMetrics.totalViews ||
    resolvedDocMetrics.uniqueViews ||
    resolvedDocMetrics.totalRevisits ||
    resolvedDocMetrics.totalTimeMs,
  );

  return (
    <PageContainer maxWidth="7xl" className="space-y-8 pb-24 md:pb-10">
      <section aria-label="Data room header" className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit px-1 text-muted-foreground hover:text-foreground"
          onClick={() => router.push("/data-rooms")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
          Back to data rooms
        </Button>
        <PageHeader
          title={dataRoom.name}
          description={
            dataRoom.description ||
            "Manage & share this room’s documents securely"
          }
          actions={
            <>
              {canEditDataRoom ? (
                <Button
                  onClick={handleUploadShortcut}
                  className="w-full sm:w-auto"
                  data-guide="data-room-upload-button"
                >
                  <UploadIcon className="mr-2 h-4 w-4" aria-hidden />
                  Upload Document
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    disabled={downloadingZip !== null}
                  >
                    {downloadingZip !== null ? (
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                        aria-hidden
                      />
                    ) : (
                      <Download className="mr-2 h-4 w-4" aria-hidden />
                    )}
                    Download
                    <ChevronDown className="ml-1 h-4 w-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => void handleDownloadZip("room")}
                    disabled={downloadingZip === "room"}
                  >
                    {downloadingZip === "room" ? (
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                        aria-hidden
                      />
                    ) : (
                      <Download className="mr-2 h-4 w-4" aria-hidden />
                    )}
                    Download entire data room (.zip)
                  </DropdownMenuItem>
                  {currentFolderId && (
                    <DropdownMenuItem
                      onClick={() => void handleDownloadZip("folder")}
                      disabled={downloadingZip === "folder"}
                    >
                      {downloadingZip === "folder" ? (
                        <Loader2
                          className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                          aria-hidden
                        />
                      ) : (
                        <Folder className="mr-2 h-4 w-4" aria-hidden />
                      )}
                      Download this folder (.zip)
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />
      </section>

      <section
        id="analytics"
        className="dk-nocturne-surface relative space-y-5 overflow-hidden rounded-lg bg-card/35 p-4 sm:p-5"
      >
        {/* Progress indicator */}
        <div className="pointer-events-none absolute inset-x-0 top-0">
          <Progress
            value={loadingProgress}
            className={`h-0.5 rounded-none transition-opacity ${
              isLoadingMetrics ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>

        {/* Section header + actions */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-medium">Engagement Overview</h2>
            <p className="text-xs text-muted-foreground">
              Documents in this room
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="inline-flex items-center gap-2"
              onClick={() => void refetchMetrics()}
              disabled={isLoadingMetrics}
            >
              {isLoadingMetrics ? (
                <Loader2
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden />
              )}
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="inline-flex items-center gap-2"
              onClick={() => navigateTo(dataRoomSharePath)}
              onMouseEnter={() => prefetchPath(dataRoomSharePath)}
              onFocus={() => prefetchPath(dataRoomSharePath)}
              disabled={isNavigating}
              data-guide="data-room-manage-links"
            >
              <Share2 className="h-4 w-4" aria-hidden />
              Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="inline-flex items-center gap-2"
              onClick={() => navigateTo(dataRoomAnalyticsPath)}
              onMouseEnter={() => prefetchPath(dataRoomAnalyticsPath)}
              onFocus={() => prefetchPath(dataRoomAnalyticsPath)}
              disabled={isNavigating}
            >
              <BarChart3 className="h-4 w-4" aria-hidden />
              Detailed Analytics
            </Button>
            {isOwner ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="inline-flex items-center gap-2"
                    disabled={isNavigating}
                  >
                    More
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => navigateTo(dataRoomAccessPath)}
                    onMouseEnter={() => prefetchPath(dataRoomAccessPath)}
                    onFocus={() => prefetchPath(dataRoomAccessPath)}
                  >
                    <Users className="mr-2 h-4 w-4" aria-hidden />
                    Access
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigateTo(dataRoomAuditLogPath)}
                    onMouseEnter={() => prefetchPath(dataRoomAuditLogPath)}
                    onFocus={() => prefetchPath(dataRoomAuditLogPath)}
                  >
                    <FileSignature className="mr-2 h-4 w-4" aria-hidden />
                    Internal audit log
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>

        {/* Metric cards grid */}
        {metricsError ? (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="space-y-1">
              <p className="text-sm font-medium">Unable to load analytics</p>
              <p className="text-xs text-muted-foreground">
                Something went wrong while loading engagement metrics.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetchMetrics()}
              disabled={isLoadingMetrics}
            >
              {isLoadingMetrics ? (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : null}
              Retry
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {DOC_METRIC_CONFIG.map((metric) => {
                const value = resolvedDocMetrics[metric.key];
                const displayValue = !hasLoadedMetricsOnce
                  ? "—"
                  : metric.formatter
                    ? metric.formatter(value)
                    : String(value);
                return (
                  <MetricCard
                    key={metric.key}
                    label={metric.label}
                    value={displayValue}
                    icon={metric.icon}
                  />
                );
              })}
            </div>

            {!hasDocAnalytics && hasLoadedMetricsOnce ? (
              <p className="border-t border-border/50 pt-3 text-sm text-muted-foreground">
                Document analytics will appear once this data room is shared.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section
        id="documents"
        aria-labelledby="data-room-documents-heading"
        data-guide="data-room-documents-table"
        className="space-y-3"
      >
        <div className="space-y-1">
          <h2 id="data-room-documents-heading" className="text-lg font-medium">
            Documents
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage files just like in your main workspace—everything stays
            scoped to this room.
          </p>
        </div>
        <DocumentsClient
          scope={{
            kind: "dataRoom",
            dataRoomId: dataRoom.id,
            workspaceId: dataRoom.workspace_id,
          }}
          basePath={`/data-rooms/${dataRoom.id}/documents`}
          title={`${dataRoom.name} Documents`}
          subtitle="Same powerful workspace experience, scoped to this data room"
          rootBreadcrumbLabel={dataRoom.name}
          enableRowLinks={false}
          controlId={documentsControlId}
          showHeader={false}
          className="p-0 md:p-0"
        />
      </section>
    </PageContainer>
  );
};

export default DataRoomPageClient;
