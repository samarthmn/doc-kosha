import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea: React.FC<React.ComponentProps<"textarea">> = ({
  className,
  ...props
}) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded border border-input bg-card px-3 py-2 text-sm caret-primary outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring focus-visible:outline-solid disabled:opacity-[var(--dk-disabled-opacity)] aria-invalid:border-destructive aria-invalid:ring-destructive/30 aria-invalid:focus-visible:outline-destructive",
        className,
      )}
      data-slot="textarea"
      {...props}
    />
  );
};
