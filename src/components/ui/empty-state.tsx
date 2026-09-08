import React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  compact?: boolean;
  /**
   * "framed" (default) draws the dashed border + tinted background — use when
   * the empty state replaces a surface's chrome entirely (e.g. a whole empty
   * table/list slot). "bare" renders no border/background — use when the
   * empty state already lives inside another bordered surface, so we never
   * nest a dashed border inside another border.
   */
  variant?: "framed" | "bare";
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  actions,
  compact = false,
  variant = "framed",
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-5 text-center",
        variant === "framed" &&
          "rounded-lg border border-dashed border-border bg-card/55",
        compact ? "py-6" : "py-10",
        className,
      )}
      {...props}
    >
      {/* No per-element entrance here. An empty state appears as part of a
          page or panel that already plays one enter transition, so fading the
          icon and then the text on top of it would stack a second, staggered
          animation inside the first. */}
      {icon ? (
        <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-medium">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {actions ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
};
