import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/generated/supabase";

export type AnalyticsTimeRangeOption = "all" | "7d" | "30d" | "custom";

export type AnalyticsFilterBarProps = {
  links: Array<{ id: string; label: string }>;
  selectedLinkId: string;
  onLinkChange: (id: string) => void;
  isLoadingLinks?: boolean;
  timeRange: AnalyticsTimeRangeOption;
  onTimeRangeChange: (range: AnalyticsTimeRangeOption) => void;
  customFrom: Date | null;
  customTo: Date | null;
  onCustomRangeChange: (edge: "from" | "to", value: Date | null) => void;
  className?: string;
};

export type PageTimeBarChartProps = {
  data: Array<{ pageNumber: number; totalTimeMs: number }>;
  className?: string;
  height?: number;
  "aria-label"?: string;
};

export type CountryBreakdownDatum = {
  countryCode: string;
  totalViews: number;
};

export type CountryBreakdownCardProps = {
  data: CountryBreakdownDatum[];
  isLoading?: boolean;
  title?: string;
  description?: string;
  emptyStateMessage?: string;
};

type ViewerDocumentStat = {
  id: string;
  title: string;
  totalTimeMs: number;
  pageBreakdown: Array<{ pageNumber: number; totalTimeMs: number }>;
};

export type ViewerStat = {
  email: string;
  views: number;
  downloads: number;
  totalTimeMs: number;
  lastEventAt: string;
  documents: ViewerDocumentStat[];
};

export type ViewerStatsInput = {
  viewers: Array<{
    viewer_key: string;
    viewer_email: string | null;
    document_id: string | null;
    view_count: number;
    download_count: number;
    total_time_ms: number;
    last_seen_at: string | null;
  }>;
  viewerPages: Array<{
    viewer_key: string;
    document_id: string;
    page_number: number;
    total_time_ms: number;
  }>;
  docTitleMap?: Record<string, string>;
};

export type AdvancedAnalyticsRequestDeps = {
  createSupabaseServerClient: () => Promise<SupabaseClient<Database>>;
};
