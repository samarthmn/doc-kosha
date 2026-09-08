"use client";

/**
 * Browser build of the pdf-core WASM engine (Zone 1: watermark, merge,
 * csv/md/text → PDF). Loaded lazily on first use from the browser assets
 * prepared by the configured document-processing provider.
 *
 * Every entry point resolves to `null` on ANY failure (unsupported browser,
 * missing asset, engine error) — callers keep their existing non-wasm
 * behavior as the fallback. Client-side output is for PREVIEW only; the
 * authoritative watermarked/converted bytes are always produced server-side.
 */

import { reportPreviewFallback } from "@/lib/engineTelemetry";

type PdfCoreWasmWebModule = {
  default(input?: string | URL | Request): Promise<unknown>;
  apply_watermark(
    pdf: Uint8Array,
    watermarkJson: string,
    watermarkImage?: Uint8Array | null,
  ): Uint8Array;
  merge_pdfs(
    pdfs: Uint8Array[],
    watermarkJson?: string | null,
    watermarkImage?: Uint8Array | null,
  ): Uint8Array;
  page_count(pdf: Uint8Array): number;
};

let modulePromise: Promise<PdfCoreWasmWebModule | null> | null = null;
const BROWSER_GLUE_URL = "/wasm/pdf_core_wasm.js";

const loadModule = async (): Promise<PdfCoreWasmWebModule | null> => {
  if (typeof window === "undefined") return null;
  try {
    const mod = (await import(
      /* webpackIgnore: true */ BROWSER_GLUE_URL
    )) as unknown as PdfCoreWasmWebModule;
    await mod.default("/wasm/pdf_core_wasm_bg.wasm");
    return mod;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      "[pdf-core-wasm/web] browser engine unavailable, using fallback rendering:",
      reason,
    );
    reportPreviewFallback(reason);
    return null;
  }
};

const getEngine = async (): Promise<PdfCoreWasmWebModule | null> => {
  modulePromise ??= loadModule();
  const engine = await modulePromise;
  if (!engine) modulePromise = null; // allow retry after transient failures
  return engine;
};

/**
 * Applies a shared-payload watermark to `pdf` in the browser, returning
 * the watermarked bytes — the same Rust code the server download path runs,
 * so the preview is exactly what the recipient gets. Returns null on any
 * failure so callers fall back to the CSS overlay preview.
 */
export const applyWatermarkInBrowser = async (
  pdf: Uint8Array,
  watermarkPayloadJson: string,
  watermarkImage?: Uint8Array | null,
): Promise<Uint8Array | null> => {
  const engine = await getEngine();
  if (!engine) return null;
  try {
    return engine.apply_watermark(
      pdf,
      watermarkPayloadJson,
      watermarkImage ?? undefined,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      "[pdf-core-wasm/web] watermark preview failed, using overlay fallback:",
      reason,
    );
    reportPreviewFallback(reason);
    return null;
  }
};
