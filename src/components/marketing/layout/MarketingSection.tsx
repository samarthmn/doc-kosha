import React from "react";
import { cn } from "@/lib/utils";

interface MarketingSectionProps extends React.HTMLAttributes<HTMLElement> {
  variant?: "default" | "muted" | "brand";
}

const MarketingSection: React.FC<MarketingSectionProps> = ({
  className,
  variant = "default",
  children,
  ...props
}) => {
  return (
    <section
      className={cn(
        "relative overflow-hidden py-20 sm:py-24 lg:py-28",
        variant === "muted" &&
          "border-y border-border/55 bg-muted/20 [background-image:linear-gradient(110deg,color-mix(in_srgb,var(--primary)_4%,transparent),transparent_42%)]",
        variant === "brand" && "border-y border-primary/15 bg-primary/[0.045]",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
};

export default MarketingSection;
