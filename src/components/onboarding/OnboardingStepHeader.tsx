import React from "react";
import { cn } from "@/lib/utils";

interface OnboardingStepHeaderProps {
  title: string;
  description?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}

export const OnboardingStepHeader: React.FC<OnboardingStepHeaderProps> = ({
  title,
  description,
  leading,
  trailing,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex flex-col items-stretch justify-between gap-5 sm:flex-row sm:items-start sm:gap-6",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3 text-left">
        {leading ? <div className="-ml-2 self-start">{leading}</div> : null}
        <div className="relative border-l border-primary/45 pl-4">
          <h1 className="text-[1.75rem] leading-tight font-medium tracking-[-0.025em] text-balance sm:text-[2rem]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-[46ch] text-[15px] leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>

      {trailing ? <div className="shrink-0 self-start">{trailing}</div> : null}
    </div>
  );
};
