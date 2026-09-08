"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import videojs from "video.js";
import { cn } from "@/lib/utils";
import type { PublicViewerTrackingHandlers } from "@/hooks/usePublicViewerTracking";
import UnsupportedWithDownload from "@/components/documents/renderers/UnsupportedWithDownload";
import { CircleNotch, FilmStrip } from "@phosphor-icons/react";
import "video.js/dist/video-js.css";
import "@/styles/videojs.css";

interface VideoViewerProps {
  src: string;
  ext: string;
  fileName?: string;
  className?: string;
  tracking?: PublicViewerTrackingHandlers;
  allowDownload?: boolean;
}
const INLINE_PLAYABLE_VIDEO_EXTS = new Set(["mp4", "webm"]);

type VideoPlayerInstance = ReturnType<typeof videojs>;
type VideoPlayerOptions = Parameters<typeof videojs>[1];

const VideoViewer: React.FC<VideoViewerProps> = ({
  src,
  ext,
  fileName,
  className,
  tracking,
  allowDownload = true,
}) => {
  const [meta, setMeta] = useState<{
    duration?: number;
    w?: number;
    h?: number;
  }>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const sentBuckets = useRef<Set<number>>(new Set());
  const bucketStartTs = useRef<number>(Date.now());
  const activeBucketRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<VideoPlayerInstance | null>(null);
  const normalizedExt = ext.toLowerCase();
  const [canInlinePlay, setCanInlinePlay] = useState(false);
  const inlineSupportedFormat = INLINE_PLAYABLE_VIDEO_EXTS.has(normalizedExt);

  useEffect(() => {
    if (!inlineSupportedFormat) {
      setCanInlinePlay(false);
      return;
    }
    if (typeof document === "undefined") {
      setCanInlinePlay(false);
      return;
    }
    const video = document.createElement("video");
    const mime =
      normalizedExt === "mp4"
        ? "video/mp4"
        : normalizedExt === "webm"
          ? "video/webm"
          : "";
    setCanInlinePlay(mime ? video.canPlayType(mime) !== "" : false);
  }, [inlineSupportedFormat, normalizedExt]);

  const displayName = fileName || "Video";
  const canPlay = useMemo(
    () => inlineSupportedFormat && canInlinePlay,
    [canInlinePlay, inlineSupportedFormat],
  );

  const fmt = (s?: number) =>
    typeof s === "number" && isFinite(s)
      ? `${Math.floor(s / 60)}:${`${Math.floor(s % 60)}`.padStart(2, "0")}`
      : "—";

  /**
   * Section time tracking for video playback analytics
   *
   * Strategy: Track video engagement in 5-second buckets to capture viewing patterns
   * without overwhelming the analytics system with events.
   *
   * - currentBucket: Maps playback time to 5s boundaries (0, 5, 10, 15...)
   * - sentBuckets: Prevents duplicate events for the same bucket (handles seek/replay)
   * - bucketStartTs: Tracks when current bucket viewing started for duration calculation
   *
   * Events fire when:
   * 1. Crossing into a new 5s boundary (onTimeUpdate)
   * 2. User pauses (capture partial bucket if >0ms elapsed)
   * 3. User seeks to different position (capture current partial bucket first)
   */
  const currentBucket = (t: number) => Math.floor(t / 5) * 5;

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

  useEffect(() => {
    if (!canPlay || !videoRef.current) {
      return undefined;
    }

    setErr(null);
    setLoading(true);

    const options: VideoPlayerOptions = {
      controls: true,
      autoplay: false,
      preload: "metadata",
      // Fill the (aspect-ratio-bounded) container instead of `fluid`, which
      // sizes the player by width and makes a portrait video taller than the
      // viewport — the container then clips its top/bottom. With `fill` + an
      // aspect-correct box + object-fit:contain, any orientation fits fully.
      fill: true,
      responsive: true,
      inactivityTimeout: 2000,
      controlBar: {
        volumePanel: { inline: false },
      },
      sources: [
        {
          src,
          type: normalizedExt === "webm" ? "video/webm" : "video/mp4",
        },
      ],
    };

    if (playerRef.current) {
      playerRef.current.dispose();
    }

    const player = videojs(videoRef.current, options);
    player.addClass("dk-video-player");
    playerRef.current = player;

    sentBuckets.current.clear();
    bucketStartTs.current = Date.now();
    activeBucketRef.current = 0;

    const handleLoadedMetadata = () => {
      const duration = player.duration();
      const w = player.videoWidth();
      const h = player.videoHeight();
      setMeta({
        duration: Number.isFinite(duration) ? duration : undefined,
        w: Number.isFinite(w) ? w : undefined,
        h: Number.isFinite(h) ? h : undefined,
      });
      setLoading(false);
      setErr(null);
    };

    const handleError = () => {
      const mediaError = player.error();
      setErr(mediaError?.message || "Unable to play video");
      setLoading(false);
    };

    player.on("loadedmetadata", handleLoadedMetadata);
    player.on("error", handleError);

    return () => {
      player.off("loadedmetadata", handleLoadedMetadata);
      player.off("error", handleError);
      flushBucket(activeBucketRef.current);
      player.dispose();
      playerRef.current = null;
    };
  }, [canPlay, flushBucket, normalizedExt, src]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !tracking?.trackMediaBucket) {
      return undefined;
    }

    const handleTimeUpdate = () => {
      const currentTime = player.currentTime() || 0;
      const bucket = currentBucket(currentTime);
      activeBucketRef.current = bucket;
      if (bucket >= 5 && !sentBuckets.current.has(bucket - 5)) {
        flushBucket(bucket - 5);
      }
    };

    const handlePause = () => {
      const currentTime = player.currentTime() || 0;
      flushBucket(currentBucket(currentTime));
    };

    const handleSeeking = () => {
      const currentTime = player.currentTime() || 0;
      flushBucket(currentBucket(currentTime));
    };

    const handleEnded = () => {
      const currentTime = player.currentTime() || 0;
      flushBucket(currentBucket(currentTime));
    };

    player.on("timeupdate", handleTimeUpdate);
    player.on("pause", handlePause);
    player.on("seeking", handleSeeking);
    player.on("ended", handleEnded);

    return () => {
      player.off("timeupdate", handleTimeUpdate);
      player.off("pause", handlePause);
      player.off("seeking", handleSeeking);
      player.off("ended", handleEnded);
    };
  }, [flushBucket, tracking]);

  if (!canPlay) {
    return (
      <UnsupportedWithDownload
        src={src}
        message={
          allowDownload
            ? `Inline playback for .${ext} is unavailable. Download to view.`
            : `Inline playback for .${ext} is not supported in this browser.`
        }
        className={className}
        tracking={tracking}
        allowDownload={allowDownload}
      />
    );
  }

  // The container is inline-playable but the browser could not DECODE this
  // particular file (e.g. an HEVC/H.265 recording from an iPhone, or another
  // codec the viewer's browser lacks). Rather than leave a broken player with
  // a cryptic error, offer the same download-to-view fallback.
  if (err) {
    return (
      <UnsupportedWithDownload
        src={src}
        message={
          allowDownload
            ? "This video can't be played in your browser (unsupported codec). Download it to view."
            : "This video can't be played in your browser (unsupported codec)."
        }
        className={className}
        tracking={tracking}
        allowDownload={allowDownload}
      />
    );
  }

  return (
    <div className={cn("h-full w-full", className)}>
      <div className="flex h-full items-center justify-center bg-muted/25 p-3 md:p-5">
        <div className="dk-nocturne-surface relative w-full max-w-5xl overflow-hidden rounded-lg">
          <div
            className="absolute inset-x-0 top-0 z-10 h-px bg-primary/60"
            aria-hidden="true"
          />
          <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded border border-primary/25 bg-primary/8 text-primary">
                <FilmStrip className="h-4 w-4" aria-hidden />
              </div>
              <span
                className="truncate text-sm font-medium"
                title={displayName}
              >
                {displayName}
              </span>
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              {meta.w && meta.h ? `${meta.w}×${meta.h}` : ""}
              {meta.duration ? ` • ${fmt(meta.duration)}` : ""}
            </div>
          </div>
          <div className="flex justify-center bg-black">
            {/* Box matches the video's real aspect ratio (from metadata),
                capped by max-height so a tall portrait clip fits the viewport
                instead of overflowing. `fill` + object-fit:contain letterbox
                any orientation with no cropping. */}
            <div
              className="w-full"
              style={{
                aspectRatio:
                  meta.w && meta.h ? `${meta.w} / ${meta.h}` : "16 / 9",
                maxHeight: "78vh",
              }}
            >
              <div data-vjs-player className="h-full w-full">
                <video
                  ref={videoRef}
                  className="video-js vjs-big-play-centered dk-video-player h-full w-full"
                  playsInline
                />
              </div>
            </div>
          </div>
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <CircleNotch aria-hidden className="h-3.5 w-3.5 animate-spin" />{" "}
              Loading video…
            </div>
          )}
          {err && (
            <div className="px-3 py-2 text-xs text-destructive">{err}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoViewer;
