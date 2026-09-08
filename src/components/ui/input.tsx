import * as React from "react";
import { cn } from "@/lib/utils";

export const Input: React.FC<React.ComponentProps<"input">> = ({
  className,
  type,
  ...props
}) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded border border-input bg-card px-3 py-1 text-sm caret-primary outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring focus-visible:outline-solid disabled:opacity-[var(--dk-disabled-opacity)] aria-invalid:border-destructive aria-invalid:ring-destructive/30 aria-invalid:focus-visible:outline-destructive",
        className,
      )}
      data-slot="input"
      {...props}
    />
  );
};
