import type { ViewerStat, ViewerStatsInput } from "./types";

export const buildViewerStats = ({
  viewers,
  viewerPages,
  docTitleMap = {},
}: ViewerStatsInput): ViewerStat[] => {
  const pageTotalsByViewer = new Map<string, Map<number, number>>();

  viewerPages.forEach((row) => {
    const key = `${row.viewer_key}::${row.document_id}`;
    let totals = pageTotalsByViewer.get(key);
    if (!totals) {
      totals = new Map();
      pageTotalsByViewer.set(key, totals);
    }
    totals.set(
      row.page_number,
      (totals.get(row.page_number) ?? 0) + row.total_time_ms,
    );
  });

  const viewerAggregates = new Map<
    string,
    {
      email: string;
      views: number;
      downloads: number;
      totalTimeMs: number;
      lastEventAt: string;
      documents: Map<
        string,
        {
          id: string;
          title: string;
          totalTimeMs: number;
          pageTotals: Map<number, number>;
        }
      >;
    }
  >();

  viewers.forEach((viewer) => {
    const email = (viewer.viewer_email || "").trim();
    if (!email) {
      return;
    }
    const key = email.toLowerCase();
    const occurredAt = viewer.last_seen_at || new Date().toISOString();
    let stats = viewerAggregates.get(key);
    if (!stats) {
      stats = {
        email,
        views: 0,
        downloads: 0,
        totalTimeMs: 0,
        lastEventAt: occurredAt,
        documents: new Map(),
      };
      viewerAggregates.set(key, stats);
    }
    if (
      new Date(occurredAt).getTime() > new Date(stats.lastEventAt).getTime()
    ) {
      stats.lastEventAt = occurredAt;
    }
    stats.views += viewer.view_count;
    stats.downloads += viewer.download_count;
    stats.totalTimeMs += viewer.total_time_ms;

    if (!viewer.document_id) {
      return;
    }
    if (!stats.documents.has(viewer.document_id)) {
      stats.documents.set(viewer.document_id, {
        id: viewer.document_id,
        title: docTitleMap[viewer.document_id] || "Untitled document",
        totalTimeMs: 0,
        pageTotals: new Map<number, number>(),
      });
    }
    const docStats = stats.documents.get(viewer.document_id)!;
    docStats.totalTimeMs += viewer.total_time_ms;
    const pageKey = `${viewer.viewer_key}::${viewer.document_id}`;
    const pageTotals = pageTotalsByViewer.get(pageKey);
    if (pageTotals) {
      // Keep the full page breakdown for charts; the UI can derive “top pages”
      // by sorting this breakdown when needed.
      docStats.pageTotals = new Map(pageTotals.entries());
    }
  });

  return Array.from(viewerAggregates.values())
    .map((stat) => ({
      email: stat.email,
      views: stat.views,
      downloads: stat.downloads,
      totalTimeMs: stat.totalTimeMs,
      lastEventAt: stat.lastEventAt,
      documents: Array.from(stat.documents.values())
        .map((doc) => ({
          id: doc.id,
          title: doc.title,
          totalTimeMs: doc.totalTimeMs,
          pageBreakdown: Array.from(doc.pageTotals.entries())
            .map(([pageNumber, totalTimeMs]) => ({
              pageNumber,
              totalTimeMs,
            }))
            .sort((a, b) => a.pageNumber - b.pageNumber),
        }))
        .sort((a, b) => b.totalTimeMs - a.totalTimeMs),
    }))
    .sort(
      (a, b) =>
        new Date(b.lastEventAt).getTime() - new Date(a.lastEventAt).getTime(),
    );
};
