import assert from "node:assert/strict";
import test from "node:test";
import {
  createPdfViewerCommands,
  normalizePdfEngineError,
  reducePdfEngineState,
  resolvePdfViewerZoomValue,
  type PdfViewerCommandTarget,
} from "@/components/documents/pdf/engine/pdfViewerCore";
import { createPageOverlayContext } from "@/components/documents/pdf/geometry/pageAreas";

test("a stale document result cannot replace the active document state", () => {
  const loadingA = reducePdfEngineState(
    { requestId: 0, status: "loading" },
    { type: "load", requestId: 1 },
  );
  const loadingB = reducePdfEngineState(loadingA, {
    type: "load",
    requestId: 2,
  });

  assert.deepEqual(
    reducePdfEngineState(loadingB, {
      type: "ready",
      requestId: 1,
    }),
    loadingB,
  );
  assert.deepEqual(
    reducePdfEngineState(loadingB, {
      type: "ready",
      requestId: 2,
    }),
    { requestId: 2, status: "ready" },
  );
});

test("password requests stay loading for the public P1 hook and distinguish retries", () => {
  const required = reducePdfEngineState(
    { requestId: 4, status: "loading" },
    { type: "password", requestId: 4, incorrect: false },
  );
  const incorrect = reducePdfEngineState(required, {
    type: "password",
    requestId: 4,
    incorrect: true,
  });

  assert.deepEqual(required, {
    requestId: 4,
    status: "password",
    incorrect: false,
  });
  assert.deepEqual(incorrect, {
    requestId: 4,
    status: "password",
    incorrect: true,
  });
});

test("UnexpectedResponseException status is read structurally instead of from prose", () => {
  assert.deepEqual(
    normalizePdfEngineError({
      name: "UnexpectedResponseException",
      message: "localized text with no numeric status",
      status: 403,
    }),
    {
      name: "UnexpectedResponseException",
      message: "localized text with no numeric status",
      status: 403,
    },
  );
  assert.deepEqual(normalizePdfEngineError(new Error("network failed")), {
    name: "Error",
    message: "network failed",
  });
});

test("zoom modes resolve to Mozilla PDFViewer's sticky preset values", () => {
  assert.equal(resolvePdfViewerZoomValue("fit-width"), "page-width");
  assert.equal(resolvePdfViewerZoomValue("fit-page"), "page-fit");
  assert.equal(resolvePdfViewerZoomValue("actual-size"), "page-actual");
  assert.equal(resolvePdfViewerZoomValue(1.25), 1.25);
  assert.equal(resolvePdfViewerZoomValue(0), null);
  assert.equal(resolvePdfViewerZoomValue(Number.NaN), null);
});

test("imperative commands preserve zero-based navigation and normalized rotation", () => {
  const calls: Array<
    | { kind: "page"; pageNumber: number }
    | { kind: "scale"; value: string | number }
    | { kind: "rotation"; value: number }
    | { kind: "zoom-in" }
    | { kind: "zoom-out" }
  > = [];
  const target: PdfViewerCommandTarget = {
    pagesCount: 5,
    currentPageNumber: 3,
    currentScaleValue: "page-fit",
    pagesRotation: 0,
    scrollPageIntoView: ({ pageNumber }) => {
      calls.push({ kind: "page", pageNumber });
    },
    setScaleValue: (value) => {
      calls.push({ kind: "scale", value });
    },
    setRotation: (value) => {
      calls.push({ kind: "rotation", value });
    },
    zoomIn: () => {
      calls.push({ kind: "zoom-in" });
    },
    zoomOut: () => {
      calls.push({ kind: "zoom-out" });
    },
  };
  const commands = createPdfViewerCommands(() => target);

  commands.goToPage(-20);
  commands.goToPage(20);
  commands.nextPage();
  commands.previousPage();
  commands.setZoom("fit-width");
  commands.setZoom(1.5);
  commands.setZoom(-1);
  commands.zoomIn();
  commands.zoomOut();
  commands.rotateClockwise();
  target.pagesRotation = 0;
  commands.rotateCounterclockwise();
  commands.setRotation(450);

  assert.deepEqual(calls, [
    { kind: "page", pageNumber: 1 },
    { kind: "page", pageNumber: 5 },
    { kind: "page", pageNumber: 4 },
    { kind: "page", pageNumber: 2 },
    { kind: "scale", value: "page-width" },
    { kind: "scale", value: 1.5 },
    { kind: "zoom-in" },
    { kind: "zoom-out" },
    { kind: "rotation", value: 90 },
    { kind: "rotation", value: 270 },
    { kind: "rotation", value: 90 },
  ]);
});

test("imperative commands are safe before PDFViewer is initialized", () => {
  const commands = createPdfViewerCommands(() => null);

  assert.doesNotThrow(() => {
    commands.goToPage(0);
    commands.nextPage();
    commands.previousPage();
    commands.setZoom("fit-page");
    commands.zoomIn();
    commands.zoomOut();
    commands.rotateClockwise();
    commands.rotateCounterclockwise();
    commands.setRotation(0);
  });
});

test("overlay context uses the rendered viewport geometry and normalizes rotation", () => {
  assert.deepEqual(
    createPageOverlayContext({
      pageIndex: 2,
      scale: 1.5,
      viewport: {
        width: 1188,
        height: 918,
        rotation: -90,
      },
    }),
    {
      pageIndex: 2,
      width: 1188,
      height: 918,
      scale: 1.5,
      rotation: 270,
    },
  );
});
