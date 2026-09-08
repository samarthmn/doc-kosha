import * as React from "react";
import { cn } from "@/lib/utils";

export const Label: React.FC<React.ComponentProps<"label">> = ({
  className,
  ...props
}) => {
  return (
    <label
      className={cn(
        "text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
};
