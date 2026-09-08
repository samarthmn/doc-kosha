import * as React from "react";
import { cn } from "@/lib/utils";

export const Card: React.FC<React.ComponentProps<"div">> = ({
  className,
  ...props
}) => {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col rounded-lg border bg-card text-card-foreground [box-shadow:var(--dk-shadow-card)]",
        className,
      )}
      {...props}
    />
  );
};

export const CardHeader: React.FC<React.ComponentProps<"div">> = ({
  className,
  ...props
}) => {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-4 pt-4 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-4",
        className,
      )}
      {...props}
    />
  );
};

export const CardTitle: React.FC<React.ComponentProps<"div">> = ({
  className,
  ...props
}) => {
  return (
    <h4
      data-slot="card-title"
      className={cn("leading-none", className)}
      {...props}
    />
  );
};

export const CardDescription: React.FC<React.ComponentProps<"div">> = ({
  className,
  ...props
}) => {
  return (
    <p
      data-slot="card-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
};

export const CardContent: React.FC<React.ComponentProps<"div">> = ({
  className,
  ...props
}) => {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4 pt-4 [&:last-child]:pb-4", className)}
      {...props}
    />
  );
};
