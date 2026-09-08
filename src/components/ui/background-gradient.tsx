"use client";

import { cn } from "@/lib/utils";
import React from "react";

export const BackgroundGradient = ({ className }: { className?: string }) => {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
        className,
      )}
      aria-hidden="true"
    >
      <div className="absolute inset-x-[8%] top-0 h-px bg-[image:var(--dk-rule-fade)]" />
      <div className="absolute inset-x-0 top-0 h-[26rem] bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--primary)_9%,transparent),transparent_70%)]" />
    </div>
  );
};
