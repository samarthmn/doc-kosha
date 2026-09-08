import { normalizeRotation } from "@/components/documents/pdf/geometry/pageAreas";

export type PdfEngineError = {
  name: string;
  message: string;
  status?: number;
};

export type PdfEngineState =
  | {
      requestId: number;
      status: "loading";
    }
  | {
      requestId: number;
      status: "password";
      incorrect: boolean;
    }
  | {
      requestId: number;
      status: "ready";
    }
  | {
      requestId: number;
      status: "error";
      error: PdfEngineError;
    };

type PdfEngineAction =
  | {
      type: "load";
      requestId: number;
    }
  | {
      type: "password";
      requestId: number;
      incorrect: boolean;
    }
  | {
      type: "ready";
      requestId: number;
    }
  | {
      type: "error";
      requestId: number;
      error: PdfEngineError;
    };

export type PdfFindStatus = "found" | "not-found" | "wrapped" | "pending";

export type PdfFindMatches = {
  current: number;
  total: number;
};

export type PdfFindResult = {
  status: PdfFindStatus;
  matches: PdfFindMatches;
};

export type PdfFindRequest = {
  query: string;
  caseSensitive: boolean;
  entireWord: boolean;
  /** Search backwards from the active match. */
  findPrevious: boolean;
  /** True to advance through the existing result set instead of re-matching. */
  again: boolean;
};

/**
 * PDFFindController listens on the EventBus rather than exposing methods, so a
 * find is a dispatched payload. `highlightAll` mirrors the retired search
 * plugin, which highlighted every match and tinted only the active one.
 */
export const toPdfFindEventPayload = (
  request: PdfFindRequest,
): Record<string, unknown> => ({
  source: null,
  type: request.again ? "again" : "",
  query: request.query,
  caseSensitive: request.caseSensitive,
  entireWord: request.entireWord,
  highlightAll: true,
  findPrevious: request.findPrevious,
  matchDiacritics: false,
});

export const normalizePdfFindMatches = (value: unknown): PdfFindMatches => {
  if (typeof value !== "object" || value === null) {
    return { current: 0, total: 0 };
  }
  const current =
    "current" in value && typeof value.current === "number" ? value.current : 0;
  const total =
    "total" in value && typeof value.total === "number" ? value.total : 0;
  return {
    current: Number.isFinite(current) ? Math.max(0, current) : 0,
    total: Number.isFinite(total) ? Math.max(0, total) : 0,
  };
};

type PdfFindStateCodes = {
  FOUND: number;
  NOT_FOUND: number;
  WRAPPED: number;
  PENDING: number;
};

export const toPdfFindStatus = (
  state: unknown,
  codes: PdfFindStateCodes,
): PdfFindStatus => {
  switch (state) {
    case codes.NOT_FOUND:
      return "not-found";
    case codes.WRAPPED:
      return "wrapped";
    case codes.PENDING:
      return "pending";
    default:
      return "found";
  }
};

export type PdfZoomMode = "fit-width" | "fit-page" | "actual-size";
export type PdfZoomValue = PdfZoomMode | number;
export type PdfViewerScaleValue =
  "page-width" | "page-fit" | "page-actual" | number;

export type PdfViewerCommandTarget = {
  pagesCount: number;
  currentPageNumber: number;
  currentScaleValue: string;
  pagesRotation: number;
  scrollPageIntoView: (args: { pageNumber: number }) => void;
  setScaleValue: (value: PdfViewerScaleValue) => void;
  setRotation: (rotation: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

export type PdfViewerCommands = {
  goToPage: (pageIndex: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  setZoom: (value: PdfZoomValue) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setRotation: (rotation: number) => void;
  rotateClockwise: () => void;
  rotateCounterclockwise: () => void;
};

export const reducePdfEngineState = (
  state: PdfEngineState,
  action: PdfEngineAction,
): PdfEngineState => {
  if (action.type === "load") {
    return { requestId: action.requestId, status: "loading" };
  }
  if (action.requestId !== state.requestId) return state;

  switch (action.type) {
    case "password":
      return {
        requestId: action.requestId,
        status: "password",
        incorrect: action.incorrect,
      };
    case "ready":
      return { requestId: action.requestId, status: "ready" };
    case "error":
      return {
        requestId: action.requestId,
        status: "error",
        error: action.error,
      };
  }
};

export const getPdfStateHook = (
  state: PdfEngineState,
): "loading" | "ready" | "error" => {
  if (state.status === "ready" || state.status === "error") {
    return state.status;
  }
  return "loading";
};

const readStringProperty = (
  value: object,
  property: "message" | "name",
): string | null => {
  const candidate =
    property === "message"
      ? "message" in value
        ? value.message
        : null
      : "name" in value
        ? value.name
        : null;
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
};

export const normalizePdfEngineError = (error: unknown): PdfEngineError => {
  if (typeof error !== "object" || error === null) {
    return {
      name: "UnknownError",
      message:
        typeof error === "string"
          ? error
          : "The PDF document could not be loaded.",
    };
  }

  const normalized: PdfEngineError = {
    name: readStringProperty(error, "name") ?? "UnknownError",
    message:
      readStringProperty(error, "message") ??
      "The PDF document could not be loaded.",
  };
  if ("status" in error && typeof error.status === "number") {
    normalized.status = error.status;
  }
  return normalized;
};

export const resolvePdfViewerZoomValue = (
  value: PdfZoomValue,
): PdfViewerScaleValue | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  switch (value) {
    case "fit-width":
      return "page-width";
    case "fit-page":
      return "page-fit";
    case "actual-size":
      return "page-actual";
  }
};

const scrollToPage = (
  target: PdfViewerCommandTarget,
  pageIndex: number,
): void => {
  if (target.pagesCount <= 0 || !Number.isFinite(pageIndex)) return;
  const clampedIndex = Math.min(
    target.pagesCount - 1,
    Math.max(0, Math.trunc(pageIndex)),
  );
  target.scrollPageIntoView({ pageNumber: clampedIndex + 1 });
};

export const createPdfViewerCommands = (
  getTarget: () => PdfViewerCommandTarget | null,
): PdfViewerCommands => ({
  goToPage: (pageIndex) => {
    const target = getTarget();
    if (!target) return;
    scrollToPage(target, pageIndex);
  },
  nextPage: () => {
    const target = getTarget();
    if (!target) return;
    scrollToPage(target, target.currentPageNumber);
  },
  previousPage: () => {
    const target = getTarget();
    if (!target) return;
    scrollToPage(target, target.currentPageNumber - 2);
  },
  setZoom: (value) => {
    const target = getTarget();
    const resolved = resolvePdfViewerZoomValue(value);
    if (!target || resolved === null) return;
    target.setScaleValue(resolved);
  },
  zoomIn: () => {
    getTarget()?.zoomIn();
  },
  zoomOut: () => {
    getTarget()?.zoomOut();
  },
  setRotation: (rotation) => {
    const target = getTarget();
    if (!target || !Number.isFinite(rotation)) return;
    target.setRotation(normalizeRotation(Math.round(rotation / 90) * 90));
  },
  rotateClockwise: () => {
    const target = getTarget();
    if (!target) return;
    target.setRotation(normalizeRotation(target.pagesRotation + 90));
  },
  rotateCounterclockwise: () => {
    const target = getTarget();
    if (!target) return;
    target.setRotation(normalizeRotation(target.pagesRotation - 90));
  },
});
