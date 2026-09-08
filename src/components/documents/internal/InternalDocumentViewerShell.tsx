"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { layoutTween } from "@/lib/motion";
import { ArrowLeft, ChatCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/ui/page-container";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Viewer from "@/components/documents/Viewer";
import type { PdfViewerOverlay } from "@/components/documents/pdf/engine/MozillaPdfViewer";
import {
  areaToScreenArea,
  getAreaCssProperties,
} from "@/components/documents/pdf/geometry/pageAreas";
import type { TextLayerSelection } from "@/components/documents/pdf/selection/textLayerSelectionGeometry";
import { useTextLayerSelection } from "@/components/documents/pdf/selection/useTextLayerSelection";
import { isDocumentConversionProcessing } from "@/components/documents/viewerAsset";
import { isVideoExtension } from "@/lib/fileTypes";
import { useInternalDocumentViewer } from "@/components/documents/internal/InternalDocumentViewerContext";
import { cn } from "@/lib/utils";
import { showError } from "@/lib/toast";
import { prefetchLinksManagerBootstrap } from "@/modules/performance/prefetchBootstraps";
import {
  groupCommentSelectionByPage,
  pageAreasToStoredCommentAnchor,
  storedCommentAnchorToPageAreas,
} from "@/modules/comments/commentAnchorGeometry";
import {
  InternalCommentsOverlayProvider,
  type InternalCommentsHighlightThread,
  type InternalCommentsComposerSelection,
} from "@/modules/comments/components/InternalCommentsOverlayContext";

const toHighlightAreas = (thread: InternalCommentsHighlightThread) =>
  storedCommentAnchorToPageAreas({
    anchor: thread.anchor,
    pageNumber: thread.pageNumber,
  });

type ViewerTab = "document" | "share" | "analytics" | "comments" | "auditLog";

interface InternalDocumentViewerShellProps {
  basePath: string;
  backHref: string;
  title: string;
  dataRoomName?: string;
  canViewAuditLog?: boolean;
  hasComments?: boolean;
  children: React.ReactNode;
}

const InternalDocumentViewerShell: React.FC<
  InternalDocumentViewerShellProps
> = ({
  basePath,
  backHref,
  title,
  dataRoomName,
  canViewAuditLog,
  hasComments,
  children,
}) => {
  const {
    doc,
    processingTimedOut,
    refreshDoc,
    requestProcessing,
    resolvePageCount,
  } = useInternalDocumentViewer();
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  const pathname = usePathname();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [backHrefOverride, setBackHrefOverride] = useState<string | null>(null);
  const prefetchedPathsRef = useRef<Set<string>>(new Set());
  const isDataRoomViewer = Boolean(dataRoomName);
  // Share/analytics stay locked until the preview asset exists; a timed-out
  // conversion re-enables them so a stuck job never blocks those surfaces.
  const isProcessingDocument =
    isDocumentConversionProcessing({
      fileType: doc.file_type,
      conversionStatus: doc.conversion_status,
    }) && !processingTimedOut;

  // A definite canvas height is what lets the paged/PDF canvas scroll inside
  // itself. Video is the one renderer that sizes itself instead (its stage is
  // capped at 78vh and is vertically centred), so pinning it to a viewport
  // fraction clips a portrait clip with nothing to scroll to. Let that canvas
  // take its content height and scroll the page instead.
  const usesContentHeightCanvas = isVideoExtension(
    (doc.file_type ?? "").toLowerCase(),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => {
      mql.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (!backHref) {
      setBackHrefOverride(null);
      return;
    }
    try {
      const key = `dk-auth-documents-last-browse-href:${backHref}`;
      const stored = sessionStorage.getItem(key);
      if (!stored || typeof stored !== "string") {
        setBackHrefOverride(null);
        return;
      }
      if (!stored.startsWith(backHref)) {
        setBackHrefOverride(null);
        return;
      }
      setBackHrefOverride(stored);
    } catch {
      setBackHrefOverride(null);
    }
  }, [backHref]);

  const tabs = useMemo(
    () => ({
      document: basePath,
      share: `${basePath}/share`,
      analytics: `${basePath}/analytics`,
      comments: `${basePath}/comments`,
      auditLog: `${basePath}/audit-log`,
    }),
    [basePath],
  );

  const showAuditLogTab = Boolean(canViewAuditLog);

  const activeTab = useMemo<ViewerTab>(() => {
    if (pathname === tabs.share || pathname.startsWith(`${tabs.share}/`)) {
      return "share";
    }
    if (
      pathname === tabs.analytics ||
      pathname.startsWith(`${tabs.analytics}/`)
    ) {
      return "analytics";
    }
    if (
      pathname === tabs.comments ||
      pathname.startsWith(`${tabs.comments}/`)
    ) {
      return hasComments ? "comments" : "document";
    }
    if (
      showAuditLogTab &&
      (pathname === tabs.auditLog || pathname.startsWith(`${tabs.auditLog}/`))
    ) {
      return "auditLog";
    }
    return "document";
  }, [
    hasComments,
    pathname,
    showAuditLogTab,
    tabs.analytics,
    tabs.auditLog,
    tabs.comments,
    tabs.share,
  ]);

  const effectiveBackHref = backHrefOverride ?? backHref;
  const handleBack = () => {
    startTransition(() => {
      router.push(effectiveBackHref);
    });
  };

  const [highlightThreads, setHighlightThreads] = useState<
    InternalCommentsHighlightThread[]
  >([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [composerSelection, setComposerSelection] =
    useState<InternalCommentsComposerSelection | null>(null);
  const [pendingSelection, setPendingSelection] =
    useState<TextLayerSelection | null>(null);
  const viewerRootRef = useRef<HTMLDivElement>(null);

  const commentsOverlayEnabled = activeTab === "comments";
  useEffect(() => {
    if (!commentsOverlayEnabled) {
      setComposerSelection(null);
      setSelectedThreadId(null);
      setPendingSelection(null);
    }
  }, [commentsOverlayEnabled]);

  const handleTextSelection = useCallback(
    (selection: TextLayerSelection): void => {
      const grouped = groupCommentSelectionByPage(selection.areas);
      if (!grouped) {
        setPendingSelection(null);
        showError("Comments can only be anchored to one page at a time.");
        return;
      }
      const selectionRegion = grouped.areas.at(-1);
      if (!selectionRegion) return;
      setPendingSelection({
        ...selection,
        areas: grouped.areas,
        selectionRegion,
      });
    },
    [],
  );
  const {
    clear: clearTextSelection,
    onTextLayerReady,
    setPageRotation,
  } = useTextLayerSelection({
    enabled: commentsOverlayEnabled,
    onSelection: handleTextSelection,
    onSelectionStart: () => setPendingSelection(null),
    onError: (error) => {
      console.error("[InternalComments] Failed to capture selection", error);
      showError("Unable to capture the selected text.");
    },
  });

  const lastJumpedThreadIdRef = useRef<string | null>(null);
  const centerThreadHighlightWithRetries = useCallback((threadId: string) => {
    const root = viewerRootRef.current;
    const scroller = root?.querySelector<HTMLElement>(".dk-pdf-scroll");
    if (!root || !scroller) return;

    const run = (): void => {
      const element = root.querySelector<HTMLElement>(
        `[data-dk-comment-thread-id="${threadId}"]`,
      );
      if (!element) return;
      element.scrollIntoView({ block: "center", behavior: "auto" });
    };
    window.requestAnimationFrame(run);
    window.setTimeout(run, 50);
    window.setTimeout(run, 250);
  }, []);

  const jumpToThread = useCallback(
    (thread: InternalCommentsHighlightThread): void => {
      const root = viewerRootRef.current;
      root
        ?.querySelector<HTMLElement>(
          `[data-page-number="${thread.pageNumber}"]`,
        )
        ?.scrollIntoView({ block: "start", behavior: "auto" });
      centerThreadHighlightWithRetries(thread.id);
      setPendingSelection(null);
      setComposerSelection(null);
      setSelectedThreadId(thread.id);
    },
    [centerThreadHighlightWithRetries],
  );

  useEffect(() => {
    if (!commentsOverlayEnabled) return;
    if (!selectedThreadId) {
      lastJumpedThreadIdRef.current = null;
      return;
    }
    if (lastJumpedThreadIdRef.current === selectedThreadId) return;

    const thread = highlightThreads.find(
      (t) => t.id === selectedThreadId && t.state === "open",
    );
    if (!thread) return;

    lastJumpedThreadIdRef.current = selectedThreadId;
    jumpToThread(thread);
  }, [
    commentsOverlayEnabled,
    highlightThreads,
    jumpToThread,
    selectedThreadId,
  ]);

  const showTabs = !dataRoomName;
  const isWideSplit = activeTab !== "document" && activeTab !== "comments";
  const hideViewerOnMobile = !isDataRoomViewer && activeTab !== "document";

  const openSelectionComposer = useCallback((): void => {
    if (!pendingSelection) return;
    const grouped = groupCommentSelectionByPage(pendingSelection.areas);
    if (!grouped) {
      showError("Comments can only be anchored to one page at a time.");
      return;
    }
    setComposerSelection({
      linkId: null,
      documentId: doc.id,
      pageNumber: grouped.pageIndex + 1,
      anchor: pageAreasToStoredCommentAnchor(
        grouped.areas,
        pendingSelection.selectedText,
      ),
      selectedText: pendingSelection.selectedText,
    });
    setSelectedThreadId(null);
    setPendingSelection(null);
    clearTextSelection();
  }, [clearTextSelection, doc.id, pendingSelection]);

  const commentsPdfOverlays = useMemo<readonly PdfViewerOverlay[]>(
    () => [
      {
        id: "dk-internal-comments",
        layer: "over-text",
        onTextLayerReady,
        renderPageOverlay: ({ pageIndex, rotation }) => {
          setPageRotation(pageIndex, rotation);
          if (!commentsOverlayEnabled) return null;

          const openItems = highlightThreads.filter(
            (thread) =>
              thread.state === "open" && thread.pageNumber - 1 === pageIndex,
          );
          const firstSelectionArea =
            pendingSelection?.areas.find(
              (area) => area.pageIndex === pageIndex,
            ) ?? null;
          const screenSelectionArea = firstSelectionArea
            ? areaToScreenArea(firstSelectionArea, rotation)
            : null;
          const targetArea = screenSelectionArea
            ? {
                pageIndex,
                top: Math.max(screenSelectionArea.top - 1, 2),
                left: Math.min(
                  screenSelectionArea.left + screenSelectionArea.width + 1,
                  96,
                ),
                width: 0,
                height: 0,
              }
            : null;

          return (
            <>
              {openItems.map((thread) =>
                toHighlightAreas(thread).map((area, index) => {
                  const active = selectedThreadId === thread.id;
                  return (
                    <button
                      key={`${thread.id}-${index}`}
                      type="button"
                      data-dk-comment-thread-id={thread.id}
                      className={cn(
                        "dk-internal-comment-highlight pointer-events-auto absolute z-10 rounded-sm mix-blend-multiply transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                        active
                          ? "bg-chart-4/70!"
                          : "bg-chart-4/55! hover:bg-chart-4/65!",
                      )}
                      style={getAreaCssProperties(area, rotation)}
                      onClick={() => jumpToThread(thread)}
                      aria-label="Open comment thread"
                    />
                  );
                }),
              )}

              {targetArea ? (
                <div
                  className="dk-internal-comment-highlight-target pointer-events-auto absolute z-20"
                  style={{
                    left: `${targetArea.left}%`,
                    top: `${targetArea.top}%`,
                  }}
                >
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-10 w-10 rounded-full border border-border/60 bg-background/95 shadow-lg"
                    title="Add comment"
                    aria-label="Add comment"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openSelectionComposer();
                    }}
                    onClick={(event) => {
                      if (event.detail !== 0) event.preventDefault();
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      openSelectionComposer();
                    }}
                  >
                    <ChatCircle className="h-5 w-5" aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </>
          );
        },
      },
    ],
    [
      commentsOverlayEnabled,
      highlightThreads,
      jumpToThread,
      onTextLayerReady,
      openSelectionComposer,
      pendingSelection,
      selectedThreadId,
      setPageRotation,
    ],
  );

  const commentsOverlayContextValue = useMemo(
    () => ({
      highlightThreads,
      setHighlightThreads,
      selectedThreadId,
      setSelectedThreadId,
      composerSelection,
      setComposerSelection,
    }),
    [composerSelection, highlightThreads, selectedThreadId],
  );

  const prefetchPath = useCallback(
    (path: string) => {
      if (!path) return;
      if (prefetchedPathsRef.current.has(path)) return;
      prefetchedPathsRef.current.add(path);
      router.prefetch(path);
    },
    [router],
  );

  useEffect(() => {
    if (showTabs) {
      Object.values(tabs).forEach(prefetchPath);
    }
  }, [prefetchPath, showTabs, tabs]);

  useEffect(() => {
    if (!showTabs) return;
    if (typeof window === "undefined") return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void prefetchLinksManagerBootstrap({
        workspaceId: doc.workspace_id ?? "",
        resourceType: "document",
        resourceId: doc.id,
      }).catch(() => undefined);
    };

    const withIdle = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (withIdle.requestIdleCallback) {
      const idleId = withIdle.requestIdleCallback(run, { timeout: 1500 });
      return () => {
        cancelled = true;
        withIdle.cancelIdleCallback?.(idleId);
      };
    }

    const timer = window.setTimeout(run, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [doc.id, doc.workspace_id, showTabs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isWideSplit]);

  // Height budget: inherit the compact shell's real chrome offsets. WebKit
  // keeps the header and tab bar in normal flow (zero offsets); other mobile
  // engines retain fixed chrome. Both collapse at >=1024px.
  return (
    <InternalCommentsOverlayProvider value={commentsOverlayContextValue}>
      <PageContainer
        maxWidth="full"
        className={cn(
          "[--dk-app-header-h:var(--dk-mobile-app-header-height,calc(3.5rem+env(safe-area-inset-top)))] [--dk-app-tabbar-h:var(--dk-mobile-app-tabbar-height,calc(4rem+env(safe-area-inset-bottom)))]",
          "lg:[--dk-app-header-h:0px] lg:[--dk-app-tabbar-h:0px]",
          "[--dk-app-chrome-h:calc(var(--dk-app-header-h)_+_var(--dk-app-tabbar-h))]",
          "flex min-h-[calc(100dvh-var(--dk-app-chrome-h))] flex-col gap-5",
        )}
      >
        {/* Header section */}
        <div
          data-testid="internal-document-viewer-header"
          className="flex shrink-0 flex-col gap-3 border-b border-border/70 pb-4"
        >
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 w-fit gap-2 px-2 text-muted-foreground hover:text-foreground"
            onClick={handleBack}
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </Button>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 space-y-1.5">
              <h1 className="truncate text-xl font-medium tracking-tight">
                {title}
              </h1>
              {dataRoomName ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Data room
                  </span>
                  <Badge variant="secondary">{dataRoomName}</Badge>
                </div>
              ) : null}
            </div>
            {showTabs ? (
              <div className="no-scrollbar flex w-full items-center gap-2 overflow-x-auto md:w-auto">
                <Tabs
                  value={activeTab}
                  onValueChange={(next) =>
                    startTransition(() => {
                      router.push(tabs[next as ViewerTab]);
                    })
                  }
                  className="w-full min-w-max md:w-auto"
                >
                  <TabsList className="h-9 w-full min-w-max border border-border/70 bg-card/45 p-1 md:w-auto">
                    <TabsTrigger value="document">Document</TabsTrigger>
                    {hasComments ? (
                      <TabsTrigger
                        value="comments"
                        disabled={isNavigating}
                        onMouseEnter={() => prefetchPath(tabs.comments)}
                        onFocus={() => prefetchPath(tabs.comments)}
                      >
                        Comments
                      </TabsTrigger>
                    ) : null}
                    <TabsTrigger
                      value="share"
                      disabled={isNavigating || isProcessingDocument}
                      onMouseEnter={() => prefetchPath(tabs.share)}
                      onFocus={() => prefetchPath(tabs.share)}
                    >
                      Share
                    </TabsTrigger>
                    <TabsTrigger
                      value="analytics"
                      disabled={isNavigating || isProcessingDocument}
                      onMouseEnter={() => prefetchPath(tabs.analytics)}
                      onFocus={() => prefetchPath(tabs.analytics)}
                    >
                      Analytics
                    </TabsTrigger>
                    {showAuditLogTab ? (
                      <TabsTrigger
                        value="auditLog"
                        disabled={isNavigating}
                        onMouseEnter={() => prefetchPath(tabs.auditLog)}
                        onFocus={() => prefetchPath(tabs.auditLog)}
                      >
                        Audit log
                      </TabsTrigger>
                    ) : null}
                  </TabsList>
                </Tabs>
              </div>
            ) : null}
          </div>
        </div>

        {/* Main content grid - fills remaining space */}
        <motion.div
          layout={!reduceMotion}
          transition={reduceMotion ? { duration: 0 } : layoutTween}
          className="flex flex-col gap-4 lg:flex-row lg:items-start"
        >
          <motion.div
            ref={viewerRootRef}
            layout={!reduceMotion}
            transition={reduceMotion ? { duration: 0 } : layoutTween}
            className={cn(
              "h-[68dvh] max-h-[44rem] min-h-[28rem] min-w-0 flex-1 flex-col",
              hideViewerOnMobile ? "hidden lg:flex" : "flex",
              "overflow-hidden rounded-lg bg-card/30 lg:sticky lg:top-6 lg:h-[calc(100dvh-8rem)] lg:max-h-none lg:min-h-0",
              // Release the height clamp for the one renderer that sizes itself:
              // the video stage caps at 78vh and is vertically centred, so a
              // fixed-height `overflow-hidden` canvas cuts it off at both ends
              // with nothing to scroll to. Content height lets the page scroll.
              usesContentHeightCanvas &&
                "h-auto max-h-[none] min-h-0 flex-none lg:h-auto lg:flex-1",
            )}
            data-dk-comments-overlay={commentsOverlayEnabled ? "on" : "off"}
          >
            <Viewer
              doc={doc}
              accessMode="authenticated"
              onRetry={requestProcessing}
              onRefreshStatus={refreshDoc}
              onPageCountResolved={resolvePageCount}
              processingTimedOut={processingTimedOut}
              className={
                usesContentHeightCanvas
                  ? "dk-document-viewer h-auto min-h-0 w-full flex-none"
                  : "dk-document-viewer h-full min-h-0 w-full flex-1"
              }
              pdfOverlays={commentsPdfOverlays}
            />
          </motion.div>

          <div
            className={cn(
              "relative min-w-0 lg:flex lg:flex-col",
              isWideSplit
                ? "lg:flex-none lg:basis-[55%]"
                : "lg:w-105 lg:max-w-105 lg:flex-none",
              "lg:sticky lg:top-6 lg:h-[calc(100dvh-8rem)]",
            )}
          >
            <motion.div
              transition={reduceMotion ? { duration: 0 } : layoutTween}
              className="dk-nocturne-surface flex min-h-0 flex-col overflow-hidden rounded-lg lg:h-full"
            >
              <div className="min-w-0 overflow-x-hidden lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                {children}
              </div>
            </motion.div>
          </div>
        </motion.div>
      </PageContainer>
    </InternalCommentsOverlayProvider>
  );
};

export default InternalDocumentViewerShell;
