import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { GlobeHemisphereWest } from "@phosphor-icons/react/ssr";
import { CountryStat } from "@/lib/analytics/dashboard";

interface ViewsByCountryProps {
  data: CountryStat[];
}

export const ViewsByCountry: React.FC<ViewsByCountryProps> = ({ data }) => {
  const maxViews = Math.max(...data.map((d) => d.totalViews), 1);
  const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

  return (
    <Card className="col-span-1 h-full border-border/70 bg-card/55">
      <CardHeader className="border-b border-border/50 pb-3">
        <CardTitle className="text-[0.95rem] font-medium">
          Views by Country
        </CardTitle>
        <CardDescription className="text-xs">
          Top locations for document views
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
              <GlobeHemisphereWest
                className="h-6 w-6 text-muted-foreground"
                aria-hidden
              />
            }
            title="No location data"
            description="Country data will appear as people view your documents."
          />
        ) : (
          <div className="space-y-3.5">
            {data.map((item) => {
              const countryName =
                regionNames.of(item.countryCode) || item.countryCode;
              const percentage = (item.totalViews / maxViews) * 100;

              return (
                <div key={item.countryCode} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate pr-2 font-medium">
                      {countryName}
                    </span>
                    <span className="text-muted-foreground">
                      {item.totalViews}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500 ease-in-out motion-reduce:transition-none"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
