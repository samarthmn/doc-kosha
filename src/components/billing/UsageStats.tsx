import React from "react";
import { Progress } from "@/components/ui/progress";
import { formatStorage } from "@/modules/billing/entitlements";
import { PlanId } from "@/modules/billing/types";
import { PLAN_CATALOG } from "@/modules/billing/plans";
import { HardDrive } from "@phosphor-icons/react";

interface UsageStatsProps {
  currentPlanId: PlanId;
  usage: {
    storageUsedBytes: number;
    bandwidthUsedBytes?: number; // Kept for API compatibility but not displayed
  };
  className?: string;
}

export const UsageStats: React.FC<UsageStatsProps> = ({
  currentPlanId,
  usage,
  className,
}) => {
  const planLimits = PLAN_CATALOG[currentPlanId].limits;

  // Storage
  const maxStorage = planLimits.maxStorageBytes;
  const storageUsed = usage.storageUsedBytes;
  const storagePercent = maxStorage
    ? Math.min((storageUsed / maxStorage) * 100, 100)
    : 0;

  return (
    <div className={className}>
      {/* Storage Usage */}
      <div className="space-y-3 rounded border border-border/70 bg-background/25 p-4">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded border border-border/60 bg-muted/30">
              <HardDrive
                size={15}
                className="text-muted-foreground"
                aria-hidden="true"
              />
            </span>
            <span className="font-medium">Storage</span>
          </div>
          <span className="text-muted-foreground">
            {formatStorage(storageUsed)} /{" "}
            {maxStorage === null ? "Unlimited" : formatStorage(maxStorage)}
          </span>
        </div>
        {maxStorage !== null && (
          <Progress value={storagePercent} className="h-1.5" />
        )}
      </div>
    </div>
  );
};
