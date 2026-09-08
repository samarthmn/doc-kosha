"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CircleNotch } from "@phosphor-icons/react";
import {
  CONVERTED_STORAGE_BUCKET_NAME,
  DATA_ROOM_CONVERTED_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  STORAGE_BUCKET_NAME,
} from "@/lib/constants";
import {
  describeFileType,
  isCompletedConversionEligibleExtension,
  isPdfExtension,
} from "@/lib/fileTypes";
import { useDocumentAccess } from "@/hooks/useDocumentAccess";
import type {
  PublicViewerTrackingHandlers,
  TrackDocPageViewOptions,
} from "@/hooks/usePublicViewerTracking";
import { usePageActivity } from "@/hooks/usePageActivity";
import DocumentRenderer from "@/components/documents/DocumentRenderer";
import UnsupportedWithDownload from "@/components/documents/renderers/UnsupportedWithDownload";
import { RenderControllerProvider } from "@/components/documents/RenderControllerContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { cn } from "@/lib/utils";
import type { Theme } from "@/types/theme";
import type { WatermarkOverlayModel } from "@/lib/watermark";
import { analyticsDebugLog } from "@/lib/analytics/debug";
import { trackProductEvent } from "@/lib/analytics/productEvents";
import PdfViewerWithControls from "@/components/documents/pdf/PdfViewerWithControls";
import { PdfViewerErrorState } from "@/components/documents/pdf/PdfViewerErrorState";
import {
  MozillaPdfViewer,
  type PdfViewerOverlay,
} from "@/components/documents/pdf/engine/MozillaPdfViewer";
import { WatermarkPageOverlay } from "@/components/documents/watermarkOverlay";
import {
  PdfLoadErrorView,
  type PdfLoadFailure,
} from "@/components/documents/pdf/PdfLoadErrorView";
import type { DocumentRow } from "@/components/documents/types";
import {
  parsePublicFileFailureResponse,
  resolveConvertedAssetFailureRecovery,
  resolveViewerAssetVariant,
  type PublicFileFailure,
} from "@/components/documents/viewerAsset";

type ConvertedAssetLoadFallbackProps = {
  error: PdfLoadFailure;
  fileUrl: string;
  onFallback: (failure: PublicFileFailure) => void;
  onRetry: () => void;
};

const ConvertedAssetLoadFallback: React.FC<ConvertedAssetLoadFallbackProps> = ({
  error,
  fileUrl,
  onFallback,
  onRetry,
}) => {
  useEffect(() => {
    let active = true;
    const inspectFailure = async (): Promise<void> => {
      let failure: PublicFileFailure = {
        status: error.status,
        retryable: false,
      };
      const terminalClientError =
        typeof error.status === "number" &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 409;
      if (error.status === 409) {
        failure = {
          status: 409,
          code: "DOCUMENT_PROCESSING",
          retryable: false,
          retryAfterMs: 3_000,
        };
      } else if (
        fileUrl.startsWith("/api/public/links/file") &&
        !terminalClientError
      ) {
        try {
          const response = await fetch(fileUrl, {
            method: "HEAD",
            cache: "no-store",
            credentials: "include",
          });
          failure = parsePublicFileFailureResponse(response);
        } catch {
          // A diagnostic failure is terminal by default. Manual retry remains
          // available without risking another automatic request loop.
        }
      }
      if (active) onFallback(failure);
    };

    void inspectFailure();
    return () => {
      active = false;
    };
  }, [error.status, fileUrl, onFallback]);

  return <PdfLoadErrorView error={error} fileUrl={fileUrl} onRetry={onRetry} />;
};

type DocumentViewerProps = {
  doc: DocumentRow | null;
  accessMode?: "authenticated" | "public";
  onRetry?: () => Promise<void>;
  onRefreshStatus?: () => Promise<void>;
  onPageCountResolved?: (pageCount: number) => void;
  onConvertedAssetUnavailable?: () => void;
  processingTimedOut?: boolean;
  className?: string;
  allowDownload?: boolean;
  pdfUi?: "full" | "none";
  /** Set false to suppress the document_viewed product event (e.g. version previews). */
  trackViewEvent?: boolean;
  onDownload?: () => void;
  onPrint?: () => void;
  pdfOverlays?: readonly PdfViewerOverlay[];
  publicAccess?: {
    linkId: string;
    documentId: string;
    dataRoomId?: string | null;
  } | null;
  watermarkOverlay?: WatermarkOverlayModel | null;
  publicTracking?: PublicViewerTrackingHandlers;
  /**
   * True when the link requires server-side watermarking. The file route
   * fails closed on non-PDF originals for such links, so the viewer must
   * never fall back to the original variant after a converted-asset failure.
   */
  watermarkRequired?: boolean;
};

const Viewer: React.FC<DocumentViewerProps> = ({
  doc,
  accessMode = "authenticated",
  onRetry,
  onRefreshStatus,
  onPageCountResolved,
  onConvertedAssetUnavailable,
  processingTimedOut,
  className,
  allowDownload = true,
  pdfUi = "full",
  trackViewEvent = true,
  onDownload,
  onPrint,
  pdfOverlays = [],
  publicAccess,
  watermarkOverlay,
  publicTracking,
  watermarkRequired = false,
}) => {
  const [signedAsset, setSignedAsset] = useState<{
    key: string;
    url: string;
  } | null>(null);
  const [failedConvertedAssetKey, setFailedConvertedAssetKey] = useState<
    string | null
  >(null);
  const repairRequestedAssetKeyRef = useRef<string | null>(null);
  const publicAutomaticAttemptsRef = useRef<{
    assetKey: string | null;
    count: number;
  }>({ assetKey: null, count: 0 });
  const publicRetryTimeoutRef = useRef<number | null>(null);
  const [publicAssetAttempt, setPublicAssetAttempt] = useState(0);
  // Every repair publishes a NEW claim-scoped converted path, so an asset-key
  // guard alone re-arms after each attempt; cap automatic repairs at one per
  // document per mount or a deterministically unloadable PDF reconverts in a
  // loop for as long as the tab stays open. Manual retry stays available.
  const autoRepairDocIdRef = useRef<string | null>(null);
  const theme = useGlobalStore((s) => s.theme);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");
  const [reduceMotion, setReduceMotion] = useState(false);

  const {
    allowed,
    loading: accessLoading,
    reason,
  } = useDocumentAccess({
    doc,
    accessMode,
  });

  const ext = (doc?.file_type || "").toLowerCase();
  const {
    label: resourceLabel,
    nounLower: resourceNounLower,
    actionVerb: resourceActionVerb,
  } = describeFileType(doc?.file_type);
  const convertible = isCompletedConversionEligibleExtension(ext);
  const convertedAssetKey =
    doc?.id && doc.converted_storage_path
      ? `${doc.id}:${doc.converted_storage_path}:${doc.conversion_status ?? ""}`
      : null;
  const convertedAssetFailed = Boolean(
    convertedAssetKey && failedConvertedAssetKey === convertedAssetKey,
  );
  // PDF originals can still be served safely because the public file route
  // applies the required watermark to them. Convertible non-PDF originals
  // have no secure watermark representation and must never be exposed.
  const originalFallbackAllowed = !(
    accessMode === "public" &&
    watermarkRequired &&
    convertible &&
    !isPdfExtension(ext)
  );
  const assetVariant = resolveViewerAssetVariant({
    fileType: ext,
    convertedStoragePath: doc?.converted_storage_path,
    conversionStatus: doc?.conversion_status,
    convertedAssetFailed,
    // During migration-first rollout, an older resolve RPC can omit the new
    // status field. Public file routes still re-check readiness server-side.
    allowLegacyMissingStatus: accessMode === "public",
    originalFallbackAllowed,
  });
  const useConverted = assetVariant === "converted";
  const securePreviewUnavailable = assetVariant === "unavailable";
  const isPdfDocument = isPdfExtension(ext) || useConverted;
  const isDataRoomDoc = Boolean(doc?.data_room_id);
  const baseBucket = isDataRoomDoc
    ? DATA_ROOM_STORAGE_BUCKET_NAME
    : STORAGE_BUCKET_NAME;
  const convertedBucket = isDataRoomDoc
    ? DATA_ROOM_CONVERTED_BUCKET_NAME
    : CONVERTED_STORAGE_BUCKET_NAME;
  const bucket = useConverted ? convertedBucket : baseBucket;
  const path: string | undefined = useConverted
    ? (doc?.converted_storage_path ?? undefined)
    : (doc?.storage_path ?? undefined);
  const requestedAssetKey = [
    accessMode,
    bucket,
    path ?? "",
    doc?.workspace_id ?? "",
    publicAccess?.linkId ?? "",
    publicAccess?.documentId ?? "",
    publicAccess?.dataRoomId ?? "",
    accessMode === "public" ? publicAssetAttempt : 0,
  ].join(":");
  const publicAssetIdentityKey = [
    publicAccess?.linkId ?? "",
    publicAccess?.documentId ?? "",
    publicAccess?.dataRoomId ?? "",
    useConverted ? "converted" : "original",
    path ?? "",
  ].join(":");
  const signedUrl =
    signedAsset?.key === requestedAssetKey ? signedAsset.url : "";
  const [unstyledPdfState, setUnstyledPdfState] = useState<{
    fileUrl: string;
    state: "loading" | "ready" | "error";
  }>({
    fileUrl: signedUrl,
    state: "loading",
  });
  const currentUnstyledPdfState =
    unstyledPdfState.fileUrl === signedUrl ? unstyledPdfState.state : "loading";
  const handleUnstyledPdfError = useCallback(() => {
    setUnstyledPdfState({ fileUrl: signedUrl, state: "error" });
  }, [signedUrl]);

  const viewerOverlays = useMemo<readonly PdfViewerOverlay[]>(() => {
    const overlays: PdfViewerOverlay[] = [];
    if (watermarkOverlay) {
      overlays.push({
        id: "dk-watermark",
        // Paint below pdf.js's text layer, matching the retired viewer's
        // renderPageLayer placement.
        layer: "under-text",
        renderPageOverlay: ({ width, height, scale }) => (
          <WatermarkPageOverlay
            model={watermarkOverlay}
            width={width}
            height={height}
            scale={scale}
          />
        ),
      });
    }
    overlays.push(...pdfOverlays);
    return overlays;
  }, [pdfOverlays, watermarkOverlay]);

  useEffect(() => {
    if (doc?.conversion_status === "completed") return;
    setFailedConvertedAssetKey(null);
    repairRequestedAssetKeyRef.current = null;
  }, [doc?.conversion_status, doc?.storage_path]);

  useEffect(() => {
    autoRepairDocIdRef.current = null;
    publicAutomaticAttemptsRef.current = { assetKey: null, count: 0 };
    setPublicAssetAttempt(0);
  }, [doc?.id]);

  useEffect(() => {
    return () => {
      if (publicRetryTimeoutRef.current !== null) {
        window.clearTimeout(publicRetryTimeoutRef.current);
      }
    };
  }, []);

  const handleAssetFailure = useCallback(
    (failure: PublicFileFailure) => {
      const failureAssetKey =
        convertedAssetKey ??
        (accessMode === "public" ? publicAssetIdentityKey : null);
      if (!failureAssetKey) return;

      if (publicAutomaticAttemptsRef.current.assetKey !== failureAssetKey) {
        publicAutomaticAttemptsRef.current = {
          assetKey: failureAssetKey,
          count: 0,
        };
      }

      const recovery = resolveConvertedAssetFailureRecovery({
        accessMode,
        hasRetryHandler: Boolean(onRetry),
        hasRefreshHandler: Boolean(onRefreshStatus),
        failure,
        automaticAttempts: publicAutomaticAttemptsRef.current.count,
      });

      if (recovery === "refresh") {
        publicAutomaticAttemptsRef.current.count += 1;
        const delayMs = failure.retryAfterMs ?? 1_000;
        if (publicRetryTimeoutRef.current !== null) {
          window.clearTimeout(publicRetryTimeoutRef.current);
        }
        publicRetryTimeoutRef.current = window.setTimeout(() => {
          publicRetryTimeoutRef.current = null;
          const retryAsset = async (): Promise<void> => {
            // Processing can publish a different converted path, so refresh its
            // status. Engine retries target the same file directly and never
            // trigger another resolve merely because it failed to load.
            if (
              failure.status === 409 &&
              failure.code === "DOCUMENT_PROCESSING" &&
              onRefreshStatus
            ) {
              await onRefreshStatus();
            }
            setPublicAssetAttempt((attempt) => attempt + 1);
          };
          void retryAsset().catch((refreshError: unknown) => {
            console.error("[Viewer] public asset retry failed", refreshError);
          });
        }, delayMs);
        return;
      }

      if (convertedAssetKey) {
        setFailedConvertedAssetKey(convertedAssetKey);
        onConvertedAssetUnavailable?.();
      }

      if (
        repairRequestedAssetKeyRef.current === convertedAssetKey ||
        autoRepairDocIdRef.current === doc?.id ||
        recovery !== "repair"
      ) {
        return;
      }

      repairRequestedAssetKeyRef.current = convertedAssetKey;
      autoRepairDocIdRef.current = doc?.id ?? null;
      void onRetry?.().catch((error: unknown) => {
        console.error("[Viewer] converted asset repair request failed", error);
      });
    },
    [
      accessMode,
      convertedAssetKey,
      doc?.id,
      onConvertedAssetUnavailable,
      onRefreshStatus,
      onRetry,
      publicAssetIdentityKey,
    ],
  );

  const handleManualPublicRetry = useCallback(() => {
    if (publicRetryTimeoutRef.current !== null) {
      window.clearTimeout(publicRetryTimeoutRef.current);
      publicRetryTimeoutRef.current = null;
    }
    publicAutomaticAttemptsRef.current = {
      assetKey: convertedAssetKey ?? publicAssetIdentityKey,
      count: 0,
    };
    setFailedConvertedAssetKey(null);
    setPublicAssetAttempt((attempt) => attempt + 1);
  }, [convertedAssetKey, publicAssetIdentityKey]);

  const handleManualAssetRetry = useCallback(() => {
    if (accessMode === "authenticated" && onRetry) {
      void onRetry().catch((error: unknown) => {
        console.error("[Viewer] converted asset repair request failed", error);
      });
      return;
    }
    handleManualPublicRetry();
  }, [accessMode, handleManualPublicRetry, onRetry]);

  const renderPdfLoadError = useCallback(
    (error: PdfLoadFailure) => {
      if (
        useConverted ||
        (accessMode === "public" &&
          signedUrl.startsWith("/api/public/links/file"))
      ) {
        return (
          <ConvertedAssetLoadFallback
            error={error}
            fileUrl={signedUrl}
            onFallback={handleAssetFailure}
            onRetry={handleManualAssetRetry}
          />
        );
      }
      return <PdfLoadErrorView error={error} fileUrl={signedUrl} />;
    },
    [
      accessMode,
      handleAssetFailure,
      handleManualAssetRetry,
      signedUrl,
      useConverted,
    ],
  );

  const isPageActive = usePageActivity();

  const publicTrackingRef = useRef<PublicViewerTrackingHandlers | undefined>(
    publicTracking,
  );
  useEffect(() => {
    publicTrackingRef.current = publicTracking;
  }, [publicTracking]);

  // Fetch a signed URL for the appropriate bucket/path
  useEffect(() => {
    let active = true;
    const publishSignedUrl = (url: string) => {
      if (!active) return;
      setSignedAsset({ key: requestedAssetKey, url });
    };
    const run = async () => {
      if (!doc) {
        publishSignedUrl("");
        return;
      }
      // No servable variant — don't request the original the server refuses.
      if (securePreviewUnavailable) {
        publishSignedUrl("");
        return;
      }
      if (!path) {
        publishSignedUrl("");
        return;
      }
      try {
        if (accessMode === "public") {
          if (!publicAccess) {
            publishSignedUrl("");
            return;
          }
          // Use same-origin proxy endpoint to avoid CORS issues with storage host
          const queryParams = new URLSearchParams({
            linkId: publicAccess.linkId,
            documentId: publicAccess.documentId,
            variant: useConverted ? "converted" : "original",
          });
          if (publicAccess.dataRoomId) {
            queryParams.set("dataRoomId", publicAccess.dataRoomId);
          }
          if (publicAssetAttempt > 0) {
            queryParams.set("attempt", String(publicAssetAttempt));
          }
          const query = queryParams.toString();
          const fileUrl = `/api/public/links/file?${query}`;
          publishSignedUrl(fileUrl);
          return;
        }
        // Authenticated mode: use the storage proxy endpoint
        const workspaceId = doc.workspace_id;
        if (!workspaceId) {
          console.error("[Viewer] Document has no workspace_id");
          publishSignedUrl("");
          return;
        }
        const queryParams = new URLSearchParams({
          bucket,
          path,
          workspaceId,
        });
        const fileUrl = `/api/storage/file?${queryParams.toString()}`;
        publishSignedUrl(fileUrl);
      } catch (err) {
        if (!active) return;
        console.error("[Viewer] Signed URL fetch failed", err);
        publishSignedUrl("");
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [
    accessMode,
    bucket,
    doc,
    path,
    publicAccess,
    publicAssetAttempt,
    requestedAssetKey,
    securePreviewUnavailable,
    useConverted,
  ]);

  // PDF dwell tracking with reliability improvements
  const pageRef = useRef<number>(1);
  const pageDwellStartRef = useRef<number | null>(null);

  const commitPageDwell = useCallback(
    (options?: TrackDocPageViewOptions) => {
      if (!isPdfDocument || !publicTrackingRef.current?.trackDocPageView) {
        return;
      }
      const startedAt = pageDwellStartRef.current;
      if (startedAt === null) return;
      const dwell = Date.now() - startedAt;
      if (dwell > 500 && pageRef.current > 0) {
        const promise = publicTrackingRef.current.trackDocPageView(
          pageRef.current,
          dwell,
          options,
        );
        if (promise) {
          promise.catch((error) => {
            analyticsDebugLog("page dwell event failed", error);
          });
        }
      }
      pageDwellStartRef.current = null;
    },
    [isPdfDocument],
  );

  const commitPageDwellRef = useRef(commitPageDwell);
  useEffect(() => {
    commitPageDwellRef.current = commitPageDwell;
  }, [commitPageDwell]);

  const startPageDwell = useCallback(
    (force = false) => {
      if (!isPdfDocument || !publicTrackingRef.current?.trackDocPageView) {
        pageDwellStartRef.current = null;
        return;
      }
      if (!isPageActive) {
        pageDwellStartRef.current = null;
        return;
      }
      if (force || pageDwellStartRef.current === null) {
        pageDwellStartRef.current = Date.now();
      }
    },
    [isPdfDocument, isPageActive],
  );

  const startPageDwellRef = useRef(startPageDwell);
  useEffect(() => {
    startPageDwellRef.current = startPageDwell;
  }, [startPageDwell]);

  const hasPageTracking = Boolean(publicTracking?.trackDocPageView);

  const lastTrackedViewDocIdRef = useRef<string>("");

  useEffect(() => {
    if (!trackViewEvent) return;
    if (accessMode !== "authenticated") return;
    if (accessLoading) return;
    if (!allowed) return;
    if (!doc?.id) return;
    if (lastTrackedViewDocIdRef.current === doc.id) return;
    lastTrackedViewDocIdRef.current = doc.id;

    trackProductEvent("document_viewed", {
      document_id: doc.id,
      workspace_id: doc.workspace_id ?? undefined,
      data_room_id: doc.data_room_id ?? undefined,
      file_type: ext || undefined,
      using_converted_asset: useConverted,
    });
  }, [
    accessMode,
    accessLoading,
    allowed,
    doc?.data_room_id,
    doc?.id,
    doc?.workspace_id,
    ext,
    trackViewEvent,
    useConverted,
  ]);

  const handleAuthenticatedDownload = useCallback(() => {
    if (!doc?.id) return;

    trackProductEvent("document_downloaded", {
      document_id: doc.id,
      workspace_id: doc.workspace_id ?? undefined,
      data_room_id: doc.data_room_id ?? undefined,
      file_type: ext || undefined,
      using_converted_asset: useConverted,
    });

    const anchor = document.createElement("a");
    anchor.href = `/api/documents/${doc.id}/download`;
    anchor.setAttribute("download", "");
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }, [doc?.data_room_id, doc?.id, doc?.workspace_id, ext, useConverted]);

  const handleAuthenticatedPrint = useCallback(() => {
    if (!signedUrl) return;
    // No "noopener" here: passing it makes window.open return null, which
    // would make printing impossible. The URL is same-origin (/api/storage/file).
    const printWindow = window.open(signedUrl, "_blank");
    if (!printWindow) return;
    const onLoad = () => {
      printWindow.focus();
      printWindow.print();
    };
    printWindow.addEventListener("load", onLoad, { once: true });
  }, [signedUrl]);

  const resolvedDownload =
    onDownload ??
    (accessMode === "authenticated" ? handleAuthenticatedDownload : undefined);
  const resolvedPrint =
    onPrint ??
    (accessMode === "authenticated" ? handleAuthenticatedPrint : undefined);

  useEffect(() => {
    if (!isPdfDocument) return;
    if (!hasPageTracking) return;
    pageRef.current = 1;
    pageDwellStartRef.current = null;
    startPageDwellRef.current(true);
    return () => {
      commitPageDwellRef.current();
    };
    // Reset dwell tracking only when the underlying document asset changes, not
    // when tracking handler identities change (which would incorrectly assign
    // later-page dwell time to page 1).
  }, [doc?.id, hasPageTracking, isPdfDocument, useConverted]);

  useEffect(() => {
    if (!isPdfDocument || !hasPageTracking) return;
    const handleUnload = () => {
      commitPageDwellRef.current({ preferBeacon: true });
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [hasPageTracking, isPdfDocument]);

  useEffect(() => {
    if (!isPdfDocument || !hasPageTracking) return;
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        commitPageDwellRef.current({ preferBeacon: true });
      }
    };
    const handlePageHide = () => {
      commitPageDwellRef.current({ preferBeacon: true });
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [hasPageTracking, isPdfDocument]);

  useEffect(() => {
    if (!isPdfDocument || !hasPageTracking) return;
    const interval = window.setInterval(() => {
      commitPageDwellRef.current();
      startPageDwellRef.current(true);
    }, 10000);
    return () => {
      window.clearInterval(interval);
    };
  }, [hasPageTracking, isPdfDocument]);

  useEffect(() => {
    if (!isPdfDocument || !hasPageTracking) return;
    if (isPageActive) {
      startPageDwellRef.current();
    } else {
      commitPageDwellRef.current();
    }
  }, [isPageActive, isPdfDocument, hasPageTracking]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = (event?: MediaQueryListEvent) => {
      const prefersDark = event ? event.matches : mql.matches;
      setSystemTheme(prefersDark ? "dark" : "light");
    };
    updateSystemTheme();
    mql.addEventListener("change", updateSystemTheme);
    return () => {
      mql.removeEventListener("change", updateSystemTheme);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateReducedMotion = () => setReduceMotion(mql.matches);
    updateReducedMotion();
    mql.addEventListener("change", updateReducedMotion);
    return () => {
      mql.removeEventListener("change", updateReducedMotion);
    };
  }, []);

  // Access control handling
  if (accessLoading) {
    return (
      <div
        className="flex flex-1 items-center justify-center rounded-lg border border-border/70 bg-card/35 px-6 py-10"
        role="status"
        aria-live="polite"
        aria-label={`Loading ${resourceNounLower}`}
      >
        <div className="w-full max-w-md">
          <Skeleton className="h-[60%] min-h-155 rounded-md" />
        </div>
        <span className="sr-only">Loading {resourceNounLower}...</span>
      </div>
    );
  }
  if (!allowed) {
    return (
      <div
        className={cn(
          "dk-nocturne-surface flex h-full min-h-60 items-center justify-center rounded-lg p-6 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        {reason ||
          `You don’t have access to ${resourceActionVerb} this ${resourceNounLower}.`}
      </div>
    );
  }

  // Watermark-required links have no servable original: fail visibly with
  // recovery actions instead of requesting bytes the server refuses.
  if (securePreviewUnavailable && doc?.conversion_status !== "in_progress") {
    return (
      <div
        className={cn(
          "flex h-full min-h-70 flex-col items-center justify-center gap-4 rounded-lg border border-border/70 bg-card/30 p-4",
          className,
        )}
      >
        <div className="dk-nocturne-surface w-full max-w-xl rounded-lg p-5 text-sm text-muted-foreground">
          <div
            className="flex flex-wrap items-center justify-center gap-2 text-center"
            role="status"
            aria-live="polite"
          >
            <span>Secure preview temporarily unavailable.</span>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {onRefreshStatus ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={handleManualPublicRetry}
                >
                  Refresh
                </Button>
              ) : null}
              {onRetry ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => void onRetry()}
                >
                  Try again
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Graceful handling for convertible docs without converted path
  if (convertible && !useConverted) {
    const status = doc?.conversion_status ?? null;

    if (status === "in_progress") {
      if (processingTimedOut) {
        return (
          <div
            className={cn(
              "flex h-full min-h-70 items-center justify-center rounded-lg border border-border/70 bg-card/30 p-4",
              className,
            )}
            role="status"
            aria-live="polite"
            aria-label={`Processing ${resourceNounLower}`}
          >
            <div className="dk-nocturne-surface w-full max-w-xl rounded-lg p-5 text-sm text-muted-foreground">
              <div className="space-y-3 text-center">
                <div className="font-medium text-foreground">
                  Processing is taking longer than expected.
                </div>
                <div className="text-xs text-muted-foreground">
                  Refresh to check the latest status.
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {onRefreshStatus ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void onRefreshStatus()}
                    >
                      Refresh
                    </Button>
                  ) : null}
                  {onRetry ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void onRetry()}
                    >
                      Restart processing
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div
          className="flex flex-1 items-center justify-center rounded-lg border border-border/70 bg-card/35 px-6 py-10"
          role="status"
          aria-live="polite"
          aria-label={`Processing ${resourceNounLower}`}
        >
          <div className="relative w-full max-w-md">
            <Skeleton className="h-[60%] min-h-155 rounded-md" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <CircleNotch
                className="h-8 w-8 text-muted-foreground motion-safe:animate-spin"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Processing {resourceNounLower}...
                </p>
                <p className="text-xs text-muted-foreground">
                  The preview will appear here automatically once it&apos;s
                  ready.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (status === "failed" || status === "pending") {
      const title =
        status === "failed"
          ? "Processing failed."
          : "This file is queued for processing.";
      const actionLabel =
        status === "failed" ? "Retry processing" : "Start processing";

      // Never dead-end: Office originals cannot render in-browser, so offer
      // the original file for download while conversion is pending/failed
      // (AGENTS.md §2 conversion fallback).
      return (
        <div
          className={cn(
            "flex h-full min-h-70 flex-col items-center justify-center gap-4 rounded-lg border border-border/70 bg-card/30 p-4",
            className,
          )}
        >
          <div className="dk-nocturne-surface w-full max-w-xl rounded-lg p-5 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center justify-center gap-2 text-center">
              <span>{title}</span>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {onRefreshStatus ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => void onRefreshStatus()}
                  >
                    Refresh
                  </Button>
                ) : null}
                {onRetry ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => void onRetry()}
                  >
                    {actionLabel}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          {signedUrl ? (
            <UnsupportedWithDownload
              src={signedUrl}
              message="Preview isn't available yet. Download the original file to view it."
              allowDownload={allowDownload}
              tracking={publicTracking}
            />
          ) : (
            <div className="w-full max-w-md">
              <Skeleton className="h-24 rounded-lg" />
            </div>
          )}
        </div>
      );
    }
    // Unknown state: show a neutral message and fall back to original
    // Note: Non-PDF originals will be handled by DocumentRenderer below
  }

  // Await signed URL before rendering any viewer
  if (!signedUrl) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-border/70 bg-card/35 px-6 py-10">
        <div className="w-full max-w-md">
          <Skeleton className="h-[60%] min-h-155 rounded-md" />
        </div>
      </div>
    );
  }

  // If it's a PDF (original or converted), render with the Mozilla PDF viewer.
  const resolvedTheme: Theme | "light" | "dark" =
    theme === "system" ? systemTheme : theme;
  const isDarkTheme = resolvedTheme === "dark" || resolvedTheme === "midnight";
  const pdfTheme: "light" | "dark" = isDarkTheme ? "dark" : "light";
  if (isPdfDocument) {
    const handlePageChange = (e: { currentPage: number }) => {
      commitPageDwell();
      const raw = e.currentPage;
      const parsed = typeof raw === "number" ? raw : Number(raw);
      const safeIndex = Number.isFinite(parsed) ? parsed : 0;
      pageRef.current = Math.max(1, Math.floor(safeIndex) + 1);
      startPageDwell(true);
    };

    const loader = () => (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-border/70 bg-card/35 px-6 py-10">
        <div className="w-full max-w-md">
          <Skeleton className="h-[60%] min-h-155 rounded-md" />
        </div>
      </div>
    );

    const viewerClassName = cn(
      "dk-document-viewer h-full min-h-0 w-full overflow-hidden rounded-lg border border-border/70 bg-card [box-shadow:var(--dk-shadow-card)]",
      className,
    );

    if (pdfUi === "none") {
      return (
        <div
          className={viewerClassName}
          data-dk-pdf-state={currentUnstyledPdfState}
          data-export-allowed={allowDownload ? "true" : "false"}
        >
          <MozillaPdfViewer
            file={signedUrl}
            initialZoom="fit-page"
            overlays={viewerOverlays}
            smoothScroll={!reduceMotion}
            onPageChange={handlePageChange}
            onDocumentLoad={(document) => {
              setUnstyledPdfState({ fileUrl: signedUrl, state: "ready" });
              onPageCountResolved?.(document.numPages);
            }}
            renderError={(error) => (
              <PdfViewerErrorState
                error={error}
                onError={handleUnstyledPdfError}
                renderError={renderPdfLoadError}
              />
            )}
            loading={loader()}
          />
        </div>
      );
    }

    return (
      <PdfViewerWithControls
        fileUrl={signedUrl}
        theme={pdfTheme}
        initialZoom="fit-page"
        smoothScroll={!reduceMotion}
        overlays={viewerOverlays}
        renderLoader={loader}
        allowDownload={allowDownload}
        onDownload={resolvedDownload}
        onPrint={resolvedPrint}
        onPageChange={handlePageChange}
        onPageCountResolved={onPageCountResolved}
        renderError={renderPdfLoadError}
        className={viewerClassName}
      />
    );
  }

  // Otherwise, use existing renderer for media types (image/video/audio) and unsupported fallback
  return (
    <RenderControllerProvider>
      <DocumentRenderer
        fileName={doc?.title || resourceLabel}
        fileType={ext || ""}
        src={signedUrl}
        className={cn(
          "dk-media-viewer h-full w-full overflow-hidden rounded-lg border border-border/70 bg-card [box-shadow:var(--dk-shadow-card)]",
          className,
        )}
        allowDownload={allowDownload}
        tracking={publicTracking}
      />
    </RenderControllerProvider>
  );
};

export default Viewer;
