"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import type { PageTimeBarChartProps } from "./types";

const getNiceUpperBound = (ms: number) => {
  if (ms <= 0) return 10000; // default 10s
  const seconds = ms / 1000;
  if (seconds <= 10) return 10 * 1000;
  if (seconds <= 30) return 30 * 1000;
  if (seconds <= 60) return 60 * 1000;
  // Round up to next 30s
  return Math.ceil(seconds / 30) * 30 * 1000;
};

const PageTimeBarChart: React.FC<PageTimeBarChartProps> = ({
  data,
  className,
  height = 240,
  "aria-label": ariaLabel = "Time spent per page",
}) => {
  const dataMax = data.reduce(
    (max, item) => Math.max(max, item.totalTimeMs || 0),
    0,
  );

  const domainMax = getNiceUpperBound(dataMax);

  const LABEL_HEIGHT = 24;
  // Reserve space at top for label so it doesn't get cut off
  const TOP_PADDING = 24;
  const PLOT_HEIGHT = Math.max(height - LABEL_HEIGHT - TOP_PADDING, 50);

  return (
    <div className={cn("w-full", className)}>
      <div
        className="relative flex w-full flex-col justify-end border-b border-border/60 bg-[linear-gradient(to_bottom,var(--dk-surface-raised),transparent)]"
        style={{ height }}
        role="img"
        aria-label={ariaLabel}
      >
        {/* Background Grid Lines */}
        <div className="pointer-events-none absolute inset-x-0 top-[24px] bottom-[24px] flex flex-col justify-between">
          {/* Top line (100%) */}
          <div className="w-full border-t border-dashed border-border/30" />
          {/* Middle line (50%) */}
          <div className="w-full border-t border-dashed border-border/30" />
          {/* Bottom line (0%) - handled by container border-b but we can add one just above if needed,
              but usually plot area is cleaner without bottom dashed line if border-b exists.
              Actually, flex-col justify-between with 3 items gives: Top, Middle, Bottom.
          */}
          <div className="w-full border-t border-dashed border-border/30 opacity-0" />
        </div>

        {/* Y-Axis Labels */}
        <div className="absolute top-0 right-0 z-20 rounded bg-background/80 px-1 text-[10px] font-medium text-muted-foreground backdrop-blur-sm">
          {formatDuration(domainMax)}
        </div>
        <div className="absolute top-1/2 right-0 z-20 -translate-y-1/2 rounded bg-background/80 px-1 text-[10px] font-medium text-muted-foreground backdrop-blur-sm">
          {formatDuration(domainMax / 2)}
        </div>
        <div className="absolute right-0 bottom-[26px] z-20 rounded bg-background/80 px-1 text-[10px] font-medium text-muted-foreground backdrop-blur-sm">
          0s
        </div>

        {/* Scrollable Bars Container */}
        <div className="no-scrollbar relative z-10 flex h-full w-full items-end gap-2 overflow-x-auto px-4 pt-[24px] pb-[24px]">
          {data.map((item) => {
            const ratio = Math.min(item.totalTimeMs / domainMax, 1);
            // Calculate explicit pixel height for the bar relative to plot area
            const barHeightPx =
              item.totalTimeMs > 0 ? Math.max(ratio * PLOT_HEIGHT, 4) : 0;

            return (
              <div
                key={`page-${item.pageNumber}`}
                className="group flex shrink-0 flex-col items-center justify-end gap-2"
                style={{ height: "100%" }}
              >
                {/* The bar itself */}
                <div
                  className="relative flex flex-col justify-end"
                  style={{ height: PLOT_HEIGHT }}
                >
                  <div
                    className="relative w-8 cursor-help rounded-t-sm bg-primary/75 transition-[height,background-color] hover:bg-primary motion-reduce:transition-none sm:w-10"
                    style={{ height: barHeightPx }}
                    title={`Page ${item.pageNumber}: ${formatDuration(item.totalTimeMs)}`}
                  >
                    {/* Hover Label */}
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 rounded border border-border bg-popover px-2 py-1 text-[10px] whitespace-nowrap text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                      {formatDuration(item.totalTimeMs)}
                    </span>
                  </div>
                </div>

                {/* X-Axis Label */}
                <div className="absolute bottom-0 flex h-6 items-center justify-center text-[10px] font-medium text-muted-foreground">
                  {item.pageNumber}
                </div>
              </div>
            );
          })}
          <div className="w-2 shrink-0" />
        </div>
      </div>
    </div>
  );
};

export default PageTimeBarChart;
