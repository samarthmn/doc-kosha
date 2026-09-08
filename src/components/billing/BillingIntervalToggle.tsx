import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BillingInterval } from "@/modules/billing/types";

interface BillingIntervalToggleProps {
  interval: BillingInterval;
  onChange: (interval: BillingInterval) => void;
  className?: string;
  monthlyDiscountPercent?: number;
  annualDiscountPercent?: number;
}

export const BillingIntervalToggle: React.FC<BillingIntervalToggleProps> = ({
  interval,
  onChange,
  className,
  monthlyDiscountPercent,
  annualDiscountPercent,
}) => {
  const monthlyDiscountLabel =
    typeof monthlyDiscountPercent === "number" && monthlyDiscountPercent > 0
      ? `-${monthlyDiscountPercent}%`
      : null;
  const annualDiscountLabel =
    typeof annualDiscountPercent === "number" && annualDiscountPercent > 0
      ? `-${annualDiscountPercent}%`
      : null;

  return (
    <div
      className={cn(
        "inline-flex h-9 items-center gap-1 rounded border border-border/70 bg-muted/25 p-1",
        className,
      )}
    >
      <Button
        variant={interval === "month" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onChange("month")}
        className={cn(
          "h-7 rounded px-3 text-xs font-medium",
          interval === "month" &&
            "border-primary/30 bg-primary/[0.06] text-primary [box-shadow:none]",
        )}
      >
        Monthly
        {monthlyDiscountLabel && (
          <span className="ml-1 text-[10px] font-medium text-primary">
            {monthlyDiscountLabel}
          </span>
        )}
      </Button>
      <Button
        variant={interval === "year" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onChange("year")}
        className={cn(
          "h-7 rounded px-3 text-xs font-medium",
          interval === "year" &&
            "border-primary/30 bg-primary/[0.06] text-primary [box-shadow:none]",
        )}
      >
        Annual
        {annualDiscountLabel && (
          <span className="ml-1 text-[10px] font-medium text-primary">
            {annualDiscountLabel}
          </span>
        )}
      </Button>
    </div>
  );
};
