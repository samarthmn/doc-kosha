import React from "react";
import { cn } from "@/lib/utils";

interface MarketingCardGridProps extends React.HTMLAttributes<HTMLDivElement> {
  cols?: 2 | 3 | 4;
}

const MarketingCardGrid: React.FC<MarketingCardGridProps> = ({
  className,
  cols = 3,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        "grid gap-4 sm:gap-5 lg:gap-6",
        cols === 2 && "md:grid-cols-2",
        cols === 3 && "md:grid-cols-2 lg:grid-cols-3",
        cols === 4 && "md:grid-cols-2 lg:grid-cols-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export default MarketingCardGrid;
