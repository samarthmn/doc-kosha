import React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-border/60 pb-4 md:flex-row md:items-end md:justify-between",
        className,
      )}
      {...props}
    >
      <div className="max-w-3xl space-y-1">
        <h1 className="text-2xl leading-tight font-medium tracking-tight md:text-[1.75rem]">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground md:text-base">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center md:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
};

export { PageHeader };
