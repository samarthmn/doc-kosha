"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { cn } from "@/lib/utils";

const THUMBNAIL_WIDTH = 132;
// Roughly ±10 pages either side of a viewport-height column of thumbnails.
const THUMBNAIL_CACHE_LIMIT = 48;
const DEFAULT_ASPECT_RATIO = 1 / Math.SQRT2;

type PdfThumbnailsPanelProps = {
  document: PDFDocumentProxy | null;
  pageCount: number;
  /** 1-based, matching the toolbar readout. */
  currentPage: number;
  rotation: number;
  onSelectPage: (pageNumber: number) => void;
};

const renderThumbnail = async (
  document: PDFDocumentProxy,
  pageNumber: number,
  rotation: number,
): Promise<string | null> => {
  const page = await document.getPage(pageNumber);
  const totalRotation = (page.rotate + rotation) % 360;
  const base = page.getViewport({ scale: 1, rotation: totalRotation });
  if (base.width <= 0) return null;

  const ratio =
    typeof window === "undefined"
      ? 1
      : Math.min(2, window.devicePixelRatio || 1);
  const viewport = page.getViewport({
    scale: (THUMBNAIL_WIDTH / base.width) * ratio,
    rotation: totalRotation,
  });
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) return null;

  await page.render({ canvas, canvasContext, viewport }).promise;
  return canvas.toDataURL("image/png");
};

export const PdfThumbnailsPanel: React.FC<PdfThumbnailsPanelProps> = ({
  document: pdfDocument,
  pageCount,
  currentPage,
  rotation,
  onSelectPage,
}) => {
  const [thumbnails, setThumbnails] = useState<ReadonlyMap<number, string>>(
    () => new Map(),
  );
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT_RATIO);
  const requestedRef = useRef<Set<number>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const activeRef = useRef(true);

  const pageNumbers = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index + 1),
    [pageCount],
  );

  // A new document or rotation invalidates every raster.
  useEffect(() => {
    activeRef.current = true;
    requestedRef.current = new Set();
    setThumbnails(new Map());
    return () => {
      activeRef.current = false;
    };
  }, [pdfDocument, rotation]);

  useEffect(() => {
    if (!pdfDocument) return;
    let active = true;
    void pdfDocument
      .getPage(1)
      .then((page) => {
        if (!active) return;
        const viewport = page.getViewport({
          scale: 1,
          rotation: (page.rotate + rotation) % 360,
        });
        if (viewport.width > 0 && viewport.height > 0) {
          setAspectRatio(viewport.width / viewport.height);
        }
      })
      .catch(() => {
        // Aspect ratio is cosmetic; the default keeps the placeholder sized.
      });
    return () => {
      active = false;
    };
  }, [pdfDocument, rotation]);

  const requestThumbnail = useCallback(
    (pageNumber: number) => {
      if (!pdfDocument) return;
      if (requestedRef.current.has(pageNumber)) return;
      requestedRef.current.add(pageNumber);

      void renderThumbnail(pdfDocument, pageNumber, rotation)
        .then((dataUrl) => {
          if (!activeRef.current || !dataUrl) return;
          setThumbnails((current) => {
            const next = new Map(current);
            next.set(pageNumber, dataUrl);
            while (next.size > THUMBNAIL_CACHE_LIMIT) {
              const oldest = next.keys().next();
              if (oldest.done) break;
              next.delete(oldest.value);
              requestedRef.current.delete(oldest.value);
            }
            return next;
          });
        })
        .catch(() => {
          // A destroyed document or cancelled render simply leaves the
          // placeholder in place; allow a retry on the next intersection.
          requestedRef.current.delete(pageNumber);
        });
    },
    [pdfDocument, rotation],
  );

  const registerItem = useCallback((element: HTMLButtonElement | null) => {
    if (!element) return;
    observerRef.current?.observe(element);
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const pageNumber = Number(
            (entry.target as HTMLElement).dataset.dkThumbnail,
          );
          if (Number.isFinite(pageNumber) && pageNumber > 0) {
            requestThumbnail(pageNumber);
          }
        }
      },
      { rootMargin: "300px 0px" },
    );
    observerRef.current = observer;
    for (const element of list.querySelectorAll<HTMLElement>(
      "[data-dk-thumbnail]",
    )) {
      observer.observe(element);
    }
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [requestThumbnail]);

  if (pageCount === 0) {
    return (
      <p className="px-1 py-2 text-xs text-muted-foreground">
        There is no page
      </p>
    );
  }

  return (
    <ul ref={listRef} className="flex flex-col items-center gap-3">
      {pageNumbers.map((pageNumber) => {
        const dataUrl = thumbnails.get(pageNumber);
        const isCurrent = pageNumber === currentPage;
        return (
          <li key={pageNumber} className="flex flex-col items-center gap-1">
            <button
              type="button"
              ref={registerItem}
              data-dk-thumbnail={pageNumber}
              aria-label={`Page ${pageNumber}`}
              aria-current={isCurrent ? "page" : undefined}
              onClick={() => onSelectPage(pageNumber)}
              className={cn(
                "block overflow-hidden rounded-sm bg-background transition-colors",
                "[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,var(--border)_80%,transparent)]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                isCurrent &&
                  "bg-[color-mix(in_srgb,var(--primary)_18%,transparent)]",
              )}
              style={{ width: THUMBNAIL_WIDTH }}
            >
              {dataUrl ? (
                <img
                  src={dataUrl}
                  alt=""
                  aria-hidden
                  className="block h-auto w-full"
                />
              ) : (
                <span
                  className="block w-full animate-pulse bg-muted/60"
                  style={{ aspectRatio: `${aspectRatio}` }}
                />
              )}
            </button>
            <span className="text-[11px] text-muted-foreground">
              {pageNumber}
            </span>
          </li>
        );
      })}
    </ul>
  );
};
