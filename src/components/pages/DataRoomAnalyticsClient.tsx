"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  ArrowsClockwise as RefreshCw,
  CaretDown as ChevronDown,
  ChartBar as BarChart3,
  Clock,
  DownloadSimple as Download,
  Eye,
  FileText,
  Signature as FileSignature,
  Timer,
  UsersThree as Users,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MetricCard } from "@/components/analytics/MetricCard";
import { formatDistanceToNow } from "date-fns";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import type { Tables } from "@/types/generated/supabase";
import type {
  AnalyticsTimeRangeOption as TimeRangeOption,
  CountryBreakdownDatum,
  ViewerStat,
} from "@/modules/advanced-analytics/types";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { showError } from "@/lib/toast";
import { formatDuration } from "@/lib/format";
import { resolveViewerInsightsRpcState } from "@/components/analytics/viewerInsightsState";
/* datetimeLocal helpers now delegated to AnalyticsFilterBar */

const PageTimeBarChart = dynamic(
  () => import("@/modules/advanced-analytics/PageTimeBarChart"),
  {
    ssr: false,
    loading: () => (
      <div className="h-48 w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
    ),
  },
);

const CountryBreakdownCard = dynamic(
  () => import("@/modules/advanced-analytics/CountryBreakdownCard"),
  {
    ssr: false,
    loading: () => (
      <div className="h-48 w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
    ),
  },
);

const AnalyticsFilterBar = React.lazy(
  () => import("@/modules/advanced-analytics/AnalyticsFilterBar"),
);

interface DataRoomAnalyticsClientProps {
  dataRoom: Tables<"data_rooms">;
}

interface EngagementMetrics {
  totalViews: number;
  uniqueViews: number;
  totalTimeMs: number;
  totalRevisits: number;
  avgTimePerViewer: number;
}

interface RoomViewMetrics {
  totalViews: number;
  uniqueViews: number;
}

type DocumentSummary = Pick<Tables<"documents">, "id" | "title" | "updated_at">;

interface DocumentMetric {
  id: string;
  title: string;
  totalViews: number;
  uniqueViews: number;
  totalDownloads: number;
  totalRevisits: number;
  totalTimeMs: number;
  lastViewedAt: string | null;
  pageBreakdown: Array<{ pageNumber: number; totalTimeMs: number }>;
}

/* TimeRangeOption imported from AnalyticsFilterBar */
type CountryViewRow = {
  country_code: string;
  total_views: number;
};

const DOC_OVERVIEW_METRICS: Array<{
  key: keyof EngagementMetrics;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  formatter?: (value: number) => string;
}> = [
  { key: "totalViews", label: "Document views", icon: Eye },
  { key: "uniqueViews", label: "Unique viewers", icon: Users },
  { key: "totalRevisits", label: "Revisits", icon: RefreshCw },
  {
    key: "totalTimeMs",
    label: "Total time spent",
    icon: Clock,
    formatter: (value) => formatDuration(value),
  },
  {
    key: "avgTimePerViewer",
    label: "Avg time / viewer",
    icon: Timer,
    formatter: (value) => formatDuration(value),
  },
];

type DataRoomLinkMeta = Pick<
  Tables<"links">,
  | "id"
  | "name"
  | "email_verification"
  | "nda_gate"
  | "collect_email_for_analytics"
>;

type NdaSignatureWithLink = Pick<
  Tables<"nda_signatures">,
  "id" | "full_name" | "email" | "signed_at" | "signed_pdf_path" | "link_id"
> & {
  links: { name: string | null } | null;
};

const resolveRangeStart = (range: TimeRangeOption): string | null => {
  if (range === "all") return null;
  const now = Date.now();
  const days = range === "7d" ? 7 : 30;
  const cutoff = new Date(now - days * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
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

const DataRoomAnalyticsClient: React.FC<DataRoomAnalyticsClientProps> = ({
  dataRoom,
}) => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [docOverview, setDocOverview] = useState<EngagementMetrics>({
    totalViews: 0,
    uniqueViews: 0,
    totalTimeMs: 0,
    totalRevisits: 0,
    avgTimePerViewer: 0,
  });
  const [roomOverview, setRoomOverview] = useState<RoomViewMetrics>({
    totalViews: 0,
    uniqueViews: 0,
  });
  const [isLoadingMetrics, setIsLoadingMetrics] = useState<boolean>(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [links, setLinks] = useState<DataRoomLinkMeta[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState<boolean>(false);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState<boolean>(true);
  const [selectedLinkId, setSelectedLinkId] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<TimeRangeOption>("all");
  const [customRange, setCustomRange] = useState<{
    from: Date | null;
    to: Date | null;
  }>({ from: null, to: null });
  const [viewerStats, setViewerStats] = useState<ViewerStat[]>([]);
  const [viewerInsightsError, setViewerInsightsError] =
    useState<boolean>(false);
  const [documentMetrics, setDocumentMetrics] = useState<DocumentMetric[]>([]);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [countryStats, setCountryStats] = useState<CountryBreakdownDatum[]>([]);
  const [isCountryStatsLoading, setIsCountryStatsLoading] =
    useState<boolean>(false);
  const [ndaSignatures, setNdaSignatures] = useState<NdaSignatureWithLink[]>(
    [],
  );
  const [isNdaLoading, setIsNdaLoading] = useState<boolean>(false);
  const [isNdaDialogOpen, setIsNdaDialogOpen] = useState<boolean>(false);
  const [downloadingNdaId, setDownloadingNdaId] = useState<string | null>(null);

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

  const selectedLinkLabel = useMemo(() => {
    if (selectedLinkId === "all") return "All links";
    const link = links.find((l) => l.id === selectedLinkId);
    return link?.name || "Selected link";
  }, [links, selectedLinkId]);

  const selectedLinkIds = useMemo(() => {
    if (!links.length) return [];
    if (selectedLinkId === "all") {
      return links.map((link) => link.id);
    }
    const target = links.find((link) => link.id === selectedLinkId);
    return target ? [target.id] : [];
  }, [links, selectedLinkId]);

  const viewerInsightsEnabled = useMemo(() => {
    if (!links.length) return false;
    if (selectedLinkId === "all") {
      return links.some((link) => link.collect_email_for_analytics);
    }
    const target = links.find((link) => link.id === selectedLinkId);
    return Boolean(target?.collect_email_for_analytics);
  }, [links, selectedLinkId]);

  const ndaEnabledSelectedLinkIds = useMemo(() => {
    if (!links.length) return [];
    const ndaEnabledIds = new Set(
      links.filter((link) => Boolean(link.nda_gate)).map((link) => link.id),
    );
    return selectedLinkIds.filter((id) => ndaEnabledIds.has(id));
  }, [links, selectedLinkIds]);

  const ndaSignatureCount = ndaSignatures.length;

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [],
  );

  const formatDateTime = useCallback(
    (value: string | null | undefined) => {
      if (!value) return "—";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "—";
      return dateFormatter.format(date);
    },
    [dateFormatter],
  );

  const loadNdaSignatures = useCallback(async () => {
    if (!ndaEnabledSelectedLinkIds.length) {
      setNdaSignatures([]);
      setIsNdaLoading(false);
      return;
    }

    setIsNdaLoading(true);
    try {
      const { data, error } = await supabase
        .from("nda_signatures")
        .select(
          "id, full_name, email, signed_at, signed_pdf_path, link_id, links(name)",
        )
        .eq("workspace_id", dataRoom.workspace_id)
        .eq("data_room_id", dataRoom.id)
        .in("link_id", ndaEnabledSelectedLinkIds)
        .order("signed_at", { ascending: false });

      if (error) {
        console.error("[DataRoomAnalytics] NDA signatures fetch failed", error);
        setNdaSignatures([]);
        return;
      }

      setNdaSignatures((data as NdaSignatureWithLink[]) ?? []);
    } catch (err) {
      console.error("[DataRoomAnalytics] NDA signatures unexpected error", err);
      setNdaSignatures([]);
    } finally {
      setIsNdaLoading(false);
    }
  }, [dataRoom.id, dataRoom.workspace_id, ndaEnabledSelectedLinkIds, supabase]);

  const downloadNdaPdf = useCallback(
    async (signature: NdaSignatureWithLink) => {
      if (!signature.signed_pdf_path) {
        showError("Signed NDA PDF is still being prepared. Try again shortly.");
        return;
      }
      setDownloadingNdaId(signature.id);
      try {
        const res = await fetch("/api/documents/download-signed-nda", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signatureId: signature.id }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Download failed");
        }

        const data = await res.json();
        if (!data.signedUrl) throw new Error("No URL returned");

        const url = data.signedUrl;
        if (typeof window !== "undefined") {
          const safeName = (signature.full_name || "Viewer")
            .replace(/[^a-zA-Z0-9-_ ]/g, "")
            .trim();
          const filename = `${safeName} - NDA_Signed.pdf`;

          const link = document.createElement("a");
          link.href = url;
          link.setAttribute("download", filename);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } catch (err) {
        console.error("[DataRoomAnalytics] NDA download failed", err);
        showError("Unable to download the signed NDA.");
      } finally {
        setDownloadingNdaId(null);
      }
    },
    [],
  );

  const docTitleMap = useMemo<Record<string, string>>(() => {
    return documents.reduce<Record<string, string>>((acc, doc) => {
      acc[doc.id] = doc.title?.trim() || "Untitled document";
      return acc;
    }, {});
  }, [documents]);

  useEffect(() => {
    void loadNdaSignatures();
  }, [loadNdaSignatures]);

  useEffect(() => {
    if (!isNdaDialogOpen) return;
    void loadNdaSignatures();
  }, [isNdaDialogOpen, loadNdaSignatures]);

  useEffect(() => {
    if (!isNdaDialogOpen) return;
    if (!ndaEnabledSelectedLinkIds.length) return;
    if (!ndaSignatures.length) return;
    if (
      ndaSignatures.every((signature) => Boolean(signature.signed_pdf_path))
    ) {
      return;
    }

    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      if (attempts > 20) {
        clearInterval(interval);
        return;
      }
      void loadNdaSignatures();
    }, 3000);

    return () => clearInterval(interval);
  }, [
    isNdaDialogOpen,
    ndaEnabledSelectedLinkIds,
    ndaSignatures,
    loadNdaSignatures,
  ]);

  const documentViewerHighlights = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    viewerStats.forEach((viewer) => {
      viewer.documents.forEach((doc) => {
        if (!map[doc.id]) {
          map[doc.id] = [];
        }
        if (map[doc.id]!.length < 3) {
          map[doc.id]!.push(viewer.email);
        }
      });
    });
    return map;
  }, [viewerStats]);

  useEffect(() => {
    if (!selectedLinkIds.length) {
      setCountryStats([]);
      return;
    }
    let active = true;
    setIsCountryStatsLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc(
          "get_link_country_views_v2",
          {
            p_workspace_id: dataRoom.workspace_id,
            p_link_ids: selectedLinkIds,
            p_content_paths: undefined,
            p_from_ts: dateFilters.from ?? undefined,
            p_to_ts: dateFilters.to ?? undefined,
          },
        );
        if (!active) return;
        if (error) {
          if (isCountryRpcMissingError(error)) {
            logCountryRpcError("[DataRoomAnalytics]", error);
          } else {
            void error;
            setCountryStats([]);
          }
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
            "[DataRoomAnalytics] unexpected country views error",
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
    dataRoom.workspace_id,
    selectedLinkIds,
    supabase,
    dateFilters.from,
    dateFilters.to,
  ]);

  const loadLinks = useCallback(async () => {
    setIsLoadingLinks(true);
    try {
      const { data, error } = await supabase
        .from("links")
        .select(
          "id, name, email_verification, nda_gate, collect_email_for_analytics",
        )
        .eq("workspace_id", dataRoom.workspace_id)
        .eq("data_room_id", dataRoom.id)
        .order("created_at", { ascending: true });
      if (error) {
        console.error("[DataRoomAnalytics] Failed to load links", error);
        setLinks([]);
        return;
      }
      setLinks(data ?? []);
    } finally {
      setIsLoadingLinks(false);
    }
  }, [supabase, dataRoom.id, dataRoom.workspace_id]);

  const loadDocuments = useCallback(async () => {
    setIsLoadingDocuments(true);
    try {
      const { data, error } = await supabase
        .from("documents")
        .select("id, title, updated_at")
        .eq("workspace_id", dataRoom.workspace_id)
        .eq("data_room_id", dataRoom.id)
        .order("title", { ascending: true });
      if (error) {
        console.error("[DataRoomAnalytics] Failed to load documents", error);
        setDocuments([]);
        return;
      }
      setDocuments(data ?? []);
    } finally {
      setIsLoadingDocuments(false);
    }
  }, [supabase, dataRoom.id, dataRoom.workspace_id]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const handleCustomRangeChange = useCallback(
    (key: "from" | "to", nextValue: Date | null) => {
      setCustomRange((prev) => {
        if (!nextValue) {
          return { ...prev, [key]: null };
        }
        if (key === "from" && prev.to && nextValue > prev.to) {
          return { from: nextValue, to: nextValue };
        }
        if (key === "to" && prev.from && nextValue < prev.from) {
          return { from: nextValue, to: nextValue };
        }
        return { ...prev, [key]: nextValue };
      });
    },
    [],
  );

  const toggleDocumentRow = useCallback((docId: string) => {
    setExpandedDocId((prev) => (prev === docId ? null : docId));
  }, []);

  const loadAnalytics = useCallback(async () => {
    setIsLoadingMetrics(true);
    setViewerInsightsError(false);
    try {
      const docIds = documents.map((doc) => doc.id);
      const rangeStart = dateFilters.from ?? undefined;
      const rangeEnd = dateFilters.to ?? undefined;

      const roomLinkIds =
        selectedLinkId === "all"
          ? links.map((link) => link.id)
          : [selectedLinkId];

      const roomResourcePromise =
        roomLinkIds.length > 0
          ? supabase.rpc("get_resource_link_metrics_v2", {
              p_workspace_id: dataRoom.workspace_id,
              p_resource_type: "data_room",
              p_resource_id: dataRoom.id,
              p_link_ids: roomLinkIds,
              p_from_ts: rangeStart,
              p_to_ts: rangeEnd,
            })
          : Promise.resolve({ data: [], error: null });

      const docResourcesPromise =
        docIds.length > 0
          ? supabase.rpc("get_documents_metrics_v2", {
              p_workspace_id: dataRoom.workspace_id,
              p_document_ids: docIds,
              p_link_id: selectedLinkId === "all" ? undefined : selectedLinkId,
              p_from_ts: rangeStart,
              p_to_ts: rangeEnd,
            })
          : Promise.resolve({ data: [], error: null });

      const docPagesPromise =
        docIds.length > 0
          ? supabase.rpc("get_documents_page_attention_v2", {
              p_workspace_id: dataRoom.workspace_id,
              p_document_ids: docIds,
              p_link_id: selectedLinkId === "all" ? undefined : selectedLinkId,
              p_from_ts: rangeStart,
              p_to_ts: rangeEnd,
            })
          : Promise.resolve({ data: [], error: null });

      const viewerRowsPromise =
        viewerInsightsEnabled && docIds.length > 0
          ? supabase.rpc("get_documents_viewer_insights_v2", {
              p_workspace_id: dataRoom.workspace_id,
              p_document_ids: docIds,
              p_link_id: selectedLinkId === "all" ? undefined : selectedLinkId,
              p_from_ts: rangeStart,
              p_to_ts: rangeEnd,
            })
          : Promise.resolve({ data: [], error: null });

      const viewerPagesPromise =
        viewerInsightsEnabled && docIds.length > 0
          ? supabase.rpc("get_documents_viewer_pages_v2", {
              p_workspace_id: dataRoom.workspace_id,
              p_document_ids: docIds,
              p_link_id: selectedLinkId === "all" ? undefined : selectedLinkId,
              p_from_ts: rangeStart,
              p_to_ts: rangeEnd,
            })
          : Promise.resolve({ data: [], error: null });

      const [
        { data: roomResourceRows, error: roomResourceError },
        docResourceResult,
        docPagesResult,
        viewerRowsResult,
        viewerPagesResult,
      ] = await Promise.all([
        roomResourcePromise,
        docResourcesPromise,
        docPagesPromise,
        viewerRowsPromise,
        viewerPagesPromise,
      ]);

      if (roomResourceError) {
        throw roomResourceError;
      }
      if (docResourceResult.error) {
        throw docResourceResult.error;
      }
      if (docPagesResult.error) {
        throw docPagesResult.error;
      }
      const roomTotals: EngagementMetrics = (roomResourceRows || []).reduce(
        (acc, row) => ({
          totalViews: acc.totalViews + (row.total_views ?? 0),
          uniqueViews: acc.uniqueViews + (row.unique_viewers ?? 0),
          totalTimeMs: acc.totalTimeMs + (row.total_time_ms ?? 0),
          totalRevisits: acc.totalRevisits + (row.total_revisits ?? 0),
          avgTimePerViewer: 0, // Calculated later
        }),
        {
          totalViews: 0,
          uniqueViews: 0,
          totalTimeMs: 0,
          totalRevisits: 0,
          avgTimePerViewer: 0,
        },
      );

      const docMetricsMap = new Map<
        string,
        {
          metric: DocumentMetric;
          pageTotals: Map<number, number>;
        }
      >();

      const ensureDocMetric = (docId: string) => {
        if (!docMetricsMap.has(docId)) {
          docMetricsMap.set(docId, {
            metric: {
              id: docId,
              title: docTitleMap[docId] || "Untitled document",
              totalViews: 0,
              uniqueViews: 0,
              totalDownloads: 0,
              totalRevisits: 0,
              totalTimeMs: 0,
              lastViewedAt: null,
              pageBreakdown: [],
            },
            pageTotals: new Map<number, number>(),
          });
        }
        return docMetricsMap.get(docId)!;
      };

      documents.forEach((doc) => {
        ensureDocMetric(doc.id);
      });

      (docResourceResult.data || []).forEach((row) => {
        if (!row.document_id) return;
        const entry = ensureDocMetric(row.document_id);
        entry.metric.totalViews += row.total_views ?? 0;
        entry.metric.uniqueViews += row.unique_viewers ?? 0;
        entry.metric.totalDownloads += row.total_downloads ?? 0;
        entry.metric.totalRevisits += row.total_revisits ?? 0;
        entry.metric.totalTimeMs += row.total_time_ms ?? 0;
        if (
          row.last_seen_at &&
          (!entry.metric.lastViewedAt ||
            row.last_seen_at > entry.metric.lastViewedAt)
        ) {
          entry.metric.lastViewedAt = row.last_seen_at;
        }
      });

      (docPagesResult.data || []).forEach((row) => {
        if (!row.document_id || typeof row.page_number !== "number") return;
        const entry = ensureDocMetric(row.document_id);
        const prev = entry.pageTotals.get(row.page_number) ?? 0;
        entry.pageTotals.set(row.page_number, prev + (row.total_time_ms ?? 0));
      });

      const docMetricsArray = Array.from(docMetricsMap.values())
        .map(({ metric, pageTotals }) => {
          const pageBreakdown = Array.from(pageTotals.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([pageNumber, totalTimeMs]) => ({
              pageNumber,
              totalTimeMs,
            }));
          return { ...metric, pageBreakdown };
        })
        .sort((a, b) => {
          if (b.totalViews === a.totalViews) {
            return b.totalTimeMs - a.totalTimeMs;
          }
          return b.totalViews - a.totalViews;
        });

      const viewerRpcState = resolveViewerInsightsRpcState({
        enabled: viewerInsightsEnabled,
        viewerRowsError: viewerRowsResult.error,
        viewerPagesError: viewerPagesResult.error,
      });
      if (viewerRpcState === "error") {
        console.error("[DataRoomAnalytics] Viewer insights RPC failed", {
          viewerRowsError: viewerRowsResult.error,
          viewerPagesError: viewerPagesResult.error,
        });
        setViewerInsightsError(true);
      }
      const viewerRows =
        viewerRpcState === "ready"
          ? ((viewerRowsResult.data as unknown as Array<{
              viewer_key: string;
              viewer_email: string | null;
              document_id: string | null;
              view_count: number;
              download_count: number;
              total_time_ms: number;
              last_seen_at: string | null;
            }>) ?? [])
          : [];
      const viewerPages =
        viewerRpcState === "ready"
          ? ((viewerPagesResult.data as unknown as Array<{
              viewer_key: string;
              document_id: string;
              page_number: number;
              total_time_ms: number;
            }>) ?? [])
          : [];

      const viewerStatRows =
        viewerInsightsEnabled && viewerRows.length
          ? await (
              await import("@/modules/advanced-analytics/viewerInsights")
            ).buildViewerStats({
              viewers: viewerRows,
              viewerPages,
              docTitleMap,
            })
          : [];

      const docTotals = docMetricsArray.reduce<EngagementMetrics>(
        (acc, metric) => ({
          totalViews: acc.totalViews + metric.totalViews,
          uniqueViews: acc.uniqueViews + metric.uniqueViews,
          totalTimeMs: acc.totalTimeMs + metric.totalTimeMs,
          totalRevisits: acc.totalRevisits + metric.totalRevisits,
          avgTimePerViewer: 0,
        }),
        {
          totalViews: 0,
          uniqueViews: 0,
          totalTimeMs: 0,
          totalRevisits: 0,
          avgTimePerViewer: 0,
        },
      );

      // Calculate avg time per viewer
      if (docTotals.uniqueViews > 0) {
        docTotals.avgTimePerViewer = Math.round(
          docTotals.totalTimeMs / docTotals.uniqueViews,
        );
      }

      setDocOverview(docTotals);
      setRoomOverview({
        totalViews: roomTotals.totalViews,
        uniqueViews: roomTotals.uniqueViews,
      });
      setDocumentMetrics(docMetricsArray);
      setViewerStats(viewerStatRows);
    } catch (error) {
      console.error("[DataRoomAnalytics] Failed to load analytics", error);
      setDocOverview({
        totalViews: 0,
        uniqueViews: 0,
        totalTimeMs: 0,
        totalRevisits: 0,
        avgTimePerViewer: 0,
      });
      setRoomOverview({ totalViews: 0, uniqueViews: 0 });
      setDocumentMetrics([]);
      setViewerStats([]);
      setViewerInsightsError(viewerInsightsEnabled);
    } finally {
      setIsLoadingMetrics(false);
    }
  }, [
    supabase,
    dataRoom.id,
    selectedLinkId,
    links,
    documents,
    docTitleMap,
    dateFilters.from,
    dateFilters.to,
    dataRoom.workspace_id,
    viewerInsightsEnabled,
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
    setExpandedDocId(null);
  }, [selectedLinkId, timeRange, dateFilters.from, dateFilters.to]);

  const hasAnalytics = Boolean(
    docOverview.totalViews ||
    docOverview.uniqueViews ||
    docOverview.totalTimeMs ||
    docOverview.totalRevisits,
  );

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
        title="Engagement overview"
        description={`Monitor how viewers interact with ${dataRoom.name}.`}
        actions={
          <Button
            variant="outline"
            onClick={() => {
              void loadLinks();
              void loadAnalytics();
            }}
            disabled={isLoadingMetrics}
            className="hidden md:inline-flex"
          >
            <RefreshCw
              className={cn(
                "mr-2 h-4 w-4",
                isLoadingMetrics && "animate-spin motion-reduce:animate-none",
              )}
              aria-hidden
            />
            Refresh
          </Button>
        }
        className="mb-6"
      />

      <div className="space-y-7">
        <section aria-label="Analytics filters">
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
                handleCustomRangeChange(edge, value)
              }
              className="mb-1"
            />
          </React.Suspense>
        </section>

        {ndaEnabledSelectedLinkIds.length ? (
          <section aria-label="NDA signatures">
            <SurfaceCard className="bg-card/35 [box-shadow:none]">
              <CardHeader className="border-b border-border/60 pb-4">
                <CardTitle className="text-lg font-medium">
                  Signed NDAs
                </CardTitle>
                <CardDescription>
                  Viewer signatures collected for NDA-enabled links.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded border border-primary/20 bg-primary/10 p-2 text-primary">
                      <FileSignature className="h-4 w-4" aria-hidden />
                    </div>
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        NDA signatures
                      </p>
                      <p className="text-sm">
                        {isNdaLoading
                          ? "Checking for signatures..."
                          : ndaSignatureCount
                            ? `${ndaSignatureCount} viewer${ndaSignatureCount === 1 ? "" : "s"} signed`
                            : "Awaiting the first signature."}
                      </p>
                    </div>
                  </div>
                  <Dialog
                    open={isNdaDialogOpen}
                    onOpenChange={setIsNdaDialogOpen}
                  >
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label="View NDA signatures"
                      >
                        View signatures
                        {ndaSignatureCount ? (
                          <Badge variant="secondary" className="ml-2">
                            {ndaSignatureCount}
                          </Badge>
                        ) : null}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl p-6">
                      <DialogHeader className="mb-4">
                        <DialogTitle>Signed NDAs</DialogTitle>
                        <DialogDescription>
                          Viewer signatures captured for the currently selected
                          link filter.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="max-h-[60vh] space-y-3 overflow-y-auto">
                        {isNdaLoading ? (
                          <div className="space-y-2">
                            <div className="h-16 w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
                            <div className="h-16 w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
                          </div>
                        ) : ndaSignatures.length ? (
                          ndaSignatures.map((signature) => (
                            <div
                              key={signature.id}
                              className="flex flex-col gap-3 rounded-lg border border-border/70 bg-card/35 p-4 transition-colors hover:border-primary/30 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="space-y-1">
                                <p className="text-sm font-medium">
                                  {signature.full_name || "Viewer"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {signature.email}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Link:{" "}
                                  {signature.links?.name ||
                                    signature.link_id ||
                                    "—"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Signed {formatDateTime(signature.signed_at)}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={
                                  !signature.signed_pdf_path ||
                                  downloadingNdaId === signature.id
                                }
                                onClick={() => void downloadNdaPdf(signature)}
                              >
                                <Download
                                  className="mr-1.5 h-4 w-4"
                                  aria-hidden
                                />
                                {downloadingNdaId === signature.id
                                  ? "Preparing..."
                                  : "Download PDF"}
                              </Button>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No signatures captured yet.
                          </p>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </SurfaceCard>
          </section>
        ) : null}

        <section
          aria-label="Analytics metrics"
          data-guide="data-room-analytics-overview"
        >
          <div className="space-y-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-medium">Engagement Overview</h2>
                <p className="text-sm text-muted-foreground">
                  Document-focused analytics for the selected filters.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="inline-flex items-center gap-2 md:hidden"
                onClick={() => void loadAnalytics()}
                disabled={isLoadingMetrics}
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4",
                    isLoadingMetrics &&
                      "animate-spin motion-reduce:animate-none",
                  )}
                  aria-hidden
                />
                Refresh
              </Button>
            </div>

            {isLoadingMetrics ? (
              <Progress value={loadingProgress} className="h-1 rounded-full" />
            ) : null}

            {hasAnalytics ? (
              <div className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {DOC_OVERVIEW_METRICS.map((metric) => {
                    const value = docOverview[metric.key];
                    const displayValue = metric.formatter
                      ? metric.formatter(value)
                      : value;
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
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="dk-nocturne-surface rounded-lg bg-card/35 p-5">
                    <div className="mb-4 border-b border-border/60 pb-3">
                      <h3 className="font-medium">Documents Summary</h3>
                      <p className="text-sm text-muted-foreground">
                        Detailed engagement across all shared documents.
                      </p>
                    </div>
                    <dl className="space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <dt className="text-muted-foreground">
                          Total document views
                        </dt>
                        <dd className="font-medium">
                          {docOverview.totalViews}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-muted-foreground">
                          Unique document viewers
                        </dt>
                        <dd className="font-medium">
                          {docOverview.uniqueViews}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-muted-foreground">Revisits</dt>
                        <dd className="font-medium">
                          {docOverview.totalRevisits}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-muted-foreground">
                          Time spent on documents
                        </dt>
                        <dd className="font-medium">
                          {formatDuration(docOverview.totalTimeMs)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="dk-nocturne-surface rounded-lg bg-card/35 p-5">
                    <div className="mb-4 border-b border-border/60 pb-3">
                      <h3 className="font-medium">Data Room Summary</h3>
                      <p className="text-sm text-muted-foreground">
                        Overall room traffic for the selected filters.
                      </p>
                    </div>
                    {roomOverview.totalViews === 0 &&
                    roomOverview.uniqueViews === 0 ? (
                      <EmptyState
                        variant="bare"
                        title="No room-level views yet"
                        description="Room-level views will appear once this data room receives traffic matching your filters."
                        icon={
                          <Eye
                            className="h-6 w-6 text-muted-foreground"
                            aria-hidden
                          />
                        }
                        compact
                        className="py-8"
                      />
                    ) : (
                      <dl className="space-y-3 text-sm">
                        <div className="flex items-center justify-between">
                          <dt className="text-muted-foreground">
                            Total room views
                          </dt>
                          <dd className="font-medium">
                            {roomOverview.totalViews}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between">
                          <dt className="text-muted-foreground">
                            Unique room viewers
                          </dt>
                          <dd className="font-medium">
                            {roomOverview.uniqueViews}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                title="No analytics data"
                description="Analytics will appear here once your data room receives traffic matching your filters."
                icon={
                  <BarChart3
                    className="h-6 w-6 text-muted-foreground"
                    aria-hidden
                  />
                }
                className="py-12"
              />
            )}
          </div>
        </section>

        <section aria-label="Document analytics">
          <SurfaceCard
            className="bg-card/35 [box-shadow:none]"
            data-guide="data-room-analytics-documents"
          >
            <CardHeader className="border-b border-border/60 pb-4">
              <CardTitle className="text-lg font-medium">
                Document activity
              </CardTitle>
              <CardDescription>
                Per-document engagement across this data room.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingDocuments ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <div
                      key={`doc_skeleton_${idx}`}
                      className="h-16 w-full animate-pulse rounded bg-muted/60 motion-reduce:animate-none"
                    />
                  ))}
                </div>
              ) : documentMetrics.length === 0 ? (
                <EmptyState
                  variant="bare"
                  title="No document activity yet"
                  description="Upload files to start tracking engagement."
                  icon={
                    <FileText
                      className="h-6 w-6 text-muted-foreground"
                      aria-hidden
                    />
                  }
                  compact
                  className="py-10"
                />
              ) : (
                <div className="relative overflow-x-auto rounded-lg border border-border/70 bg-card/20">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border/60 bg-muted/25">
                      <tr className="text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">
                        <th className="px-4 py-3 font-semibold">Document</th>
                        <th className="px-4 py-3 font-semibold">Views</th>
                        <th className="px-4 py-3 font-semibold">Unique</th>
                        <th className="px-4 py-3 font-semibold">Revisits</th>
                        <th className="px-4 py-3 font-semibold">Downloads</th>
                        <th className="px-4 py-3 font-semibold">Time spent</th>
                        <th className="px-4 py-3 font-semibold">Last viewed</th>
                        {viewerInsightsEnabled ? (
                          <th className="px-4 py-3 font-semibold">
                            Top viewers
                          </th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {documentMetrics.map((doc) => {
                        const highlights =
                          documentViewerHighlights[doc.id] || [];
                        const isExpanded = expandedDocId === doc.id;
                        return (
                          <React.Fragment key={doc.id}>
                            <tr
                              className={cn(
                                "border-b border-border/50 transition-colors",
                                "cursor-pointer hover:bg-primary/[0.025]",
                                isExpanded ? "bg-primary/[0.025]" : "",
                              )}
                              onClick={() => toggleDocumentRow(doc.id)}
                            >
                              <td className="px-4 py-3 align-top">
                                <div className="flex items-start gap-2">
                                  <ChevronDown
                                    className={cn(
                                      "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                                      isExpanded ? "rotate-180" : "-rotate-90",
                                    )}
                                    aria-hidden
                                  />
                                  <div>
                                    <p className="font-medium text-foreground">
                                      {doc.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {doc.lastViewedAt
                                        ? `Last opened ${formatRelativeTime(doc.lastViewedAt)}`
                                        : "No views yet"}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                {doc.totalViews}
                              </td>
                              <td className="px-4 py-3 align-top">
                                {doc.uniqueViews}
                              </td>
                              <td className="px-4 py-3 align-top">
                                {doc.totalRevisits}
                              </td>
                              <td className="px-4 py-3 align-top">
                                {doc.totalDownloads}
                              </td>
                              <td className="px-4 py-3 align-top">
                                {formatDuration(doc.totalTimeMs)}
                              </td>
                              <td className="px-4 py-3 align-top">
                                {doc.lastViewedAt
                                  ? formatRelativeTime(doc.lastViewedAt)
                                  : "—"}
                              </td>
                              {viewerInsightsEnabled ? (
                                <td className="px-4 py-3 align-top">
                                  {highlights.length ? (
                                    <div className="flex flex-wrap gap-1">
                                      {highlights.map((email) => (
                                        <Badge
                                          key={`${doc.id}-${email}`}
                                          variant="secondary"
                                          className="rounded-sm px-1 py-0 text-[10px]"
                                        >
                                          {email}
                                        </Badge>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </td>
                              ) : null}
                            </tr>
                            {isExpanded ? (
                              <tr className="border-b border-border/50 bg-muted/10">
                                <td
                                  colSpan={viewerInsightsEnabled ? 8 : 7}
                                  className="p-4"
                                >
                                  {doc.pageBreakdown.length ? (
                                    <div className="space-y-4">
                                      <div>
                                        <p className="text-xs font-semibold tracking-wider text-foreground uppercase">
                                          Time spent per page
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          Visual breakdown of engagement by
                                          page.
                                        </p>
                                      </div>
                                      <PageTimeBarChart
                                        data={doc.pageBreakdown.map((page) => ({
                                          pageNumber: page.pageNumber,
                                          totalTimeMs: page.totalTimeMs || 0,
                                        }))}
                                        height={180}
                                        aria-label={`Page dwell for ${doc.title}`}
                                      />
                                    </div>
                                  ) : (
                                    <div className="py-4 text-center">
                                      <p className="text-sm text-muted-foreground">
                                        Page-level analytics will appear once
                                        viewers engage with this document.
                                      </p>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ) : null}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </SurfaceCard>
        </section>

        <section aria-label="Viewer insights">
          <div className="grid gap-4 lg:grid-cols-2">
            <SurfaceCard
              className="bg-card/35 [box-shadow:none]"
              data-guide="data-room-analytics-viewers"
            >
              <CardHeader className="border-b border-border/60 pb-4">
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
                    description='Turn on "Collect emails for analytics" on a link to see who is viewing your documents. Email verification activates automatically.'
                    icon={
                      <Users
                        className="h-6 w-6 text-muted-foreground"
                        aria-hidden
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
                        className="h-24 animate-pulse rounded-lg bg-muted/60 motion-reduce:animate-none"
                      />
                    ))}
                  </div>
                ) : viewerInsightsError ? (
                  <EmptyState
                    variant="bare"
                    title="Couldn't load viewer insights"
                    description="Overview analytics are still available. Retry this section to load viewer-level data."
                    icon={
                      <Users className="h-6 w-6 text-destructive" aria-hidden />
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
                    description="Viewer-level data will appear once verified viewers engage with this selection."
                    icon={
                      <Users
                        className="h-6 w-6 text-muted-foreground"
                        aria-hidden
                      />
                    }
                    compact
                    className="py-8"
                  />
                ) : (
                  <div className="space-y-3">
                    {viewerStats.map((viewer) => {
                      const docsToShow = viewer.documents.slice(0, 3);
                      const remainingDocs =
                        viewer.documents.length > docsToShow.length
                          ? viewer.documents.length - docsToShow.length
                          : 0;
                      const fullDuration = formatDuration(viewer.totalTimeMs);
                      const timeBadge =
                        fullDuration.split(" ")[0] ?? fullDuration;

                      return (
                        <details
                          key={viewer.email}
                          className="group overflow-hidden rounded-lg border border-border/70 bg-card/25 transition-colors open:border-primary/25"
                        >
                          <summary className="cursor-pointer list-none p-4 transition-colors hover:bg-primary/[0.025] [&::-webkit-details-marker]:hidden">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex min-w-0 items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-medium text-primary">
                                  {viewer.email.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">
                                    {viewer.email}
                                  </p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    Active{" "}
                                    {formatRelativeTime(viewer.lastEventAt)}
                                  </p>
                                </div>
                              </div>
                              <ChevronDown
                                className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                                aria-hidden
                              />
                            </div>

                            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                              <div className="rounded-md bg-muted/30 p-2">
                                <span className="block text-lg font-medium">
                                  {viewer.views}
                                </span>
                                <span className="text-muted-foreground">
                                  Views
                                </span>
                              </div>
                              <div className="rounded-md bg-muted/30 p-2">
                                <span className="block text-lg font-medium">
                                  {viewer.downloads}
                                </span>
                                <span className="text-muted-foreground">
                                  Dlwd
                                </span>
                              </div>
                              <div className="rounded-md bg-muted/30 p-2">
                                <span className="block text-lg font-medium">
                                  {timeBadge}
                                </span>
                                <span className="text-muted-foreground">
                                  Time
                                </span>
                              </div>
                            </div>
                          </summary>

                          <div className="space-y-4 border-t border-border/60 p-4">
                            {docsToShow.length ? (
                              <>
                                {docsToShow.map((doc) => {
                                  const chartData = doc.pageBreakdown.map(
                                    (page) => ({
                                      pageNumber: page.pageNumber,
                                      totalTimeMs: page.totalTimeMs,
                                    }),
                                  );

                                  return (
                                    <div
                                      key={`${viewer.email}-${doc.id}`}
                                      className="space-y-2"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <p className="truncate text-sm font-medium">
                                          {doc.title}
                                        </p>
                                        <p className="text-xs whitespace-nowrap text-muted-foreground">
                                          {formatDuration(doc.totalTimeMs)}
                                        </p>
                                      </div>

                                      {chartData.length ? (
                                        <PageTimeBarChart
                                          data={chartData}
                                          className="pt-2"
                                          height={200}
                                          aria-label={`Per-page attention for ${viewer.email} on ${doc.title}`}
                                        />
                                      ) : (
                                        <p className="text-xs text-muted-foreground">
                                          No per-page activity captured yet for
                                          this document.
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}

                                {remainingDocs > 0 ? (
                                  <p className="text-xs text-muted-foreground">
                                    {remainingDocs} more document
                                    {remainingDocs === 1 ? "" : "s"} not shown.
                                  </p>
                                ) : null}
                              </>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                No per-document activity captured yet.
                              </p>
                            )}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </SurfaceCard>
            <CountryBreakdownCard
              data={countryStats}
              isLoading={isCountryStatsLoading}
              description={`Top countries for ${selectedLinkLabel}.`}
              emptyStateMessage="Country data will appear once viewers engage with this selection."
            />
          </div>
        </section>
      </div>
    </PageContainer>
  );
};

export default DataRoomAnalyticsClient;
