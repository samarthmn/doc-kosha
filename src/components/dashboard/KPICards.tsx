"use client";

import React from "react";
import { MetricCard } from "@/components/analytics/MetricCard";
import { DownloadSimple, Eye, UsersThree } from "@phosphor-icons/react";

interface KPICardsProps {
  totalViews: number;
  uniqueViewers: number;
  totalDownloads: number;
}

export const KPICards: React.FC<KPICardsProps> = ({
  totalViews,
  uniqueViewers,
  totalDownloads,
}) => {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <MetricCard
        label="Total Views"
        value={totalViews.toLocaleString()}
        icon={Eye}
        caption="Across all your documents"
      />
      <MetricCard
        label="Unique Viewers"
        value={uniqueViewers.toLocaleString()}
        icon={UsersThree}
        caption="Distinct people who viewed documents"
      />
      <MetricCard
        label="Total Downloads"
        value={totalDownloads.toLocaleString()}
        icon={DownloadSimple}
        caption="Document downloads across all links"
      />
    </div>
  );
};
