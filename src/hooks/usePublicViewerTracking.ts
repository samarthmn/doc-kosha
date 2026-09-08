"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  TrackerEvent,
  TrackerResourceType,
  type TrackerContext,
} from "@/lib/analytics/publicTracker";
import { analyticsDebugLog } from "@/lib/analytics/debug";
import { usePublicSubmissions } from "@/hooks/usePublicSubmissions";
import type { PublicEventResponse } from "@/hooks/usePublicSubmissions";
import {
  PublicSubmissionKind,
  type PublicEventSubmission,
} from "@/lib/analytics/publicSubmissions";
import { buildPublicViewTrackingIdentity } from "@/lib/analytics/publicViewerIdentity";

export interface TrackDocPageViewOptions {
  preferBeacon?: boolean;
}

export interface PublicViewerTrackingHandlers {
  trackView: () => Promise<PublicEventResponse | undefined> | undefined;
  trackDownload: () => Promise<PublicEventResponse | undefined> | undefined;
  trackDocPageView: (
    pageNumber: number,
    dwellMs: number,
    options?: TrackDocPageViewOptions,
  ) => Promise<PublicEventResponse | undefined> | undefined;
  trackImageDwell: (
    dwellMs: number,
    options?: TrackDocPageViewOptions,
  ) => Promise<PublicEventResponse | undefined> | undefined;
  trackMediaBucket: (
    offsetSeconds: number,
    durationMs: number,
  ) => Promise<PublicEventResponse | undefined> | undefined;
}

export const usePublicViewerTracking = (
  context: TrackerContext | null,
): PublicViewerTrackingHandlers => {
  const { insertEvent } = usePublicSubmissions();
  const viewTrackedRef = useRef(false);
  const viewTrackingInFlightRef = useRef(false);
  const viewTrackingGenerationRef = useRef(0);
  const accessRetryTimeoutRef = useRef<number | null>(null);
  const trackingIdentity = buildPublicViewTrackingIdentity(context);

  useEffect(() => {
    return () => {
      if (accessRetryTimeoutRef.current) {
        window.clearTimeout(accessRetryTimeoutRef.current);
        accessRetryTimeoutRef.current = null;
      }
    };
  }, []);

  const resolveViewDedupKey = useCallback((): string | null => {
    if (!trackingIdentity) return null;
    return `dk-public-view:${trackingIdentity}`;
  }, [trackingIdentity]);

  const hasRecentlyTrackedView = useCallback((): boolean => {
    if (typeof window === "undefined") return false;
    const key = resolveViewDedupKey();
    if (!key) return false;

    const WINDOW_MS = 2500;
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return false;
    const ts = Number(stored);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < WINDOW_MS;
  }, [resolveViewDedupKey]);

  const markTrackedView = useCallback(() => {
    if (typeof window === "undefined") return;
    const key = resolveViewDedupKey();
    if (!key) return;
    window.sessionStorage.setItem(key, String(Date.now()));
  }, [resolveViewDedupKey]);

  const send = useCallback(
    (
      event: TrackerEvent,
      extra?: Partial<Parameters<typeof insertEvent>[0]>,
    ): Promise<PublicEventResponse | undefined> | undefined => {
      if (!context?.linkId || !context.resourceId) {
        analyticsDebugLog("skip event: missing context", {
          event,
          context,
        });
        return undefined;
      }
      const payload = {
        linkId: context.linkId,
        resourceId: context.resourceId,
        resourceType: context.resourceType ?? TrackerResourceType.Document,
        documentId: context.documentId ?? null,
        event,
        sessionId: context.sessionId ?? null,
        workspaceId: context.workspaceId ?? undefined,
        ...extra,
      };
      analyticsDebugLog("sending public analytics event", {
        event,
        payload,
      });
      return insertEvent(payload)
        .then((result) => {
          analyticsDebugLog("public analytics event result", {
            event,
            payload,
            result,
          });
          return result;
        })
        .catch((error) => {
          analyticsDebugLog("public analytics event error", {
            event,
            payload,
            error,
          });
          throw error;
        });
    },
    [context, insertEvent],
  );

  const trackView = useCallback(() => {
    const generationAtCall = viewTrackingGenerationRef.current;
    if (viewTrackedRef.current) return undefined;
    if (viewTrackingInFlightRef.current) return undefined;
    if (!context?.linkId) return undefined;
    if (hasRecentlyTrackedView()) {
      if (viewTrackingGenerationRef.current === generationAtCall) {
        viewTrackedRef.current = true;
      }
      return undefined;
    }
    if (viewTrackingGenerationRef.current === generationAtCall) {
      viewTrackingInFlightRef.current = true;
    }
    const promise = send(TrackerEvent.View);
    if (!promise) {
      if (viewTrackingGenerationRef.current === generationAtCall) {
        viewTrackingInFlightRef.current = false;
      }
      return undefined;
    }
    const trackedPromise = promise
      .then((result) => {
        if (result?.success) {
          analyticsDebugLog("view event success", {
            linkId: context.linkId,
            resourceId: context.resourceId,
            isUniqueView: result.isUniqueView,
            isRevisit: result.isRevisit,
          });
          if (viewTrackingGenerationRef.current === generationAtCall) {
            viewTrackedRef.current = true;
          }
          markTrackedView();
          return result;
        }
        if (result?.skippedReason === "access_confirmation_required") {
          analyticsDebugLog("view event skipped: access confirmation required");
          if (
            typeof window !== "undefined" &&
            accessRetryTimeoutRef.current === null
          ) {
            accessRetryTimeoutRef.current = window.setTimeout(() => {
              accessRetryTimeoutRef.current = null;
              void trackViewRef.current();
            }, 1500);
          }
        } else if (result?.skippedReason) {
          analyticsDebugLog("view event skipped", {
            reason: result.skippedReason,
          });
        }
        return result;
      })
      .catch((error) => {
        analyticsDebugLog("view event failed", { error });
        throw error;
      })
      .finally(() => {
        if (viewTrackingGenerationRef.current === generationAtCall) {
          viewTrackingInFlightRef.current = false;
        }
      });
    return trackedPromise;
  }, [
    context?.linkId,
    context?.resourceId,
    hasRecentlyTrackedView,
    markTrackedView,
    send,
  ]);

  const trackViewRef = useRef(trackView);
  // Update ref whenever trackView changes, but don't let this effect itself trigger tracking
  useEffect(() => {
    trackViewRef.current = trackView;
  }, [trackView]);

  // A view belongs to the complete public identity, not only a document id.
  // Data-room navigation can reuse a document id across links or sessions.
  useEffect(() => {
    viewTrackingGenerationRef.current += 1;
    viewTrackedRef.current = false;
    viewTrackingInFlightRef.current = false;
    if (accessRetryTimeoutRef.current !== null) {
      window.clearTimeout(accessRetryTimeoutRef.current);
      accessRetryTimeoutRef.current = null;
    }
  }, [trackingIdentity]);

  useEffect(() => {
    return () => {
      if (accessRetryTimeoutRef.current) {
        window.clearTimeout(accessRetryTimeoutRef.current);
        accessRetryTimeoutRef.current = null;
      }
    };
  }, [context?.linkId, send]);

  const sendBeaconEvent = useCallback(
    (payload: PublicEventSubmission): boolean => {
      if (
        typeof navigator === "undefined" ||
        typeof navigator.sendBeacon !== "function"
      ) {
        return false;
      }
      try {
        const body = new Blob([JSON.stringify(payload)], {
          type: "application/json",
        });
        const ok = navigator.sendBeacon("/api/public/events", body);
        if (ok) {
          analyticsDebugLog("public analytics beacon event sent", {
            event: payload.event,
            pageNumber: payload.pageNumber,
            durationMs: payload.durationMs,
          });
        }
        return ok;
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.debug("[public-viewer-tracking] beacon failed", error);
        }
        return false;
      }
    },
    [],
  );

  const sendKeepaliveEvent = useCallback(
    (payload: PublicEventSubmission): boolean => {
      try {
        void fetch("/api/public/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
          keepalive: true,
        });
        analyticsDebugLog("public analytics keepalive event sent", {
          event: payload.event,
          pageNumber: payload.pageNumber,
          durationMs: payload.durationMs,
        });
        return true;
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.debug("[public-viewer-tracking] keepalive failed", error);
        }
        return false;
      }
    },
    [],
  );

  const trackDownload = useCallback(() => {
    if (!context?.linkId) return undefined;
    return send(TrackerEvent.Download);
  }, [context?.linkId, send]);

  const trackDocPageView = useCallback(
    (
      pageNumber: number,
      dwellMs: number,
      options?: TrackDocPageViewOptions,
    ) => {
      if (!context?.linkId || !context?.resourceId) return undefined;
      const safeDuration = Number.isFinite(dwellMs) ? Math.max(dwellMs, 0) : 0;
      if (options?.preferBeacon) {
        const payload: PublicEventSubmission = {
          kind: PublicSubmissionKind.Event,
          linkId: context.linkId,
          resourceId: context.resourceId,
          resourceType: context.resourceType ?? TrackerResourceType.Document,
          workspaceId: context.workspaceId ?? undefined,
          documentId: context.documentId ?? null,
          event: TrackerEvent.PageView,
          sessionId: context.sessionId ?? null,
          pageNumber,
          sectionOffset: null,
          durationMs: safeDuration,
        };
        if (sendBeaconEvent(payload)) {
          return undefined;
        }
        if (sendKeepaliveEvent(payload)) {
          return undefined;
        }
      }
      return send(TrackerEvent.PageView, {
        pageNumber,
        durationMs: safeDuration,
      });
    },
    [
      context?.documentId,
      context?.linkId,
      context?.resourceId,
      context?.resourceType,
      context?.sessionId,
      context?.workspaceId,
      send,
      sendBeaconEvent,
      sendKeepaliveEvent,
    ],
  );

  const trackImageDwell = useCallback(
    (dwellMs: number, options?: TrackDocPageViewOptions) =>
      trackDocPageView(1, dwellMs, options),
    [trackDocPageView],
  );

  const trackMediaBucket = useCallback(
    (offsetSeconds: number, durationMs: number) => {
      if (!context?.linkId) return undefined;
      const safeDuration = Number.isFinite(durationMs)
        ? Math.max(durationMs, 0)
        : 0;
      return send(TrackerEvent.SectionTime, {
        sectionOffset: Math.max(0, Math.floor(offsetSeconds)),
        durationMs: safeDuration,
      });
    },
    [context?.linkId, send],
  );

  return useMemo(
    () => ({
      trackView,
      trackDownload,
      trackDocPageView,
      trackImageDwell,
      trackMediaBucket,
    }),
    [
      trackView,
      trackDownload,
      trackDocPageView,
      trackImageDwell,
      trackMediaBucket,
    ],
  );
};
