import React, { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Globe } from "@phosphor-icons/react/ssr";
import type { CountryBreakdownCardProps } from "./types";

const CountryBreakdownCard: React.FC<CountryBreakdownCardProps> = ({
  data,
  isLoading = false,
  title = "Views by country",
  description = "Where viewers are located.",
  emptyStateMessage = "Country data will appear after this link receives views.",
}) => {
  const maxViews = useMemo(() => {
    if (!data.length) return 1;
    return Math.max(...data.map((item) => item.totalViews), 1);
  }, [data]);

  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      return null;
    }
  }, []);

  return (
    <Card className="relative h-fit overflow-hidden border-border/70 bg-card/55">
      <div
        className="absolute inset-x-0 top-0 h-px bg-primary/45"
        aria-hidden="true"
      />
      <CardHeader>
        <CardTitle className="text-lg font-medium">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4" aria-busy="true">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={`country_skeleton_${idx}`} className="space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            variant="bare"
            title="No country data yet"
            description={emptyStateMessage}
            icon={
              <Globe aria-hidden className="h-6 w-6 text-muted-foreground" />
            }
            compact
            className="py-8"
          />
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              {data.map((item) => {
                const countryLabel =
                  (regionNames &&
                    item.countryCode &&
                    regionNames.of(item.countryCode)) ||
                  item.countryCode ||
                  "—";
                const percentage = Math.round(
                  (item.totalViews / maxViews) * 100,
                );
                return (
                  <div key={item.countryCode} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate pr-2 font-medium">
                        {countryLabel}
                      </span>
                      <span className="text-muted-foreground">
                        {item.totalViews}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary/80 transition-[width] motion-reduce:transition-none"
                        style={{ width: `${percentage}%` }}
                        aria-hidden
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CountryBreakdownCard;
