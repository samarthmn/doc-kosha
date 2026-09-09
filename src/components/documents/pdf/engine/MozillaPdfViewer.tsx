"use client";

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type {
  DocumentInitParameters,
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
} from "pdfjs-dist/types/src/display/api";
import type { PDFPageView } from "pdfjs-dist/types/web/pdf_page_view";
import type {
  EventBus,
  PDFFindController,
  PDFHistory,
  PDFLinkService,
  PDFViewer,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import {
  createPdfViewerCommands,
  getPdfStateHook,
  normalizePdfEngineError,
  normalizePdfFindMatches,
  reducePdfEngineState,
  toPdfFindEventPayload,
  toPdfFindStatus,
  type PdfEngineError,
  type PdfEngineState,
  type PdfFindRequest,
  type PdfFindResult,
  type PdfViewerCommands,
  type PdfViewerCommandTarget,
  type PdfZoomValue,
} from "@/components/documents/pdf/engine/pdfViewerCore";
import {
  createPageOverlayContext,
  getPageOverlayHostStyles,
  type PageOverlayContext,
} from "@/components/documents/pdf/geometry/pageAreas";
import { isCurrentPdfPageEvent } from "@/components/documents/pdf/engine/pdfPageEvents";
import { cn } from "@/lib/utils";
import { useOptionalSidebarLayoutTransitionCoordinator } from "@/components/layouts/SidebarLayoutTransitionContext";
import { createSidebarAwareResizeCommitter } from "@/components/layouts/sidebarLayoutTransition";

export type PdfDocumentSource = string | URL | Uint8Array | ArrayBuffer;

export type PdfTextLayerReadyEvent = {
  phase: "attach" | "detach";
  pageIndex: number;
  element: HTMLDivElement;
};

/**
 * `under-text` paints between the canvas and pdf.js's text layer (z-index 2),
 * which is where the retired `renderPageLayer` contract put the watermark.
 * `over-text` paints above the annotation layer, where interactive overlays
 * such as comment and redaction boxes belong.
 */
export type PdfOverlayLayer = "under-text" | "over-text";

export type PdfViewerOverlay = {
  id: string;
  layer?: PdfOverlayLayer;
  renderPageOverlay?: (context: PageOverlayContext) => React.ReactNode;
  onTextLayerReady?: (event: PdfTextLayerReadyEvent) => void;
};

export type MozillaPdfViewerHandle = PdfViewerCommands & {
  find: (request: PdfFindRequest) => void;
  dismissFind: () => void;
  historyBack: () => void;
  historyForward: () => void;
};

export type MozillaPdfViewerProps = {
  file: PdfDocumentSource;
  className?: string;
  initialZoom?: PdfZoomValue;
  overlays?: readonly PdfViewerOverlay[];
  loading?: React.ReactNode;
  /** Animate programmatic page jumps; disabled for reduced-motion users. */
  smoothScroll?: boolean;
  renderError?: (error: PdfEngineError) => React.ReactNode;
  renderPassword?: (props: {
    incorrect: boolean;
    submitPassword: (password: string) => void;
  }) => React.ReactNode;
  onDocumentLoad?: (document: PDFDocumentProxy) => void;
  onPageChange?: (event: { currentPage: number }) => void;
  onScaleChange?: (event: { scale: number; preset: string | null }) => void;
  onFindResult?: (result: PdfFindResult) => void;
};

type PageRenderEvent = {
  source: unknown;
  pageNumber: number;
  error?: unknown;
};

type PageChangingEvent = {
  pageNumber: number;
};

type ScaleChangingEvent = {
  scale: number;
  presetValue?: string;
};

type FindMatchesCountEvent = {
  matchesCount: unknown;
};

type FindControlStateEvent = {
  state: number;
  matchesCount: unknown;
};

type OverlayHosts = {
  "under-text": HTMLDivElement;
  "over-text": HTMLDivElement;
};

type OverlayMount = {
  pageIndex: number;
  hosts: OverlayHosts;
  context: PageOverlayContext;
};

type TextLayerRegistration = {
  element: HTMLDivElement;
  listeners: readonly PdfViewerOverlay[];
};

type PasswordPromptProps = {
  incorrect: boolean;
  onSubmit: (password: string) => void;
};

const PDF_VIEWER_STYLESHEET_ID = "dk-mozilla-pdf-viewer-styles";
const PDF_VIEWER_STYLESHEET_HREF = "/pdfjs/pdf_viewer.css";

// pdf_viewer.css stacks `.canvasWrapper` at 1, `.textLayer` at 2 and
// `.annotationLayer` at 3 inside every `.page`. An under-text host shares the
// canvas level and wins on DOM order (it is re-appended after `pagerendered`),
// so it paints over the canvas but below the text layer — the exact slot the
// watermark occupied under the retired viewer's `renderPageLayer`.
const OVERLAY_HOST_Z_INDEX: Record<PdfOverlayLayer, string> = {
  "under-text": "1",
  "over-text": "4",
};
const OVERLAY_LAYERS: readonly PdfOverlayLayer[] = ["under-text", "over-text"];

const PdfPasswordPrompt: React.FC<PasswordPromptProps> = ({
  incorrect,
  onSubmit,
}) => {
  const [password, setPassword] = useState("");

  return (
    <form
      className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(password);
      }}
    >
      <p className="text-sm font-medium text-foreground">
        {incorrect
          ? "The password is wrong. Please try again."
          : "This document requires a password to open."}
      </p>
      <div className="mt-4 flex gap-2">
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label="Document password"
          autoFocus
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Submit
        </button>
      </div>
    </form>
  );
};

const toDocumentParameters = (
  file: PdfDocumentSource,
  options: DocumentInitParameters,
): DocumentInitParameters => {
  if (typeof file === "string" || file instanceof URL) {
    return {
      ...options,
      url: typeof file === "string" ? file : file.href,
    };
  }
  return {
    ...options,
    data: file,
  };
};

const createCommandTarget = (
  viewer: PDFViewer | null,
): PdfViewerCommandTarget | null => {
  if (!viewer) return null;
  return {
    pagesCount: viewer.pagesCount,
    currentPageNumber: viewer.currentPageNumber,
    currentScaleValue: viewer.currentScaleValue,
    pagesRotation: viewer.pagesRotation,
    scrollPageIntoView: ({ pageNumber }) => {
      viewer.scrollPageIntoView({ pageNumber });
    },
    setScaleValue: (value) => {
      viewer.currentScaleValue = String(value);
    },
    setRotation: (rotation) => {
      viewer.pagesRotation = rotation;
    },
    zoomIn: () => {
      viewer.increaseScale();
    },
    zoomOut: () => {
      viewer.decreaseScale();
    },
  };
};

const hostsMatch = (left: OverlayHosts, right: OverlayHosts): boolean =>
  left["under-text"] === right["under-text"] &&
  left["over-text"] === right["over-text"];

const contextsMatch = (
  left: PageOverlayContext,
  right: PageOverlayContext,
): boolean =>
  left.pageIndex === right.pageIndex &&
  left.width === right.width &&
  left.height === right.height &&
  left.scale === right.scale &&
  left.rotation === right.rotation;

const notifyTextLayer = (
  overlay: PdfViewerOverlay,
  event: PdfTextLayerReadyEvent,
): void => {
  overlay.onTextLayerReady?.(event);
};

const clearViewerDocument = (viewer: PDFViewer): void => {
  // PDFViewer's runtime accepts null to release its document and listeners,
  // although the declaration omits null from this public method.
  Reflect.apply(viewer.setDocument, viewer, [null]);
};

export const MozillaPdfViewer = forwardRef<
  MozillaPdfViewerHandle,
  MozillaPdfViewerProps
>(function MozillaPdfViewer(
  {
    file,
    className,
    initialZoom = "fit-page",
    overlays = [],
    loading,
    smoothScroll = false,
    renderError,
    renderPassword,
    onDocumentLoad,
    onPageChange,
    onScaleChange,
    onFindResult,
  },
  ref,
) {
  const sidebarLayoutTransition =
    useOptionalSidebarLayoutTransitionCoordinator();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerElementRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFViewer | null>(null);
  const eventBusRef = useRef<EventBus | null>(null);
  const historyRef = useRef<PDFHistory | null>(null);
  const requestIdRef = useRef(0);
  const activeSourceRef = useRef<PdfDocumentSource>(file);
  const passwordRequestRef = useRef<{
    requestId: number;
    submit: (password: string) => void;
  } | null>(null);
  const overlaysRef = useRef(overlays);
  const initialZoomRef = useRef(initialZoom);
  const onDocumentLoadRef = useRef(onDocumentLoad);
  const onPageChangeRef = useRef(onPageChange);
  const onScaleChangeRef = useRef(onScaleChange);
  const onFindResultRef = useRef(onFindResult);
  const textLayersRef = useRef<Map<number, TextLayerRegistration>>(new Map());
  const [overlayMounts, setOverlayMounts] = useState<readonly OverlayMount[]>(
    [],
  );
  const [state, dispatch] = useReducer(reducePdfEngineState, {
    requestId: 0,
    status: "loading",
  } satisfies PdfEngineState);

  overlaysRef.current = overlays;
  initialZoomRef.current = initialZoom;
  onDocumentLoadRef.current = onDocumentLoad;
  onPageChangeRef.current = onPageChange;
  onScaleChangeRef.current = onScaleChange;
  onFindResultRef.current = onFindResult;

  const commands = useMemo(
    () => createPdfViewerCommands(() => createCommandTarget(viewerRef.current)),
    [],
  );
  const handle = useMemo<MozillaPdfViewerHandle>(
    () => ({
      ...commands,
      find: (request) => {
        eventBusRef.current?.dispatch("find", toPdfFindEventPayload(request));
      },
      dismissFind: () => {
        eventBusRef.current?.dispatch("findbarclose", { source: null });
      },
      historyBack: () => {
        historyRef.current?.back();
      },
      historyForward: () => {
        historyRef.current?.forward();
      },
    }),
    [commands],
  );
  useImperativeHandle(ref, () => handle, [handle]);

  useEffect(() => {
    if (document.getElementById(PDF_VIEWER_STYLESHEET_ID)) return;
    const stylesheet = document.createElement("link");
    stylesheet.id = PDF_VIEWER_STYLESHEET_ID;
    stylesheet.rel = "stylesheet";
    stylesheet.href = PDF_VIEWER_STYLESHEET_HREF;
    document.head.append(stylesheet);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeCommitter = createSidebarAwareResizeCommitter({
      coordinator: sidebarLayoutTransition,
      onCommit: () => {
        const viewer = viewerRef.current;
        if (!viewer) return;
        const scaleValue = viewer.currentScaleValue;
        if (scaleValue !== "page-fit" && scaleValue !== "page-width") return;
        // PDFViewer computes named fit modes from its current container size
        // only when the value is assigned. Reapply the sticky mode after a
        // responsive layout change so mobile PageFit/PageWidth re-measure.
        viewer.currentScaleValue = scaleValue;
      },
    });
    const observer = new ResizeObserver(() => {
      resizeCommitter.requestCommit();
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      resizeCommitter.dispose();
    };
  }, [sidebarLayoutTransition]);

  useEffect(() => {
    for (const [pageIndex, registration] of textLayersRef.current) {
      const previous = new Map(
        registration.listeners.map((overlay) => [overlay.id, overlay]),
      );
      const nextListeners = overlays.filter(
        (overlay) => overlay.onTextLayerReady != null,
      );
      const next = new Map(
        nextListeners.map((overlay) => [overlay.id, overlay]),
      );

      for (const [id, overlay] of previous) {
        if (next.get(id) === overlay) continue;
        notifyTextLayer(overlay, {
          phase: "detach",
          pageIndex,
          element: registration.element,
        });
      }
      for (const [id, overlay] of next) {
        if (previous.get(id) === overlay) continue;
        notifyTextLayer(overlay, {
          phase: "attach",
          pageIndex,
          element: registration.element,
        });
      }
      registration.listeners = nextListeners;
    }
  }, [overlays]);

  useEffect(() => {
    const container = containerRef.current;
    const viewerElement = viewerElementRef.current;
    if (!container || !viewerElement) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    activeSourceRef.current = file;
    passwordRequestRef.current = null;
    setOverlayMounts([]);
    dispatch({ type: "load", requestId });

    let active = true;
    let eventBus: EventBus | null = null;
    let linkService: PDFLinkService | null = null;
    let pdfHistory: PDFHistory | null = null;
    let findController: PDFFindController | null = null;
    let pdfViewer: PDFViewer | null = null;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let handleFindMatchesCount:
      ((event: FindMatchesCountEvent) => void) | null = null;
    let handleFindControlState:
      ((event: FindControlStateEvent) => void) | null = null;

    const detachTextLayer = (pageIndex: number): void => {
      const registration = textLayersRef.current.get(pageIndex);
      if (!registration) return;
      registration.element.removeAttribute("data-dk-text-layer");
      for (const overlay of registration.listeners) {
        notifyTextLayer(overlay, {
          phase: "detach",
          pageIndex,
          element: registration.element,
        });
      }
      textLayersRef.current.delete(pageIndex);
    };

    const detachAllTextLayers = (): void => {
      for (const pageIndex of Array.from(textLayersRef.current.keys())) {
        detachTextLayer(pageIndex);
      }
    };

    const resolveOverlayHost = (
      pageDiv: HTMLElement,
      pageIndex: number,
      layer: PdfOverlayLayer,
    ): HTMLDivElement => {
      const key = `${layer}:${pageIndex}`;
      let host = pageDiv.querySelector<HTMLDivElement>(
        `:scope > [data-dk-pdf-overlay-host="${key}"]`,
      );
      if (!host) {
        host = document.createElement("div");
        host.dataset.dkPdfOverlayHost = key;
        host.className = "dk-pdf-overlay-host";
        host.style.overflow = "visible";
        host.style.pointerEvents = "none";
        host.style.position = "absolute";
        host.style.zIndex = OVERLAY_HOST_Z_INDEX[layer];
      }
      // Re-appending after each render keeps the under-text host later in DOM
      // order than pdf.js's freshly inserted canvas wrapper, which shares its
      // z-index.
      pageDiv.append(host);
      return host;
    };

    const mountPageOverlay = ({
      source,
      pageNumber,
    }: PageRenderEvent & { source: PDFPageView }): void => {
      const pageIndex = pageNumber - 1;
      const hosts = {
        "under-text": resolveOverlayHost(source.div, pageIndex, "under-text"),
        "over-text": resolveOverlayHost(source.div, pageIndex, "over-text"),
      } satisfies OverlayHosts;

      // Overlay geometry must use the DOCUMENT rotation only, not pdf.js's
      // totalRotation (= document rotation + the page's intrinsic /Rotate).
      //
      // Stored comment anchors and redaction areas are percentages of the page
      // AS DISPLAYED, which already has /Rotate applied by the renderer — the
      // retired viewer passed only its own rotation state here, so every
      // anchor in the database follows that contract. Feeding totalRotation in
      // would re-transform anchors on scanned/faxed pages carrying /Rotate,
      // moving every existing highlight on those documents.
      const rotation =
        (((source.viewport.rotation - source.pdfPageRotate) % 360) + 360) % 360;
      const context = createPageOverlayContext({
        pageIndex,
        scale: source.scale,
        viewport: {
          width: source.viewport.width,
          height: source.viewport.height,
          rotation,
        },
      });
      const hostStyles = getPageOverlayHostStyles(context);
      hosts["under-text"].dataset.dkPageRotation = String(rotation);
      hosts["over-text"].dataset.dkPageRotation = String(rotation);
      Object.assign(hosts["under-text"].style, hostStyles);
      Object.assign(hosts["over-text"].style, hostStyles);
      setOverlayMounts((current) => {
        const existing = current.find((mount) => mount.pageIndex === pageIndex);
        if (
          existing &&
          hostsMatch(existing.hosts, hosts) &&
          contextsMatch(existing.context, context)
        ) {
          return current;
        }
        return [
          ...current.filter((mount) => mount.pageIndex !== pageIndex),
          { pageIndex, hosts, context },
        ].sort((left, right) => left.pageIndex - right.pageIndex);
      });
    };

    const handlePageRender = (event: PageRenderEvent): void => {
      if (!active || !isCurrentPdfPageEvent<PDFPageView>(pdfViewer, event))
        return;
      detachTextLayer(event.pageNumber - 1);
      mountPageOverlay(event);
    };

    const handlePageRendered = (event: PageRenderEvent): void => {
      if (!active || !isCurrentPdfPageEvent<PDFPageView>(pdfViewer, event))
        return;
      if (event.error == null) mountPageOverlay(event);
    };

    const handleTextLayerRendered = (event: PageRenderEvent): void => {
      if (!active || !isCurrentPdfPageEvent<PDFPageView>(pdfViewer, event))
        return;
      const pageIndex = event.pageNumber - 1;
      const element = event.source.textLayer?.div;
      if (!(element instanceof HTMLDivElement)) return;

      const existing = textLayersRef.current.get(pageIndex);
      if (existing?.element === element) {
        element.dataset.dkTextLayer = String(pageIndex);
        return;
      }
      detachTextLayer(pageIndex);
      element.dataset.dkTextLayer = String(pageIndex);
      const listeners = overlaysRef.current.filter(
        (overlay) => overlay.onTextLayerReady != null,
      );
      textLayersRef.current.set(pageIndex, { element, listeners });
      for (const overlay of listeners) {
        notifyTextLayer(overlay, {
          phase: "attach",
          pageIndex,
          element,
        });
      }
    };

    const handlePageChanging = (event: PageChangingEvent): void => {
      onPageChangeRef.current?.({ currentPage: event.pageNumber - 1 });
    };

    const handleScaleChanging = (event: ScaleChangingEvent): void => {
      onScaleChangeRef.current?.({
        scale: event.scale,
        preset:
          typeof event.presetValue === "string" ? event.presetValue : null,
      });
    };

    const handlePagesInit = (): void => {
      commands.setZoom(initialZoomRef.current);
    };

    const run = async (): Promise<void> => {
      try {
        const { loadMozillaPdfjsRuntime, PDF_DOCUMENT_OPTIONS } =
          await import("@/components/documents/pdf/engine/pdfjsRuntime");
        const runtime = await loadMozillaPdfjsRuntime();
        if (!active) return;

        eventBus = new runtime.viewer.EventBus();
        linkService = new runtime.viewer.PDFLinkService({ eventBus });
        pdfHistory = new runtime.viewer.PDFHistory({
          eventBus,
          linkService,
        });
        linkService.setHistory(pdfHistory);
        // PDFViewer builds every text layer with a TextHighlighter bound to
        // this controller, so match painting and scroll-to-match come from
        // pdf.js itself rather than a hand-rolled DOM pass.
        findController = new runtime.viewer.PDFFindController({
          eventBus,
          linkService,
        });
        pdfViewer = new runtime.viewer.PDFViewer({
          container,
          viewer: viewerElement,
          eventBus,
          linkService,
          findController,
          // DocKosha renders existing annotations but does not expose PDF.js's
          // annotation editor.
          annotationEditorMode: runtime.pdfjs.AnnotationEditorType.DISABLE,
          imageResourcesPath: "/pdfjs/images/",
        });
        linkService.setViewer(pdfViewer);
        viewerRef.current = pdfViewer;
        eventBusRef.current = eventBus;

        handleFindMatchesCount = ({ matchesCount }: FindMatchesCountEvent) => {
          onFindResultRef.current?.({
            status: "found",
            matches: normalizePdfFindMatches(matchesCount),
          });
        };
        handleFindControlState = ({
          state,
          matchesCount,
        }: FindControlStateEvent) => {
          onFindResultRef.current?.({
            status: toPdfFindStatus(state, runtime.viewer.FindState),
            matches: normalizePdfFindMatches(matchesCount),
          });
        };

        eventBus.on("pagerender", handlePageRender);
        eventBus.on("pagerendered", handlePageRendered);
        eventBus.on("textlayerrendered", handleTextLayerRendered);
        eventBus.on("pagechanging", handlePageChanging);
        eventBus.on("pagesinit", handlePagesInit);
        eventBus.on("scalechanging", handleScaleChanging);
        eventBus.on("updatefindmatchescount", handleFindMatchesCount);
        eventBus.on("updatefindcontrolstate", handleFindControlState);

        loadingTask = runtime.pdfjs.getDocument(
          toDocumentParameters(file, PDF_DOCUMENT_OPTIONS),
        );
        loadingTask.onPassword = (
          submitPassword: (password: string) => void,
          reason: number,
        ) => {
          if (!active) return;
          passwordRequestRef.current = {
            requestId,
            submit: submitPassword,
          };
          dispatch({
            type: "password",
            requestId,
            incorrect:
              reason === runtime.pdfjs.PasswordResponses.INCORRECT_PASSWORD,
          });
        };

        const document = await loadingTask.promise;
        if (!active) {
          await document.destroy();
          return;
        }
        linkService.setDocument(document);
        const fingerprint = document.fingerprints[0];
        if (fingerprint) {
          pdfHistory.initialize({
            fingerprint,
            resetHistory: true,
            updateUrl: false,
          });
        }
        pdfViewer.setDocument(document);
        historyRef.current = pdfHistory;
        onDocumentLoadRef.current?.(document);

        const firstPageRendered = pdfViewer.onePageRendered;
        if (firstPageRendered) await firstPageRendered;
        if (!active) return;
        dispatch({ type: "ready", requestId });
      } catch (error) {
        if (!active) return;
        passwordRequestRef.current = null;
        dispatch({
          type: "error",
          requestId,
          error: normalizePdfEngineError(error),
        });
      }
    };

    void run();

    return () => {
      active = false;
      passwordRequestRef.current = null;
      detachAllTextLayers();
      if (eventBus) {
        eventBus.off("pagerender", handlePageRender);
        eventBus.off("pagerendered", handlePageRendered);
        eventBus.off("textlayerrendered", handleTextLayerRendered);
        eventBus.off("pagechanging", handlePageChanging);
        eventBus.off("pagesinit", handlePagesInit);
        eventBus.off("scalechanging", handleScaleChanging);
        if (handleFindMatchesCount) {
          eventBus.off("updatefindmatchescount", handleFindMatchesCount);
        }
        if (handleFindControlState) {
          eventBus.off("updatefindcontrolstate", handleFindControlState);
        }
      }
      if (pdfViewer) {
        pdfViewer.cleanup();
        clearViewerDocument(pdfViewer);
      }
      if (viewerRef.current === pdfViewer) viewerRef.current = null;
      if (eventBusRef.current === eventBus) eventBusRef.current = null;
      if (historyRef.current === pdfHistory) historyRef.current = null;
      pdfHistory?.reset();
      if (loadingTask) void loadingTask.destroy();
      viewerElement.replaceChildren();
    };
  }, [commands, file]);

  const stateForSource: PdfEngineState =
    activeSourceRef.current === file
      ? state
      : { requestId: requestIdRef.current + 1, status: "loading" };
  const publicState = getPdfStateHook(stateForSource);

  const submitPassword = (password: string): void => {
    const request = passwordRequestRef.current;
    if (!request || request.requestId !== stateForSource.requestId) return;
    dispatch({ type: "load", requestId: request.requestId });
    request.submit(password);
  };

  return (
    <div
      className={cn(
        "relative h-full min-h-0 w-full overflow-hidden bg-muted/25",
        className,
      )}
      data-dk-pdf-state={publicState}
      style={{
        // pdf.js reads these from :root; overriding them here reproduces the
        // retired search plugin's yellow/green match tints without a global
        // stylesheet edit.
        ["--highlight-bg-color" as string]: "rgba(255, 214, 0, 1)",
        ["--highlight-selected-bg-color" as string]: "rgba(0, 128, 0, 1)",
      }}
    >
      <div
        ref={containerRef}
        className="dk-pdf-scroll absolute inset-0 overflow-auto"
        style={{ scrollBehavior: smoothScroll ? "smooth" : "auto" }}
      >
        <div ref={viewerElementRef} className="pdfViewer" />
      </div>

      {stateForSource.status === "loading" ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-card/90 p-6"
          role="status"
          aria-live="polite"
        >
          {loading ?? <span className="text-sm">Loading document…</span>}
        </div>
      ) : null}

      {stateForSource.status === "password" ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/95 p-6">
          {renderPassword ? (
            renderPassword({
              incorrect: stateForSource.incorrect,
              submitPassword,
            })
          ) : (
            <PdfPasswordPrompt
              incorrect={stateForSource.incorrect}
              onSubmit={submitPassword}
            />
          )}
        </div>
      ) : null}

      {stateForSource.status === "error" ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-card p-6">
          {renderError ? (
            renderError(stateForSource.error)
          ) : (
            <div role="alert" className="max-w-md text-center">
              <p className="font-medium">Document could not be loaded</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {stateForSource.error.message}
              </p>
            </div>
          )}
        </div>
      ) : null}

      {overlayMounts.flatMap((mount) =>
        overlays.flatMap((overlay) => {
          if (!overlay.renderPageOverlay) return [];
          const layer = overlay.layer ?? "over-text";
          if (!OVERLAY_LAYERS.includes(layer)) return [];
          return [
            createPortal(
              overlay.renderPageOverlay(mount.context),
              mount.hosts[layer],
              `${overlay.id}:${mount.pageIndex}`,
            ),
          ];
        }),
      )}
    </div>
  );
});
