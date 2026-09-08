import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A single-border "Nocturne" surface container.
 *
 * Renders exactly one `dk-nocturne-surface` region (background, border,
 * shadow all sourced from that token) — use this in place of a shadcn
 * `Card` wherever a call site also applies `dk-nocturne-surface`, so the
 * region draws one visible frame instead of stacking the Card's own
 * border/shadow on top of the token's.
 *
 * `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` remain
 * safe to nest inside — they contribute no border/shadow of their own.
 */
export const SurfaceCard: React.FC<React.ComponentProps<"div">> = ({
  className,
  ...props
}) => {
  return (
    <div
      data-slot="surface-card"
      className={cn(
        "dk-nocturne-surface flex flex-col rounded-lg text-card-foreground",
        className,
      )}
      {...props}
    />
  );
};
