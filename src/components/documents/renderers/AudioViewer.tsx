"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import type { PublicViewerTrackingHandlers } from "@/hooks/usePublicViewerTracking";
import UnsupportedWithDownload from "@/components/documents/renderers/UnsupportedWithDownload";
import { MusicNote } from "@phosphor-icons/react";

interface AudioViewerProps {
  src: string;
  ext: string;
  fileName?: string;
  className?: string;
  tracking?: PublicViewerTrackingHandlers;
}
const AudioViewer: React.FC<AudioViewerProps> = ({
  src,
  ext,
  fileName,
  className,
  tracking,
}) => {
  const [duration, setDuration] = useState<number | undefined>();
  const sentBuckets = useRef<Set<number>>(new Set());
  const bucketStartTs = useRef<number>(Date.now());
  const activeBucketRef = useRef<number>(0);
  const normalizedExt = ext.toLowerCase();
  const [canInlinePlay, setCanInlinePlay] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") {
      setCanInlinePlay(false);
      return;
    }
    const a = document.createElement("audio");
    const mime =
      normalizedExt === "mp3"
        ? "audio/mpeg"
        : normalizedExt === "wav"
          ? "audio/wav"
          : normalizedExt === "ogg"
            ? "audio/ogg"
            : normalizedExt === "aac"
              ? "audio/aac"
              : "";
    setCanInlinePlay(mime ? a.canPlayType(mime) !== "" : false);
  }, [normalizedExt]);

  const displayName = fileName || "Audio";
  const canPlay = useMemo(() => canInlinePlay, [canInlinePlay]);

  const flushBucket = useCallback(
    (bucket: number) => {
      if (!tracking?.trackMediaBucket) return;
      if (bucket < 0) return;
      if (sentBuckets.current.has(bucket)) return;
      const elapsed = Math.min(5000, Date.now() - bucketStartTs.current);
      if (elapsed <= 0) return;
      sentBuckets.current.add(bucket);
      bucketStartTs.current = Date.now();
      const promise = tracking.trackMediaBucket(bucket, elapsed);
      if (promise) {
        void promise.catch((error) => {
          console.error("[Analytics] Failed to record media bucket", error);
        });
      }
    },
    [tracking],
  );

  useEffect(() => {
    return () => {
      flushBucket(activeBucketRef.current);
    };
  }, [flushBucket]);
  const fmt = (s?: number) =>
    typeof s === "number" && isFinite(s)
      ? `${Math.floor(s / 60)}:${`${Math.floor(s % 60)}`.padStart(2, "0")}`
      : "—";

  /**
   * Section time tracking for audio playback analytics
   *
   * Uses same bucketing strategy as video (5-second intervals) to track listening patterns.
   * See VideoViewer for detailed explanation of the bucketing algorithm.
   */
  const currentBucket = (t: number) => Math.floor(t / 5) * 5;

  if (!canPlay) {
    return (
      <UnsupportedWithDownload
        src={src}
        message={`This browser cannot play .${ext} audio. Download to listen.`}
        className={className}
        tracking={tracking}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-full items-center justify-center bg-muted/25 p-3 md:p-5",
        className,
      )}
    >
      <div className="dk-nocturne-surface relative w-full max-w-2xl overflow-hidden rounded-lg">
        <div
          className="absolute inset-x-0 top-0 h-px bg-primary/60"
          aria-hidden="true"
        />
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded border border-primary/25 bg-primary/8 text-primary">
              <MusicNote className="h-4 w-4" aria-hidden />
            </div>
            <span className="truncate text-sm font-medium" title={displayName}>
              {displayName}
            </span>
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            {fmt(duration)}
          </div>
        </div>
        <div className="bg-card/40 p-4">
          <audio
            src={src}
            controls
            preload="metadata"
            className="mx-auto block w-full max-w-xl"
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration);
              sentBuckets.current.clear();
              bucketStartTs.current = Date.now();
              activeBucketRef.current = 0;
            }}
            onTimeUpdate={(e) => {
              if (!tracking?.trackMediaBucket) return;
              const a = e.currentTarget;
              const b = currentBucket(a.currentTime);
              activeBucketRef.current = b;
              if (b >= 5 && !sentBuckets.current.has(b - 5)) {
                flushBucket(b - 5);
              }
            }}
            onPause={(e) => {
              if (!tracking?.trackMediaBucket) return;
              const a = e.currentTarget;
              const b = currentBucket(a.currentTime);
              flushBucket(b);
            }}
            onSeeking={(e) => {
              if (!tracking?.trackMediaBucket) return;
              const a = e.currentTarget;
              const b = currentBucket(a.currentTime);
              flushBucket(b);
            }}
            onEnded={(e) => {
              if (!tracking?.trackMediaBucket) return;
              const a = e.currentTarget;
              const b = currentBucket(a.currentTime);
              flushBucket(b);
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default AudioViewer;
