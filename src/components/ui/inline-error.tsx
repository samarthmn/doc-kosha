"use client";

import React from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InlineErrorProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description: string;
  onRetry?: () => void;
}

/**
 * The canonical "this panel's data failed to load" block.
 *
 * Draws a solid destructive tint and no border: every call site sits inside an
 * already-bordered surface (a `SurfaceCard` / `Card` body), so a border here
 * would stack a second frame inside the first. The warning glyph carries the
 * severity — per Nocturne, shape rather than a second hue distinguishes state.
 */
export const InlineError: React.FC<InlineErrorProps> = ({
  title,
  description,
  onRetry,
  className,
  ...props
}) => {
  return (
    <div
      role="alert"
      className={cn("space-y-3 rounded bg-destructive/[0.06] p-4", className)}
      {...props}
    >
      <div className="flex items-start gap-2.5">
        <WarningCircle
          size={18}
          className="mt-0.5 shrink-0 text-destructive"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {onRetry ? (
        <Button type="button" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
};
