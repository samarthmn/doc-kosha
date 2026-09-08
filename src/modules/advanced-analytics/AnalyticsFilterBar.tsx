"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/datetimeLocal";
import type {
  AnalyticsFilterBarProps,
  AnalyticsTimeRangeOption,
} from "./types";

const TIME_RANGE_LABELS: Record<AnalyticsTimeRangeOption, string> = {
  all: "All time",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  custom: "Custom range",
};

/**
 * Shared analytics filter bar used in both document-level and data-room-level
 * analytics pages. Ensures consistent labeling, a11y, and layout.
 */
const AnalyticsFilterBar: React.FC<AnalyticsFilterBarProps> = ({
  links,
  selectedLinkId,
  onLinkChange,
  isLoadingLinks,
  timeRange,
  onTimeRangeChange,
  customFrom,
  customTo,
  onCustomRangeChange,
  className,
}) => {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = new Date();
  const minAllowed = new Date(now.getTime() - 365 * dayMs);

  const clampDate = (value: Date): Date => {
    const ts = value.getTime();
    if (Number.isNaN(ts)) return value;
    const clampedTs = Math.min(
      now.getTime(),
      Math.max(minAllowed.getTime(), ts),
    );
    return new Date(clampedTs);
  };

  const clampedCustomFrom = customFrom ? clampDate(customFrom) : null;
  const clampedCustomTo = customTo ? clampDate(customTo) : null;

  const fromMin = toDatetimeLocalValue(minAllowed);
  const toMax = toDatetimeLocalValue(now);
  const fromMax = toDatetimeLocalValue(clampedCustomTo ?? now);
  const toMin = toDatetimeLocalValue(clampedCustomFrom ?? minAllowed);

  return (
    <div
      className={cn("dk-nocturne-surface rounded-lg bg-card/45 p-4", className)}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Link context */}
        <div className="space-y-1.5">
          <Label htmlFor="af-link-select" className="dk-nocturne-kicker">
            Link context
          </Label>
          <Select
            value={selectedLinkId}
            onValueChange={onLinkChange}
            disabled={isLoadingLinks}
          >
            <SelectTrigger id="af-link-select" className="w-full bg-card">
              <SelectValue placeholder="All links" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All links</SelectItem>
              {links.map((link) => (
                <SelectItem key={link.id} value={link.id}>
                  {link.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Time period */}
        <div className="space-y-1.5">
          <Label htmlFor="af-time-range" className="dk-nocturne-kicker">
            Time period
          </Label>
          <Select
            value={timeRange}
            onValueChange={(val) =>
              onTimeRangeChange(val as AnalyticsTimeRangeOption)
            }
          >
            <SelectTrigger id="af-time-range" className="w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(
                Object.keys(TIME_RANGE_LABELS) as AnalyticsTimeRangeOption[]
              ).map((key) => (
                <SelectItem key={key} value={key}>
                  {TIME_RANGE_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Custom range fields */}
        {timeRange === "custom" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="af-range-from" className="dk-nocturne-kicker">
                From
              </Label>
              <Input
                id="af-range-from"
                type="datetime-local"
                className="w-full cursor-pointer bg-card"
                value={toDatetimeLocalValue(customFrom)}
                min={fromMin}
                max={fromMax}
                onChange={(e) =>
                  onCustomRangeChange(
                    "from",
                    (() => {
                      const parsed = fromDatetimeLocalValue(e.target.value);
                      if (!parsed) return null;
                      return clampDate(parsed);
                    })(),
                  )
                }
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker();
                  } catch {
                    /* browser may not support showPicker */
                  }
                }}
                step={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="af-range-to" className="dk-nocturne-kicker">
                To
              </Label>
              <Input
                id="af-range-to"
                type="datetime-local"
                className="w-full cursor-pointer bg-card"
                value={toDatetimeLocalValue(customTo)}
                min={toMin}
                max={toMax}
                onChange={(e) =>
                  onCustomRangeChange(
                    "to",
                    (() => {
                      const parsed = fromDatetimeLocalValue(e.target.value);
                      if (!parsed) return null;
                      return clampDate(parsed);
                    })(),
                  )
                }
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker();
                  } catch {
                    /* browser may not support showPicker */
                  }
                }}
                step={60}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AnalyticsFilterBar;
