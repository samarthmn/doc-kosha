"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Bookmark,
  CaretDown,
  CaretLeft,
  CaretRight,
  DownloadSimple,
  ListDashes,
  Minus,
  Paperclip,
  Plus,
  Printer,
  SidebarSimple,
} from "@phosphor-icons/react";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import {
  MozillaPdfViewer,
  type MozillaPdfViewerHandle,
  type PdfViewerOverlay,
} from "@/components/documents/pdf/engine/MozillaPdfViewer";
import type {
  PdfFindRequest,
  PdfFindResult,
  PdfZoomValue,
} from "@/components/documents/pdf/engine/pdfViewerCore";
import { PdfAttachmentsPanel } from "@/components/documents/pdf/panels/PdfAttachmentsPanel";
import { PdfOutlinePanel } from "@/components/documents/pdf/panels/PdfOutlinePanel";
import { PdfThumbnailsPanel } from "@/components/documents/pdf/panels/PdfThumbnailsPanel";
import { PdfSearchPopover } from "@/components/documents/pdf/search/PdfSearchPopover";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type SidebarTab = "thumbnails" | "bookmarks" | "attachments";

type PdfLoadFailure = {
  name?: string;
  message?: string;
  status?: number;
};

type PdfViewerWithControlsProps = {
  fileUrl: string;
  theme: "light" | "dark";
  className?: string;
  overlays?: readonly PdfViewerOverlay[];
  initialZoom?: PdfZoomValue;
  smoothScroll?: boolean;
  renderLoader?: () => React.ReactElement;
  renderError: (error: PdfLoadFailure) => React.ReactElement;
  allowDownload?: boolean;
  onDownload?: () => void;
  onPrint?: () => void;
  onPageChange?: (event: { currentPage: number }) => void;
  onPageCountResolved?: (pageCount: number) => void;
};

const ZOOM_LEVELS: Array<{ label: string; value: PdfZoomValue }> = [
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
  { label: "100%", value: 1 },
  { label: "125%", value: 1.25 },
  { label: "150%", value: 1.5 },
  { label: "200%", value: 2 },
  { label: "Page fit", value: "fit-page" },
  { label: "Page width", value: "fit-width" },
  { label: "Actual size", value: "actual-size" },
];

const isMacPlatform = (): boolean =>
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

const PdfViewerWithControls: React.FC<PdfViewerWithControlsProps> = ({
  fileUrl,
  theme,
  className,
  overlays,
  initialZoom = "fit-page",
  smoothScroll,
  renderLoader,
  renderError,
  allowDownload = true,
  onDownload,
  onPrint,
  onPageChange,
  onPageCountResolved,
}) => {
  const engineRef = useRef<MozillaPdfViewerHandle | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pointerInsideRef = useRef(false);

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("thumbnails");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [findResult, setFindResult] = useState<PdfFindResult | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);

  const loadingNode = useMemo(() => renderLoader?.(), [renderLoader]);

  const handlePageChange = useCallback(
    (event: { currentPage: number }) => {
      const nextPage = event.currentPage + 1;
      setCurrentPage(nextPage);
      setPageInput(String(nextPage));
      onPageChange?.(event);
    },
    [onPageChange],
  );

  const handleDocumentLoad = useCallback(
    (document: PDFDocumentProxy) => {
      const nextPageCount = document.numPages || 0;
      setPdfDocument(document);
      setPageCount(nextPageCount);
      setCurrentPage(1);
      setPageInput("1");
      setRotation(0);
      if (nextPageCount > 0) onPageCountResolved?.(nextPageCount);
    },
    [onPageCountResolved],
  );

  // A new source invalidates the panels before the engine reports the next one.
  useEffect(() => {
    setPdfDocument(null);
    setPageCount(0);
    setCurrentPage(1);
    setPageInput("1");
    setRotation(0);
    setSearchOpen(false);
    setFindResult(null);
  }, [fileUrl]);

  const jumpToPage = useCallback((pageNumber: number) => {
    engineRef.current?.goToPage(pageNumber - 1);
  }, []);

  const handleFind = useCallback((request: PdfFindRequest) => {
    engineRef.current?.find(request);
  }, []);
  const handleDismissFind = useCallback(() => {
    engineRef.current?.dismissFind();
  }, []);
  const handleResetFindResult = useCallback(() => setFindResult(null), []);

  const handleJumpToPage = () => {
    const parsed = Number(pageInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setPageInput(String(currentPage));
      return;
    }
    const clamped = pageCount ? Math.min(pageCount, parsed) : parsed;
    setPageInput(String(clamped));
    jumpToPage(clamped);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (allowDownload) return;
    const isPrint =
      (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p";
    if (isPrint) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  useEffect(() => {
    if (allowDownload) return;
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      const isPrint =
        (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p";
      if (isPrint) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [allowDownload]);

  // Rebuilds the shortcuts the retired zoom/page-navigation/search plugins
  // registered on `document`, including their "pointer inside or focus inside
  // the viewer" gate.
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const focusInside =
        document.activeElement instanceof Node &&
        root.contains(document.activeElement);
      if (!pointerInsideRef.current && !focusInside) return;

      const engine = engineRef.current;
      if (!engine) return;
      const isMac = isMacPlatform();
      const commandPressed = isMac
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey;
      const historyModifier =
        !event.shiftKey &&
        !event.ctrlKey &&
        ((event.altKey && !event.metaKey) ||
          (isMac && event.metaKey && !event.altKey));

      if (historyModifier && event.key === "ArrowLeft") {
        event.preventDefault();
        engine.historyBack();
        return;
      }
      if (historyModifier && event.key === "ArrowRight") {
        event.preventDefault();
        engine.historyForward();
        return;
      }

      if (!event.shiftKey && !event.altKey && commandPressed) {
        if (event.key === "f") {
          event.preventDefault();
          setSearchOpen(true);
          return;
        }
        if (event.key === "-") {
          event.preventDefault();
          engine.zoomOut();
          return;
        }
        if (event.key === "=") {
          event.preventDefault();
          engine.zoomIn();
          return;
        }
        if (event.key === "0") {
          event.preventDefault();
          engine.setZoom(1);
          return;
        }
      }

      const goNext =
        (event.altKey && event.key === "ArrowDown") ||
        (!event.shiftKey && !event.altKey && event.key === "PageDown");
      const goPrevious =
        (event.altKey && event.key === "ArrowUp") ||
        (!event.shiftKey && !event.altKey && event.key === "PageUp");
      if (goNext) {
        event.preventDefault();
        engine.nextPage();
        return;
      }
      if (goPrevious) {
        event.preventDefault();
        engine.previousPage();
      }
    };

    document.addEventListener("keydown", handleShortcut);
    return () => {
      document.removeEventListener("keydown", handleShortcut);
    };
  }, []);

  const disablePrev = currentPage <= 1;
  const disableNext = pageCount > 0 ? currentPage >= pageCount : true;

  const handleSelectPageFromPanel = useCallback(
    (pageNumber: number) => {
      jumpToPage(pageNumber);
      setMobileSidebarOpen(false);
    },
    [jumpToPage],
  );

  const sidebarContent = (
    <Tabs
      value={sidebarTab}
      onValueChange={(next) => setSidebarTab(next as SidebarTab)}
      className="dk-pdf-sidebar flex h-full flex-col"
    >
      <TabsList className="mx-3 mt-3 grid h-auto grid-cols-3">
        <TabsTrigger value="thumbnails" className="gap-1.5 text-xs">
          <ListDashes aria-hidden className="h-3.5 w-3.5" />
          Pages
        </TabsTrigger>
        <TabsTrigger value="bookmarks" className="gap-1.5 text-xs">
          <Bookmark aria-hidden className="h-3.5 w-3.5" />
          Outline
        </TabsTrigger>
        <TabsTrigger value="attachments" className="gap-1.5 text-xs">
          <Paperclip aria-hidden className="h-3.5 w-3.5" />
          Files
        </TabsTrigger>
      </TabsList>
      <TabsContent value="thumbnails" className="flex-1 overflow-auto p-3">
        <PdfThumbnailsPanel
          document={pdfDocument}
          pageCount={pageCount}
          currentPage={currentPage}
          rotation={rotation}
          onSelectPage={handleSelectPageFromPanel}
        />
      </TabsContent>
      <TabsContent value="bookmarks" className="flex-1 overflow-auto p-3">
        <PdfOutlinePanel
          document={pdfDocument}
          onSelectPage={handleSelectPageFromPanel}
        />
      </TabsContent>
      <TabsContent value="attachments" className="flex-1 overflow-auto p-3">
        <PdfAttachmentsPanel document={pdfDocument} />
      </TabsContent>
    </Tabs>
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg bg-muted/25",
        className,
      )}
      data-export-allowed={allowDownload ? "true" : "false"}
      onKeyDown={handleKeyDown}
      onPointerEnter={() => {
        pointerInsideRef.current = true;
      }}
      onPointerLeave={() => {
        pointerInsideRef.current = false;
      }}
    >
      <div className="no-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border/70 bg-[var(--dk-surface-overlay)] px-2 py-1.5 [box-shadow:var(--dk-shadow-card)]">
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 lg:hidden"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <SidebarSimple aria-hidden className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 lg:inline-flex"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            <SidebarSimple aria-hidden className="h-4 w-4" />
          </Button>
          <PdfSearchPopover
            open={searchOpen}
            onOpenChange={setSearchOpen}
            result={findResult}
            onFind={handleFind}
            onDismiss={handleDismissFind}
            onResetResult={handleResetFindResult}
          />
        </div>

        <Separator orientation="vertical" className="h-6" />

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => engineRef.current?.previousPage()}
            disabled={disablePrev}
            aria-label="Previous page"
          >
            <CaretLeft aria-hidden className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1 text-xs">
            <input
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={handleJumpToPage}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleJumpToPage();
                }
              }}
              inputMode="numeric"
              className="h-7 w-10 rounded border border-input bg-card px-2 text-center text-xs outline-none focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              aria-label="Current page"
            />
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">
              {pageCount > 0 ? pageCount : "—"}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => engineRef.current?.nextPage()}
            disabled={disableNext}
            aria-label="Next page"
          >
            <CaretRight aria-hidden className="h-4 w-4" />
          </Button>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => engineRef.current?.zoomOut()}
            aria-label="Zoom out"
          >
            <Minus aria-hidden className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-xs"
                aria-label="Zoom level"
              >
                <span>{Math.round(scale * 100)}%</span>
                <CaretDown aria-hidden className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              {ZOOM_LEVELS.map((level) => (
                <DropdownMenuItem
                  key={level.label}
                  onSelect={() => engineRef.current?.setZoom(level.value)}
                >
                  {level.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => engineRef.current?.zoomIn()}
            aria-label="Zoom in"
          >
            <Plus aria-hidden className="h-4 w-4" />
          </Button>

          <Separator orientation="vertical" className="mx-1 h-6" />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              engineRef.current?.rotateCounterclockwise();
              setRotation((current) => (current + 270) % 360);
            }}
            aria-label="Rotate left"
          >
            <ArrowCounterClockwise aria-hidden className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              engineRef.current?.rotateClockwise();
              setRotation((current) => (current + 90) % 360);
            }}
            aria-label="Rotate right"
          >
            <ArrowClockwise aria-hidden className="h-4 w-4" />
          </Button>

          {allowDownload && onDownload ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onDownload}
              aria-label="Download"
            >
              <DownloadSimple aria-hidden className="h-4 w-4" />
            </Button>
          ) : null}
          {allowDownload && onPrint ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onPrint}
              aria-label="Print"
            >
              <Printer aria-hidden className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {sidebarOpen ? (
          <aside className="hidden w-64 shrink-0 border-r border-border/70 bg-[var(--dk-surface-raised)] lg:flex">
            {sidebarContent}
          </aside>
        ) : null}
        <div className="min-w-0 flex-1">
          <MozillaPdfViewer
            ref={engineRef}
            file={fileUrl}
            className={theme === "dark" ? "bg-background" : undefined}
            initialZoom={initialZoom}
            overlays={overlays}
            smoothScroll={smoothScroll !== false}
            loading={loadingNode}
            renderError={renderError}
            onDocumentLoad={handleDocumentLoad}
            onPageChange={handlePageChange}
            onScaleChange={(event) => setScale(event.scale)}
            onFindResult={setFindResult}
          />
        </div>
      </div>

      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent
          side="left"
          className="bg-[var(--dk-surface-overlay)] p-0"
        >
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle>Document navigation</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100dvh-4.5rem)]">{sidebarContent}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default PdfViewerWithControls;
