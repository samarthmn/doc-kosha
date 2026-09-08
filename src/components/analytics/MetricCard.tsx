"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: React.ComponentType<{ className?: string }>;
  caption?: string;
  className?: string;
}

/**
 * Reusable analytics metric card.
 *
 * Used across document analytics, data-room analytics, and data-room page
 * overview to ensure a consistent KPI presentation.
 */
const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  icon: Icon,
  caption,
  className,
}) => {
  return (
    <div
      className={cn(
        "dk-nocturne-surface relative flex flex-col justify-between overflow-hidden rounded-lg bg-card/55 p-4 transition-colors hover:border-primary/30",
        className,
      )}
    >
      <div
        className="absolute inset-y-0 left-0 w-0.5 bg-primary/60"
        aria-hidden="true"
      />
      <div className="flex items-center justify-between">
        <p className="dk-nocturne-kicker">{label}</p>
        {Icon ? (
          <Icon className="h-4 w-4 text-muted-foreground/40" aria-hidden />
        ) : null}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="text-2xl font-medium tracking-tight tabular-nums">
          {value}
        </p>
      </div>
      {caption ? (
        <p className="mt-2 text-xs text-muted-foreground">{caption}</p>
      ) : null}
    </div>
  );
};

export { MetricCard };
