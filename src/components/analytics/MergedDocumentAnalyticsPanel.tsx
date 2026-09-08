"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import dynamic from "next/dynamic";
import {
  ArrowClockwise,
  ArrowUpRight,
  ChartBar,
  Clock,
  DownloadSimple,
  Eye,
  Timer,
  Users,
} from "@phosphor-icons/react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { MetricCard } from "@/components/analytics/MetricCard";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AnalyticsTimeRangeOption as TimeRangeOption,
  CountryBreakdownDatum,
  ViewerStat,
} from "@/modules/advanced-analytics/types";
import { cn } from "@/lib/utils";
import {
  readPrefetchCache,
  writePrefetchCache,
} from "@/modules/performance/prefetchCache";
import { showError, showSuccess } from "@/lib/toast";
import type { Tables } from "@/types/generated/supabase";
import { formatDuration } from "@/lib/format";
import { resolveViewerInsightsRpcState } from "@/components/analytics/viewerInsightsState";

const PageTimeBarChart = dynamic(
  () => import("@/modules/advanced-analytics/PageTimeBarChart"),
  {
    ssr: false,
    loading: () => (
      <div className="h-48 w-full animate-pulse rounded-lg bg-muted" />
    ),
  },
);

const CountryBreakdownCard = dynamic(
  () => import("@/modules/advanced-analytics/CountryBreakdownCard"),
  {
    ssr: false,
    loading: () => (
      <div className="h-48 w-full animate-pulse rounded-lg bg-muted" />
    ),
  },
);

const AnalyticsFilterBar = React.lazy(
  () => import("@/modules/advanced-analytics/AnalyticsFilterBar"),
);

type ResourceMetricsRow = {
  link_id: string;
  total_views: number;
  unique_viewers: number;
  total_downloads: number;
  total_revisits: number;
  total_time_ms: number;
  total_page_views: number;
  last_seen_at: string | null;
};

type DocumentPageRow = {
  page_number: number;
  total_time_ms: number;
};

type ViewerRow = {
  viewer_key: string;
  viewer_email: string;
  document_id: string;
  link_id: string;
  content_path: string;
  view_count: number;
  download_count: number;
  total_time_ms: number;
  last_seen_at: string;
};

type ViewerPageRow = {
  viewer_key: string;
  document_id: string;
  page_number: number;
  total_time_ms: number;
  last_seen_at: string;
};

type LinkRow = Pick<
  Tables<"links">,
  "id" | "name" | "collect_email_for_analytics"
>;

/* TimeRangeOption imported from AnalyticsFilterBar */

type CountryViewRow = {
  country_code: string;
  total_views: number;
};

interface MergedDocumentAnalyticsPanelProps {
  documentId: string;
  workspaceId: string;
  documentTitle: string;
  documentFileType?: string | null;
  documentStoragePath: string;
  linksScope:
    | { kind: "document"; documentId: string }
    | { kind: "dataRoom"; dataRoomId: string };
}

const resolveRangeStart = (range: TimeRangeOption): string | null => {
  if (range === "all") return null;
  const now = Date.now();
  const days = range === "7d" ? 7 : 30;
  const cutoff = new Date(now - days * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
};

const toHHMMSS = (ms: number) => {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((sec % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${h}:${m}:${s}`;
};

const formatRelativeTime = (input: string): string => {
  try {
    return formatDistanceToNow(new Date(input), { addSuffix: true });
  } catch {
    return "Recently";
  }
};

const isCountryRpcMissingError = (error: unknown): boolean => {
  if (
    !error ||
    typeof error !== "object" ||
    !("code" in error) ||
    typeof (error as { code?: string | null }).code !== "string"
  ) {
    return false;
  }
  const code = (error as { code?: string | null }).code;
  return code === "PGRST103" || code === "PGRST202";
};

const logCountryRpcError = (context: string, error: unknown) => {
  if (isCountryRpcMissingError(error)) {
    console.warn(
      `${context} country RPC missing. Apply the latest database migrations.`,
    );
    return;
  }
  console.error(`${context} country views fetch failed`, error);
};

const MergedDocumentAnalyticsPanel: React.FC<
  MergedDocumentAnalyticsPanelProps
> = ({
  documentId,
  workspaceId,
  documentTitle,
  documentFileType,
  documentStoragePath,
  linksScope,
}) => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState<boolean>(false);
  const [selectedLinkId, setSelectedLinkId] = useState<string>("all");
  const [versionKey, setVersionKey] = useState<string>("current");
  const [versionOptions, setVersionOptions] = useState<
    Array<{ key: string; label: string; contentPath: string | null }>
  >([]);
  const analyticsCacheKey = useMemo(
    () => `merged-doc-analytics:v2:${workspaceId}:${documentId}:${versionKey}`,
    [workspaceId, documentId, versionKey],
  );
  const [timeRange, setTimeRange] = useState<TimeRangeOption>("all");
  const [customRange, setCustomRange] = useState<{
    from: Date | null;
    to: Date | null;
  }>({ from: null, to: null });
  const [isLoadingMetrics, setIsLoadingMetrics] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<boolean>(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [resourceMetricsRows, setResourceMetricsRows] = useState<
    ResourceMetricsRow[]
  >([]);
  const [documentPages, setDocumentPages] = useState<DocumentPageRow[]>([]);
  const [viewerStats, setViewerStats] = useState<ViewerStat[]>([]);
  const [viewerInsightsError, setViewerInsightsError] =
    useState<boolean>(false);
  const [countryStats, setCountryStats] = useState<CountryBreakdownDatum[]>([]);
  const [isCountryStatsLoading, setIsCountryStatsLoading] =
    useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  useEffect(() => {
    const cached = readPrefetchCache<{
      resourceMetricsRows: ResourceMetricsRow[];
      documentPages: DocumentPageRow[];
    }>(analyticsCacheKey);
    if (!cached) return;
    setResourceMetricsRows(cached.resourceMetricsRows);
    setDocumentPages(cached.documentPages);
    setIsLoadingMetrics(false);
  }, [analyticsCacheKey]);

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
    } else {
      setLoadingProgress(100);
    }
  }, [isLoadingMetrics]);

  const dateFilters = useMemo(() => {
    if (timeRange === "custom") {
      return {
        from: customRange.from ? customRange.from.toISOString() : null,
        to: customRange.to ? customRange.to.toISOString() : null,
      };
    }
    return { from: resolveRangeStart(timeRange), to: null };
  }, [timeRange, customRange]);

  const selectedLinkIds = useMemo(() => {
    if (!links.length) return [];
    if (selectedLinkId === "all") {
      return links.map((link) => link.id);
    }
    const target = links.find((link) => link.id === selectedLinkId);
    return target ? [target.id] : [];
  }, [links, selectedLinkId]);

  const selectedContentPaths = useMemo((): string[] | null => {
    if (versionKey === "all") return null;
    const match = versionOptions.find((opt) => opt.key === versionKey);
    const contentPath =
      match?.contentPath ?? (documentStoragePath ? documentStoragePath : null);
    if (!contentPath) return null;
    return [contentPath];
  }, [documentStoragePath, versionKey, versionOptions]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("document_versions")
          .select("id, storage_path, replaced_at")
          .eq("workspace_id", workspaceId)
          .eq("document_id", documentId)
          .eq("state", "available")
          .order("replaced_at", { ascending: false })
          .limit(20);
        if (cancelled) return;
        if (error) {
          console.error("[MergedDocAnalytics] Failed to load versions", error);
          setVersionOptions([
            {
              key: "current",
              label: "Current version",
              contentPath: documentStoragePath,
            },
            { key: "all", label: "All versions", contentPath: null },
          ]);
          return;
        }

        const previous = (data ?? [])
          .filter(
            (
              row,
            ): row is {
              id: string;
              storage_path: string;
              replaced_at: string;
            } => Boolean(row.storage_path) && Boolean(row.replaced_at),
          )
          .map((row) => ({
            key: `version:${row.id}`,
            label: `Replaced ${formatRelativeTime(row.replaced_at)}`,
            contentPath: row.storage_path,
          }));

        const options = [
          {
            key: "current",
            label: "Current version",
            contentPath: documentStoragePath,
          },
          { key: "all", label: "All versions", contentPath: null },
          ...previous,
        ];
        setVersionOptions(options);
        setVersionKey((current) =>
          options.some((opt) => opt.key === current) ? current : "current",
        );
      } catch (err) {
        if (!cancelled) {
          console.error("[MergedDocAnalytics] Versions load failed", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, documentStoragePath, supabase, workspaceId]);

  const viewerInsightsEnabled = useMemo(() => {
    if (!links.length) return false;
    if (selectedLinkId === "all") {
      return links.some((link) => link.collect_email_for_analytics);
    }
    const target = links.find((link) => link.id === selectedLinkId);
    return Boolean(target?.collect_email_for_analytics);
  }, [links, selectedLinkId]);

  const exportLinkIds = useMemo(() => {
    if (selectedLinkId === "all") {
      return links.map((link) => link.id);
    }
    return selectedLinkId ? [selectedLinkId] : [];
  }, [links, selectedLinkId]);

  const loadLinks = useCallback(async () => {
    setIsLoadingLinks(true);
    try {
      let query = supabase
        .from("links")
        .select("id, name, collect_email_for_analytics")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true });
      if (linksScope.kind === "document") {
        query = query.eq("document_id", linksScope.documentId);
      } else {
        query = query.eq("data_room_id", linksScope.dataRoomId);
      }
      const { data, error } = await query;
      if (error) {
        console.error("[MergedDocAnalytics] Failed to load links", error);
        setLinks([]);
        return;
      }
      setLinks(data ?? []);
    } finally {
      setIsLoadingLinks(false);
    }
  }, [linksScope, supabase, workspaceId]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  const loadAnalytics = useCallback(async () => {
    setIsLoadingMetrics(true);
    setLoadError(false);
    setViewerInsightsError(false);
    try {
      if (selectedLinkId !== "all" && selectedLinkIds.length === 0) {
        setResourceMetricsRows([]);
        setDocumentPages([]);
        setViewerStats([]);
        return;
      }

      const fromTs = dateFilters.from ?? undefined;
      const toTs = dateFilters.to ?? undefined;
      const contentPaths = selectedContentPaths ?? undefined;

      const metricsPromise = supabase.rpc("get_document_link_metrics_v2", {
        p_workspace_id: workspaceId,
        p_document_id: documentId,
        p_link_ids: selectedLinkIds,
        p_content_paths: contentPaths,
        p_from_ts: fromTs,
        p_to_ts: toTs,
      });

      const pageAttentionPromise = supabase.rpc(
        "get_document_page_attention_v2",
        {
          p_workspace_id: workspaceId,
          p_document_id: documentId,
          p_link_ids: selectedLinkIds,
          p_content_paths: contentPaths,
          p_from_ts: fromTs,
          p_to_ts: toTs,
        },
      );

      const viewerRowsPromise = viewerInsightsEnabled
        ? supabase.rpc("get_document_viewer_insights_v2", {
            p_workspace_id: workspaceId,
            p_document_id: documentId,
            p_link_ids: selectedLinkIds,
            p_content_paths: contentPaths,
            p_from_ts: fromTs,
            p_to_ts: toTs,
          })
        : Promise.resolve({ data: [], error: null });

      const viewerPagesPromise = viewerInsightsEnabled
        ? supabase.rpc("get_document_viewer_pages_v2", {
            p_workspace_id: workspaceId,
            p_document_id: documentId,
            p_link_ids: selectedLinkIds,
            p_content_paths: contentPaths,
            p_from_ts: fromTs,
            p_to_ts: toTs,
          })
        : Promise.resolve({ data: [], error: null });

      const [
        { data: metricsRows, error: metricsError },
        { data: pageRows, error: docPagesError },
        viewerRowsResult,
        viewerPagesResult,
      ] = await Promise.all([
        metricsPromise,
        pageAttentionPromise,
        viewerRowsPromise,
        viewerPagesPromise,
      ]);

      if (metricsError) {
        throw metricsError;
      }
      if (docPagesError) {
        throw docPagesError;
      }

      setResourceMetricsRows((metricsRows ?? []) as ResourceMetricsRow[]);
      setDocumentPages((pageRows ?? []) as DocumentPageRow[]);

      const docTitleMap = {
        [documentId]: documentTitle || "Untitled document",
      };
      const viewerRpcState = resolveViewerInsightsRpcState({
        enabled: viewerInsightsEnabled,
        viewerRowsError: viewerRowsResult.error,
        viewerPagesError: viewerPagesResult.error,
      });
      let stats: ViewerStat[] = [];
      if (viewerRpcState === "error") {
        console.error("[MergedDocAnalytics] Viewer insights RPC failed", {
          viewerRowsError: viewerRowsResult.error,
          viewerPagesError: viewerPagesResult.error,
        });
        setViewerInsightsError(true);
      } else if (viewerRpcState === "ready") {
        const { buildViewerStats } =
          await import("@/modules/advanced-analytics/viewerInsights");
        stats = await buildViewerStats({
          viewers: (viewerRowsResult.data as ViewerRow[]) ?? [],
          viewerPages: (viewerPagesResult.data as ViewerPageRow[]) ?? [],
          docTitleMap,
        });
      }
      setViewerStats(stats);

      if (selectedLinkId === "all" && !dateFilters.from && !dateFilters.to) {
        writePrefetchCache(
          analyticsCacheKey,
          {
            resourceMetricsRows: (metricsRows ?? []) as ResourceMetricsRow[],
            documentPages: (pageRows ?? []) as DocumentPageRow[],
          },
          30_000,
        );
      }
    } catch (error) {
      console.error("[MergedDocAnalytics] Failed to load analytics", error);
      setLoadError(true);
      setResourceMetricsRows([]);
      setDocumentPages([]);
      setViewerStats([]);
      setViewerInsightsError(viewerInsightsEnabled);
    } finally {
      setIsLoadingMetrics(false);
    }
  }, [
    dateFilters.from,
    dateFilters.to,
    documentId,
    documentTitle,
    selectedLinkId,
    selectedLinkIds,
    supabase,
    workspaceId,
    viewerInsightsEnabled,
    analyticsCacheKey,
    selectedContentPaths,
  ]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    const refreshOnFocus = () => {
      void loadLinks();
      void loadAnalytics();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshOnFocus();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadAnalytics, loadLinks]);

  useEffect(() => {
    if (!workspaceId || !selectedLinkIds.length) {
      setCountryStats([]);
      return;
    }
    let active = true;
    setIsCountryStatsLoading(true);
    void (async () => {
      try {
        const fromTs = dateFilters.from ?? undefined;
        const toTs = dateFilters.to ?? undefined;
        const contentPaths = selectedContentPaths ?? undefined;
        const { data, error } = await supabase.rpc(
          "get_link_country_views_v2",
          {
            p_workspace_id: workspaceId,
            p_link_ids: selectedLinkIds,
            p_content_paths: contentPaths,
            p_from_ts: fromTs,
            p_to_ts: toTs,
          },
        );
        if (!active) return;
        if (error) {
          // Log every failure (not just the missing-RPC case) and clear
          // stats consistently in both branches.
          logCountryRpcError("[MergedDocAnalytics]", error);
          setCountryStats([]);
          return;
        }
        const normalized: CountryBreakdownDatum[] = (
          (data ?? []) as unknown as CountryViewRow[]
        ).map((row) => ({
          countryCode: row.country_code,
          totalViews: Number(row.total_views) || 0,
        }));
        setCountryStats(normalized);
      } catch (err) {
        if (active) {
          console.error(
            "[MergedDocAnalytics] unexpected country views error",
            err,
          );
          setCountryStats([]);
        }
      } finally {
        if (active) setIsCountryStatsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [
    refreshNonce,
    selectedLinkIds,
    supabase,
    workspaceId,
    dateFilters.from,
    dateFilters.to,
    selectedContentPaths,
  ]);

  const metricsTotals = useMemo(() => {
    return resourceMetricsRows.reduce(
      (acc, row) => ({
        totalViews: acc.totalViews + (row.total_views ?? 0),
        uniqueViews: acc.uniqueViews + (row.unique_viewers ?? 0),
        totalDownloads: acc.totalDownloads + (row.total_downloads ?? 0),
        totalRevisits: acc.totalRevisits + (row.total_revisits ?? 0),
        totalTimeMs: acc.totalTimeMs + (row.total_time_ms ?? 0),
        lastViewedAt:
          row.last_seen_at &&
          (!acc.lastViewedAt || row.last_seen_at > acc.lastViewedAt)
            ? row.last_seen_at
            : acc.lastViewedAt,
      }),
      {
        totalViews: 0,
        uniqueViews: 0,
        totalDownloads: 0,
        totalRevisits: 0,
        totalTimeMs: 0,
        lastViewedAt: null as string | null,
      },
    );
  }, [resourceMetricsRows]);

  const avgTimeMs =
    metricsTotals.uniqueViews > 0
      ? Math.round(metricsTotals.totalTimeMs / metricsTotals.uniqueViews)
      : 0;

  const pageAttention = useMemo(() => {
    if (!documentPages.length) return [];
    const totals = new Map<number, number>();
    documentPages.forEach((row) => {
      if (typeof row.page_number !== "number") return;
      const prev = totals.get(row.page_number) ?? 0;
      totals.set(row.page_number, prev + (row.total_time_ms ?? 0));
    });
    return Array.from(totals.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([page, totalMs]) => ({ page, totalMs }));
  }, [documentPages]);

  const hasAnalytics =
    metricsTotals.totalViews > 0 ||
    metricsTotals.uniqueViews > 0 ||
    metricsTotals.totalDownloads > 0 ||
    metricsTotals.totalRevisits > 0 ||
    metricsTotals.totalTimeMs > 0;

  const docCategory = useMemo(() => {
    const ext = (documentFileType || "").toLowerCase();
    if (!ext) return "unknown";
    const text = new Set([
      "pdf",
      "ppt",
      "pptx",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "xlsm",
      "csv",
      "md",
    ]);
    const image = new Set(["jpg", "jpeg", "png", "webp"]);
    const video = new Set(["mp4", "mov", "avi", "mkv", "webm"]);
    const audio = new Set(["mp3", "wav", "ogg", "aac"]);
    if (text.has(ext)) return "text";
    if (image.has(ext)) return "image";
    if (video.has(ext)) return "video";
    if (audio.has(ext)) return "audio";
    return "unknown";
  }, [documentFileType]);

  const METRIC_CONFIG = [
    { label: "Total Views", value: metricsTotals.totalViews, icon: Eye },
    { label: "Unique Viewers", value: metricsTotals.uniqueViews, icon: Users },
    {
      label: "Revisits",
      value: metricsTotals.totalRevisits,
      icon: ArrowClockwise,
    },
    {
      label: "Downloads",
      value: metricsTotals.totalDownloads,
      icon: DownloadSimple,
    },
    {
      label: "Total Time",
      value: toHHMMSS(metricsTotals.totalTimeMs),
      icon: Clock,
    },
    { label: "Avg Time / Viewer", value: toHHMMSS(avgTimeMs), icon: Timer },
  ];

  return (
    <div className="space-y-6">
      {versionOptions.length > 2 ? (
        <div className="dk-nocturne-surface rounded-lg bg-card/45 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="af-version-select" className="dk-nocturne-kicker">
              Version
            </Label>
            <Select value={versionKey} onValueChange={setVersionKey}>
              <SelectTrigger id="af-version-select" className="w-full bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versionOptions.map((opt) => (
                  <SelectItem key={opt.key} value={opt.key}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {/* Shared analytics filter bar */}
      <React.Suspense fallback={null}>
        <AnalyticsFilterBar
          links={links.map((l) => ({
            id: l.id,
            label: l.name || l.id,
          }))}
          selectedLinkId={selectedLinkId}
          onLinkChange={setSelectedLinkId}
          isLoadingLinks={isLoadingLinks}
          timeRange={timeRange}
          onTimeRangeChange={(val) => setTimeRange(val as TimeRangeOption)}
          customFrom={customRange.from}
          customTo={customRange.to}
          onCustomRangeChange={(edge, value) =>
            setCustomRange((prev) => ({ ...prev, [edge]: value }))
          }
        />
      </React.Suspense>

      {/* Engagement overview section */}
      <section className="space-y-4 border-t border-border/60 pt-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-medium">Engagement Overview</h2>
            <p className="text-sm text-muted-foreground">
              Aggregated analytics across selected links.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="inline-flex items-center gap-2"
              onClick={() => {
                setRefreshNonce((n) => n + 1);
                void loadLinks();
                void loadAnalytics();
              }}
              disabled={isLoadingMetrics}
            >
              <ArrowClockwise
                className={cn("h-4 w-4", isLoadingMetrics && "animate-spin")}
                aria-hidden
              />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="inline-flex items-center gap-2"
              disabled={
                isLoadingMetrics || isExporting || exportLinkIds.length === 0
              }
              onClick={async () => {
                if (exportLinkIds.length === 0) return;
                setIsExporting(true);
                const filenameHint = `${documentTitle || "document"} viewer insights`;
                try {
                  const res = await fetch(
                    "/api/analytics/export/viewer-insights",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({
                        workspaceId,
                        documentId,
                        linkIds: exportLinkIds,
                        from: dateFilters.from,
                        to: dateFilters.to,
                        contentPaths: selectedContentPaths,
                        filenameHint,
                      }),
                    },
                  );
                  if (!res.ok) {
                    showError("Export failed. Please try again.");
                    return;
                  }

                  const parseFilenameFromContentDisposition = (
                    header: string | null,
                  ): string | null => {
                    if (!header) return null;

                    const unquote = (input: string): string => {
                      const trimmed = input.trim();
                      if (
                        trimmed.length >= 2 &&
                        trimmed.startsWith('"') &&
                        trimmed.endsWith('"')
                      ) {
                        return trimmed.slice(1, -1);
                      }
                      return trimmed;
                    };

                    // RFC 5987: filename*=UTF-8''encoded-filename
                    const starMatch = header.match(/filename\*\s*=\s*([^;]+)/i);
                    if (starMatch?.[1]) {
                      const raw = unquote(starMatch[1]);
                      const encodedPart =
                        raw.match(/^[^']*''(.+)$/)?.[1] ?? raw;
                      try {
                        const decoded = decodeURIComponent(encodedPart);
                        const base = decoded.split(/[/\\]/).pop() ?? decoded;
                        return base.trim() ? base : null;
                      } catch {
                        // ignore decode failures; fall through
                      }
                    }

                    const filenameMatch = header.match(
                      /filename\s*=\s*([^;]+)/i,
                    );
                    if (filenameMatch?.[1]) {
                      const raw = unquote(filenameMatch[1]);
                      const base = raw.split(/[/\\]/).pop() ?? raw;
                      return base.trim() ? base : null;
                    }

                    return null;
                  };

                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  const headerFilename = parseFilenameFromContentDisposition(
                    res.headers.get("Content-Disposition"),
                  );
                  const hintBase = filenameHint.trim() || "viewer-insights";
                  const fallbackFilename = hintBase
                    .toLowerCase()
                    .endsWith(".csv")
                    ? hintBase
                    : `${hintBase}.csv`;
                  a.download =
                    headerFilename ??
                    (fallbackFilename.trim()
                      ? fallbackFilename
                      : "viewer-insights.csv");
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  // Let the browser begin the download before revoking.
                  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                  showSuccess("Export complete");
                } catch (err) {
                  console.error("[MergedDocAnalytics] export failed", err);
                  showError("Export failed. Please try again.");
                } finally {
                  setIsExporting(false);
                }
              }}
            >
              <DownloadSimple className="h-4 w-4" aria-hidden />
              Export CSV
            </Button>
          </div>
        </div>

        {isLoadingMetrics ? (
          <Progress value={loadingProgress} className="h-1 rounded-full" />
        ) : null}

        {hasAnalytics ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {METRIC_CONFIG.map((metric) => (
              <MetricCard
                key={metric.label}
                label={metric.label}
                value={metric.value}
                icon={metric.icon}
              />
            ))}
          </div>
        ) : loadError ? (
          <EmptyState
            title="Couldn't load analytics"
            description="Something went wrong while loading analytics. Please try again."
            icon={<ChartBar aria-hidden className="h-6 w-6 text-destructive" />}
            className="py-10"
            actions={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadAnalytics()}
              >
                Retry
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No analytics data"
            description="Analytics will appear once viewers engage with this document."
            icon={
              <ChartBar aria-hidden className="h-6 w-6 text-muted-foreground" />
            }
            className="py-10"
          />
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="relative overflow-hidden border-border/70 bg-card/55">
          <div
            className="absolute inset-x-0 top-0 h-px bg-primary/45"
            aria-hidden="true"
          />
          <CardHeader>
            <CardTitle className="text-lg font-medium">
              Viewer insights
            </CardTitle>
            <CardDescription>
              Available for links that collect verified viewer emails.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!viewerInsightsEnabled ? (
              <EmptyState
                variant="bare"
                title="Viewer tracking disabled"
                description='Turn on "Collect emails for analytics" on a link to see viewer insights.'
                icon={
                  <Users
                    aria-hidden
                    className="h-6 w-6 text-muted-foreground"
                  />
                }
                compact
                className="py-8"
              />
            ) : isLoadingMetrics ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div
                    key={`viewer_skeleton_${idx}`}
                    className="h-24 animate-pulse rounded bg-muted/60 motion-reduce:animate-none"
                  />
                ))}
              </div>
            ) : viewerInsightsError ? (
              <EmptyState
                variant="bare"
                title="Couldn't load viewer insights"
                description="Overview analytics are still available. Retry this section to load viewer-level data."
                icon={
                  <Users aria-hidden className="h-6 w-6 text-destructive" />
                }
                actions={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void loadAnalytics()}
                  >
                    Retry
                  </Button>
                }
                compact
                className="py-8"
              />
            ) : viewerStats.length === 0 ? (
              <EmptyState
                variant="bare"
                title="No viewer data yet"
                description="Viewer-level data will appear once verified viewers engage."
                icon={
                  <Users
                    aria-hidden
                    className="h-6 w-6 text-muted-foreground"
                  />
                }
                compact
                className="py-8"
              />
            ) : (
              <div className="space-y-3">
                {viewerStats.map((viewer) => (
                  <details
                    key={viewer.email}
                    className="group overflow-hidden rounded border border-border/60 bg-background/20 transition-colors open:border-primary/25"
                  >
                    <summary className="cursor-pointer list-none p-4 transition-colors outline-none hover:bg-primary/[0.025] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring focus-visible:outline-solid focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex size-8 items-center justify-center rounded border border-primary/20 bg-primary/8 text-xs font-medium text-primary">
                            {viewer.email.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {viewer.email}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              Active {formatRelativeTime(viewer.lastEventAt)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                          <span>{formatDuration(viewer.totalTimeMs)}</span>
                        </div>
                      </div>
                    </summary>
                    <div className="space-y-3 border-t border-border/60 p-4 text-sm">
                      {viewer.documents.map((doc) => (
                        <div key={`${viewer.email}-${doc.id}`}>
                          <div className="flex items-center justify-between">
                            <p className="font-medium">{doc.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDuration(doc.totalTimeMs)}
                            </p>
                          </div>
                          {doc.pageBreakdown.length ? (
                            <PageTimeBarChart
                              data={doc.pageBreakdown.map((page) => ({
                                pageNumber: page.pageNumber,
                                totalTimeMs: page.totalTimeMs,
                              }))}
                              className="pt-2"
                              height={180}
                              aria-label={`Per-page attention for ${viewer.email}`}
                            />
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No per-page activity captured yet.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <CountryBreakdownCard
          data={countryStats}
          isLoading={isCountryStatsLoading}
          description="Top countries for the selected links."
          emptyStateMessage="Country data will appear once viewers engage."
        />
      </div>

      {docCategory === "text" ? (
        <Card className="relative overflow-hidden border-border/70 bg-card/55">
          <div
            className="absolute inset-x-0 top-0 h-px bg-primary/45"
            aria-hidden="true"
          />
          <CardHeader>
            <CardTitle className="text-lg font-medium">
              Page attention
            </CardTitle>
            <CardDescription>
              Time spent on each page across selected links.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pageAttention.length ? (
              <PageTimeBarChart
                data={pageAttention.map((page) => ({
                  pageNumber: page.page,
                  totalTimeMs: page.totalMs,
                }))}
                height={240}
                aria-label="Per-page dwell time"
              />
            ) : (
              <EmptyState
                variant="bare"
                title="No per-page analytics yet"
                description="Time spent on pages will appear here."
                icon={
                  <Timer
                    aria-hidden
                    className="h-6 w-6 text-muted-foreground"
                  />
                }
                compact
                className="py-8"
              />
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

export default MergedDocumentAnalyticsPanel;
