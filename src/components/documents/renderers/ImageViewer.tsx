"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { PublicViewerTrackingHandlers } from "@/hooks/usePublicViewerTracking";
import { usePageActivity } from "@/hooks/usePageActivity";
import { useOptionalSidebarLayoutTransitionCoordinator } from "@/components/layouts/SidebarLayoutTransitionContext";
import { createSidebarAwareResizeCommitter } from "@/components/layouts/sidebarLayoutTransition";

interface ImageViewerProps {
  src: string;
  scale: number;
  className?: string;
  tracking?: PublicViewerTrackingHandlers;
}

const ImageViewer: React.FC<ImageViewerProps> = ({
  src,
  scale,
  className,
  tracking,
}) => {
  const sidebarLayoutTransition =
    useOptionalSidebarLayoutTransitionCoordinator();
  /**
   * Image viewer with engagement tracking for zoom interactions
   *
   * Tracks three types of zoom engagement:
   * 1. Mouse wheel zoom (desktop) - velocity based on wheel delta
   * 2. Pinch-to-zoom (mobile) - velocity based on finger distance change rate
   * 3. Double-click/tap zoom - minimal velocity marker (value: 1)
   *
   * Engagement events include current zoom level (as depth %) and velocity
   * to understand user interaction intensity.
   */
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const totalDwellRef = useRef(0);
  const activeSegmentStartRef = useRef<number | null>(null);
  const isPageActive = usePageActivity();

  const commitActiveSegment = useCallback(() => {
    if (activeSegmentStartRef.current === null) return;
    totalDwellRef.current += Date.now() - activeSegmentStartRef.current;
    activeSegmentStartRef.current = null;
  }, []);

  const onLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const i = e.currentTarget;
    setNatural({ w: i.naturalWidth, h: i.naturalHeight });
    setStatus("loaded");
  }, []);

  useEffect(() => {
    setStatus("loading");
  }, [src]);

  useEffect(() => {
    const commitSize = (): void => {
      const el = containerRef.current;
      if (!el) return;
      const width = el.clientWidth;
      const height = el.clientHeight;
      setContainerSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };
    const resizeCommitter = createSidebarAwareResizeCommitter({
      coordinator: sidebarLayoutTransition,
      onCommit: commitSize,
    });
    resizeCommitter.requestCommit();
    const ro = new ResizeObserver(() => resizeCommitter.requestCommit());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      resizeCommitter.dispose();
    };
  }, [sidebarLayoutTransition]);

  useEffect(() => {
    if (!tracking?.trackImageDwell) return;
    if (isPageActive) {
      if (activeSegmentStartRef.current === null) {
        activeSegmentStartRef.current = Date.now();
      }
    } else {
      commitActiveSegment();
    }
    return () => {
      commitActiveSegment();
    };
  }, [commitActiveSegment, isPageActive, tracking]);

  useEffect(() => {
    if (!tracking?.trackImageDwell) return;
    return () => {
      commitActiveSegment();
      const dwell = totalDwellRef.current;
      totalDwellRef.current = 0;
      if (dwell > 300) {
        void tracking.trackImageDwell(dwell);
      }
    };
  }, [commitActiveSegment, tracking]);

  // Compute base fit width at 100% (contain within viewport). Zoom applied via CSS transform to keep perfect centering.
  const { baseWidth, zoomFactor } = useMemo(() => {
    const s = Math.max(0.25, Math.min(scale, 3));
    if (natural && containerSize.width > 0 && containerSize.height > 0) {
      const fit = Math.min(
        containerSize.width / Math.max(1, natural.w),
        containerSize.height / Math.max(1, natural.h),
      );
      const width = Math.round(natural.w * fit);
      return { baseWidth: width, zoomFactor: s };
    }
    const fallbackBase = containerSize.width > 0 ? containerSize.width : 1200;
    return { baseWidth: fallbackBase, zoomFactor: s };
  }, [containerSize.height, containerSize.width, scale, natural]);

  if (status === "error") {
    return (
      <div className={cn("h-full w-full", className)}>
        <div className="flex h-full items-center justify-center bg-muted/25 p-3 md:p-5">
          <div
            role="alert"
            className="dk-nocturne-surface w-full max-w-xl rounded-lg p-6 text-center text-sm text-muted-foreground"
          >
            This image could not be loaded. Refresh the page or contact the
            sender.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("h-full w-full", className)}>
      <div className="flex h-full items-center justify-center bg-muted/25 p-3 md:p-5">
        <div
          ref={containerRef}
          className="inline-block w-full max-w-full overflow-hidden rounded-lg border border-border/70 bg-card p-2 [box-shadow:var(--dk-shadow-card)] md:p-3"
        >
          {status === "loading" ? (
            <Skeleton
              aria-label="Loading image"
              className="h-[60vh] w-full rounded-md"
            />
          ) : null}
          <img
            ref={imgRef}
            src={src}
            alt="Document image"
            onLoad={onLoad}
            onError={() => setStatus("error")}
            style={{
              width: `${baseWidth}px`,
              transform: `scale(${zoomFactor})`,
              transformOrigin: "center center",
            }}
            className={cn(
              "block h-auto max-w-full will-change-transform select-none",
              status === "loading" && "hidden",
            )}
          />
        </div>
      </div>
    </div>
  );
};

export default ImageViewer;
