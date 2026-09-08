import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ActiveContent } from "@/lib/analytics/dashboard";
import { ChartBar } from "@phosphor-icons/react/ssr";

interface MostActiveContentProps {
  data: ActiveContent[];
}

export const MostActiveContent: React.FC<MostActiveContentProps> = ({
  data,
}) => {
  return (
    <Card className="h-full border-border/70 bg-card/55">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="text-[0.95rem] font-medium">
          Most Active Content
        </CardTitle>
        <CardDescription className="text-xs">
          Top performing documents and data rooms by views
        </CardDescription>
      </CardHeader>
      <CardContent
        className={
          data.length === 0
            ? "flex h-[200px] flex-col items-center justify-center"
            : undefined
        }
      >
        {data.length === 0 ? (
          <EmptyState
            variant="bare"
            compact
            icon={
              <ChartBar className="h-6 w-6 text-muted-foreground" aria-hidden />
            }
            title="No activity yet"
            description="Share your documents to start tracking performance."
          />
        ) : (
          <div className="divide-y divide-border/50">
            {data.map((item) => (
              <div
                key={`${item.resourceType}-${item.resourceId}`}
                className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="space-y-1">
                  <p className="max-w-[200px] truncate text-sm font-medium">
                    {item.title || "Untitled"}
                  </p>
                  {item.dataRoomName ? (
                    <p className="text-xs text-muted-foreground">
                      In {item.dataRoomName}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
                  {item.totalViews} views
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
