"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import type { PublicViewerTrackingHandlers } from "@/hooks/usePublicViewerTracking";

interface UnsupportedProps {
  src: string;
  message: string;
  className?: string;
  allowDownload?: boolean;
  tracking?: PublicViewerTrackingHandlers;
}

const UnsupportedWithDownload: React.FC<UnsupportedProps> = ({
  src,
  message,
  className,
  allowDownload = true,
  tracking,
}) => {
  return (
    <div
      className={cn(
        "dk-nocturne-surface mx-auto flex max-w-xl flex-col items-center justify-center rounded-lg p-6 text-center",
        className,
      )}
    >
      <p className="mb-4 max-w-md text-sm leading-relaxed text-muted-foreground">
        {message}
      </p>
      {allowDownload ? (
        <a
          href={src}
          download
          onClick={() => {
            if (tracking?.trackDownload) {
              void tracking.trackDownload();
            }
          }}
          className={buttonVariants({ variant: "outline" })}
        >
          Download file
        </a>
      ) : null}
    </div>
  );
};

export default UnsupportedWithDownload;
