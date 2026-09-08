import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

const PDFJS_VERSION = "5.4.296";
const PDFJS_WORKER_SRC = "/pdfjs/pdf.worker.min.mjs";

export const PDF_DOCUMENT_OPTIONS = {
  cMapUrl: "/pdfjs/cmaps/",
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  wasmUrl: "/pdfjs/wasm/",
  isEvalSupported: false,
} as const;

type MozillaPdfjsApi = typeof import("pdfjs-dist");
type MozillaPdfViewerApi = typeof import("pdfjs-dist/web/pdf_viewer.mjs");

type MozillaPdfjsRuntime = {
  pdfjs: MozillaPdfjsApi;
  viewer: MozillaPdfViewerApi;
};

let mozillaRuntimePromise: Promise<MozillaPdfjsRuntime> | null = null;

export const loadMozillaPdfjsRuntime =
  async (): Promise<MozillaPdfjsRuntime> => {
    mozillaRuntimePromise ??= import("pdfjs-dist").then(
      async (mozillaPdfjs) => {
        if (mozillaPdfjs.version !== PDFJS_VERSION) {
          throw new Error(
            `Mozilla PDFViewer expected PDF.js ${PDFJS_VERSION}, received ${mozillaPdfjs.version}.`,
          );
        }
        mozillaPdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
        // The ESM viewer bundle still reads its matching display API from this
        // documented global during module evaluation. Publish the 5.x API
        // before importing pdf_viewer.mjs rather than loading both in parallel.
        Object.defineProperty(globalThis, "pdfjsLib", {
          configurable: true,
          value: mozillaPdfjs,
          writable: true,
        });
        const viewer = await import("pdfjs-dist/web/pdf_viewer.mjs");
        return { pdfjs: mozillaPdfjs, viewer };
      },
    );
    return mozillaRuntimePromise;
  };

// Keep the worker assignment in the same module graph as every React-PDF
// component so React-PDF cannot overwrite it through module execution order.
export { Document, Page };
