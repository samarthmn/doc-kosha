import React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type GlassCardProps = React.ComponentProps<typeof Card>;

const GlassCard: React.FC<GlassCardProps> = ({ className, ...props }) => {
  return (
    <Card
      className={cn(
        "dk-glass-card group relative overflow-hidden rounded-lg",
        "transition-[border-color,background-color,box-shadow] duration-200",
        "hover:border-primary/35 hover:bg-card",
        className,
      )}
      {...props}
    />
  );
};

export default GlassCard;
