import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  MozillaPdfViewerHandle,
  MozillaPdfViewerProps,
  PdfDocumentSource,
  PdfTextLayerReadyEvent,
  PdfViewerOverlay,
} from "@/components/documents/pdf/engine/MozillaPdfViewer";

test("the engine renders P1 loading and scroll hooks before browser initialization", async () => {
  const { MozillaPdfViewer } =
    await import("@/components/documents/pdf/engine/MozillaPdfViewer");
  const file: PdfDocumentSource = "/dummy-pdf.pdf";
  const overlays: readonly PdfViewerOverlay[] = [
    {
      id: "contract",
      onTextLayerReady: (event: PdfTextLayerReadyEvent) => {
        assert.equal(
          event.phase === "attach" || event.phase === "detach",
          true,
        );
      },
    },
  ];
  const props: MozillaPdfViewerProps = { file, overlays };
  const imperativeMethods = [
    "goToPage",
    "nextPage",
    "previousPage",
    "setZoom",
    "zoomIn",
    "zoomOut",
    "setRotation",
    "rotateClockwise",
    "rotateCounterclockwise",
    "historyBack",
    "historyForward",
  ] satisfies ReadonlyArray<keyof MozillaPdfViewerHandle>;
  const markup = renderToStaticMarkup(
    React.createElement(MozillaPdfViewer, props),
  );

  assert.equal(imperativeMethods.length, 11);
  assert.match(markup, /data-dk-pdf-state="loading"/);
  assert.match(markup, /class="[^"]*dk-pdf-scroll[^"]*"/);
  assert.match(markup, /class="pdfViewer"/);
  assert.match(markup, /Loading document/);
});
