import * as React from "react";
import { cn } from "@/lib/utils";

interface SeparatorProps extends React.ComponentProps<"div"> {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}

export const Separator: React.FC<SeparatorProps> = ({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}) => {
  return (
    <div
      role={decorative ? "none" : "separator"}
      aria-orientation={orientation}
      className={cn(
        orientation === "horizontal"
          ? "h-px w-full bg-[image:var(--dk-rule-fade)]"
          : "h-full w-px bg-[image:var(--dk-rule-fade-vertical)]",
        className,
      )}
      {...props}
    />
  );
};
