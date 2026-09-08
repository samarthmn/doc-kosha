import React from "react";
import { cn } from "@/lib/utils";

interface MarketingContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "default" | "sm" | "lg" | "xl";
}

const MarketingContainer: React.FC<MarketingContainerProps> = ({
  className,
  size = "default",
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        "mx-auto w-full px-5 sm:px-8",
        size === "default" && "max-w-[1200px]",
        size === "sm" && "max-w-[800px]",
        size === "lg" && "max-w-[1200px]",
        size === "xl" && "max-w-[1360px]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export default MarketingContainer;
