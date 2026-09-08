"use client";

import * as React from "react";
import { motion } from "motion/react";
import { progressTween } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.ComponentProps<"div"> {
  value?: number;
}

export const Progress: React.FC<ProgressProps> = ({
  className,
  value = 0,
  ...props
}) => {
  const clamped = Math.min(Math.max(value, 0), 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
      {...props}
    >
      {/* Progress arrives in coarse jumps (one per upload chunk), so the fill is
          tweened to make them read as continuous travel. Linear on purpose: an
          eased fill would appear to accelerate and stall within every
          increment, implying a transfer rate the upload is not actually doing.
          This is the one sanctioned `width` animation. */}
      <motion.div
        className="h-full bg-primary"
        initial={false}
        animate={{ width: `${clamped}%` }}
        transition={progressTween}
      />
    </div>
  );
};
