"use client";

import React, { useMemo } from "react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { WatermarkOverlayModel } from "@/lib/watermark";
import { WatermarkPageOverlay } from "@/components/documents/watermarkOverlay";
import {
  Document,
  Page,
  PDF_DOCUMENT_OPTIONS,
} from "@/components/documents/pdf/engine/pdfjsRuntime";
import type {
  WatermarkDefinition,
  WatermarkDynamicValues,
} from "@/lib/branding";
import {
  buildWatermarkPayload,
  watermarkPayloadLinesAreWinAnsi,
} from "@/lib/watermarkPayload";
import { applyWatermarkInBrowser } from "@/lib/pdfCoreWasmClient";

interface WatermarkTemplatePreviewPdfProps {
  pdfUrl: string;
  watermarkOverlay: WatermarkOverlayModel | null;
  /** When provided, the preview watermarks the PDF bytes in the browser with
   * the real engine (exactly what the download produces). Falls back to the
   * CSS overlay when absent or when the engine is unavailable. */
  definition?: WatermarkDefinition | null;
  dynamicValues?: WatermarkDynamicValues;
  /** Image for image/hybrid watermarks (data: or same-origin URL). */
  imageUrl?: string | null;
}

const PREVIEW_DEBOUNCE_MS = 350;

/** Module-level cache: the sample PDF's bytes never change per session. */
const samplePdfCache = new Map<string, Promise<Uint8Array>>();

const fetchBytes = async (url: string): Promise<Uint8Array> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

const getSamplePdf = (url: string): Promise<Uint8Array> => {
  let cached = samplePdfCache.get(url);
  if (!cached) {
    cached = fetchBytes(url);
    samplePdfCache.set(url, cached);
    cached.catch(() => samplePdfCache.delete(url));
  }
  return cached;
};

/**
 * A lightweight PDF viewer component for watermark template previews.
 *
 * Preferred path: watermark the sample PDF in the browser via the pdf-core
 * WASM engine — the same Rust code the server runs on downloads, so the
 * preview is byte-accurate. Fallback: the CSS overlay plugin approximation
 * (previous behavior) whenever the engine or inputs are unavailable.
 */
const WatermarkTemplatePreviewPdf: React.FC<
  WatermarkTemplatePreviewPdfProps
> = ({ pdfUrl, watermarkOverlay, definition, dynamicValues, imageUrl }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = React.useState({
    width: 0,
    height: 0,
  });
  const [pageAspectRatio, setPageAspectRatio] = React.useState<number | null>(
    null,
  );
  const [engineFileUrl, setEngineFileUrl] = React.useState<string | null>(null);
  // Drives the crossfade below: true while a setting change's watermarked
  // preview is (debouncing or) regenerating, so the swap to the new render
  // never pops in — it settles back to full opacity once ready.
  const [isRegenerating, setIsRegenerating] = React.useState(false);
  const [hasRenderedOnce, setHasRenderedOnce] = React.useState(false);

  React.useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      const next = element.getBoundingClientRect();
      setContainerSize((current) => {
        if (current.width === next.width && current.height === next.height) {
          return current;
        }
        return { width: next.width, height: next.height };
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Serialize the payload once per definition change; doubles as the
  // debounce/effect dependency key.
  const payloadJson = useMemo(() => {
    if (!definition) return null;
    const payload = buildWatermarkPayload(definition, dynamicValues);
    // The browser has no registered fonts, so use the CSS overlay for Unicode
    // text that its engine would render as "?" glyphs.
    if (!watermarkPayloadLinesAreWinAnsi(payload)) return null;
    return JSON.stringify(payload);
  }, [definition, dynamicValues]);

  React.useEffect(() => {
    if (!payloadJson) {
      setEngineFileUrl(null);
      setIsRegenerating(false);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setIsRegenerating(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const [pdfBytes, imageBytes] = await Promise.all([
            getSamplePdf(pdfUrl),
            imageUrl ? fetchBytes(imageUrl) : Promise.resolve(null),
          ]);
          const stamped = await applyWatermarkInBrowser(
            pdfBytes,
            payloadJson,
            imageBytes,
          );
          if (cancelled) return;
          if (!stamped) {
            setEngineFileUrl(null); // overlay fallback
            setIsRegenerating(false);
            return;
          }
          objectUrl = URL.createObjectURL(
            new Blob([stamped.slice().buffer as ArrayBuffer], {
              type: "application/pdf",
            }),
          );
          setEngineFileUrl(objectUrl);
          setIsRegenerating(false);
        } catch {
          if (!cancelled) {
            setEngineFileUrl(null);
            setIsRegenerating(false);
          }
        }
      })();
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [payloadJson, pdfUrl, imageUrl]);

  const usingEngine = engineFileUrl !== null;
  const pageWidth = useMemo(() => {
    if (containerSize.width <= 0 || containerSize.height <= 0) return null;
    if (!pageAspectRatio) return containerSize.width;
    return Math.min(
      containerSize.width,
      containerSize.height * pageAspectRatio,
    );
  }, [containerSize, pageAspectRatio]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-full w-full items-center justify-center overflow-hidden transition-opacity duration-150 ease-out motion-reduce:transition-none",
        isRegenerating ? "opacity-70" : "opacity-100",
      )}
      data-preview-engine={usingEngine ? "wasm" : "overlay"}
    >
      <Document
        className="flex h-full w-full items-center justify-center overflow-hidden"
        file={engineFileUrl ?? pdfUrl}
        options={PDF_DOCUMENT_OPTIONS}
        onLoadSuccess={() => setHasRenderedOnce(true)}
        loading={
          // The skeleton belongs to the first load only. Every later load is a
          // re-stamp of the same sample page after a setting change, and
          // swapping a rendered page for a skeleton and back would flash on
          // each edit — the opacity dip above already signals "recomputing".
          hasRenderedOnce ? (
            <div className="h-full w-full" />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-6">
              <Skeleton className="h-full min-h-[400px] w-full rounded-lg" />
            </div>
          )
        }
      >
        {pageWidth ? (
          <Page
            pageNumber={1}
            width={pageWidth}
            loading={<div className="h-full w-full" />}
            onLoadSuccess={(page) => {
              const nextAspectRatio = page.originalWidth / page.originalHeight;
              if (Number.isFinite(nextAspectRatio) && nextAspectRatio > 0) {
                setPageAspectRatio(nextAspectRatio);
              }
            }}
          >
            {({ page, scale }) => {
              if (usingEngine || !watermarkOverlay) return null;
              const viewport = page.getViewport({ scale });
              return (
                <WatermarkPageOverlay
                  model={watermarkOverlay}
                  width={viewport.width}
                  height={viewport.height}
                  scale={scale}
                />
              );
            }}
          </Page>
        ) : null}
      </Document>
    </div>
  );
};

export default WatermarkTemplatePreviewPdf;
