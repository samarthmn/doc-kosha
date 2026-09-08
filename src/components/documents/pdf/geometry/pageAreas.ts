import type { CSSProperties } from "react";

export type PageArea = {
  pageIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

type RectLike = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type PageBox = {
  pageIndex: number;
  rect: RectLike;
};

type RectsToAreasArgs = {
  clientRects: readonly RectLike[];
  pageBoxes: readonly PageBox[];
};

export type PageOverlayContext = {
  pageIndex: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
};

type PageOverlayHostStyles = {
  bottom: string;
  height: string;
  left: string;
  right: string;
  top: string;
  width: string;
};

type PageOverlayContextArgs = {
  pageIndex: number;
  scale: number;
  viewport: {
    width: number;
    height: number;
    rotation: number;
  };
};

export const clampPercent = (value: number): number =>
  Math.min(100, Math.max(0, Number(value.toFixed(4))));

export const normalizeRotation = (rotation: number): number => {
  const normalized = rotation % 360;
  return normalized >= 0 ? normalized : 360 + normalized;
};

export const createPageOverlayContext = ({
  pageIndex,
  scale,
  viewport,
}: PageOverlayContextArgs): PageOverlayContext => ({
  pageIndex,
  width: viewport.width,
  height: viewport.height,
  scale,
  rotation: normalizeRotation(viewport.rotation),
});

export const getPageOverlayHostStyles = ({
  width,
  height,
}: Pick<PageOverlayContext, "width" | "height">): PageOverlayHostStyles => ({
  bottom: "auto",
  height: `${height}px`,
  left: "0px",
  right: "auto",
  top: "0px",
  width: `${width}px`,
});

export const getAreaCssProperties = (
  area: PageArea,
  rotation: number,
): CSSProperties => {
  const normalized = normalizeRotation(rotation);
  switch (normalized) {
    case 90:
      return {
        height: `${area.width}%`,
        position: "absolute",
        right: `${area.top}%`,
        top: `${area.left}%`,
        width: `${area.height}%`,
      };
    case 180:
      return {
        bottom: `${area.top}%`,
        height: `${area.height}%`,
        position: "absolute",
        right: `${area.left}%`,
        width: `${area.width}%`,
      };
    case 270:
      return {
        bottom: `${area.left}%`,
        height: `${area.width}%`,
        left: `${area.top}%`,
        position: "absolute",
        width: `${area.height}%`,
      };
    default:
      return {
        height: `${area.height}%`,
        position: "absolute",
        top: `${area.top}%`,
        left: `${area.left}%`,
        width: `${area.width}%`,
      };
  }
};

export const transformArea = (
  screenArea: PageArea,
  rotation: number,
): PageArea => {
  const normalized = normalizeRotation(rotation);
  switch (normalized) {
    case 90:
      return {
        height: screenArea.width,
        left: screenArea.top,
        pageIndex: screenArea.pageIndex,
        top: 100 - screenArea.width - screenArea.left,
        width: screenArea.height,
      };
    case 180:
      return {
        height: screenArea.height,
        left: 100 - screenArea.width - screenArea.left,
        pageIndex: screenArea.pageIndex,
        top: 100 - screenArea.height - screenArea.top,
        width: screenArea.width,
      };
    case 270:
      return {
        height: screenArea.width,
        left: 100 - screenArea.height - screenArea.top,
        pageIndex: screenArea.pageIndex,
        top: screenArea.left,
        width: screenArea.height,
      };
    default:
      return screenArea;
  }
};

export const transformCapturedAreas = (
  screenAreas: readonly PageArea[],
  pageRotations: ReadonlyMap<number, number>,
): PageArea[] =>
  screenAreas.map((screenArea) =>
    transformArea(screenArea, pageRotations.get(screenArea.pageIndex) ?? 0),
  );

export const areaToScreenArea = (area: PageArea, rotation: number): PageArea =>
  transformArea(area, 360 - normalizeRotation(rotation));

export const rectsToAreas = ({
  clientRects,
  pageBoxes,
}: RectsToAreasArgs): PageArea[] => {
  const areas: PageArea[] = [];

  for (const rect of clientRects) {
    if (rect.width <= 0.5 || rect.height <= 0.5) continue;

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const page = pageBoxes.find(
      (entry) =>
        cx >= entry.rect.left &&
        cx <= entry.rect.right &&
        cy >= entry.rect.top &&
        cy <= entry.rect.bottom,
    );
    if (!page) continue;

    const pageRect = page.rect;
    const left = ((rect.left - pageRect.left) * 100) / pageRect.width;
    const top = ((rect.top - pageRect.top) * 100) / pageRect.height;
    const width = (rect.width * 100) / pageRect.width;
    const height = (rect.height * 100) / pageRect.height;
    if (!Number.isFinite(left) || !Number.isFinite(top)) continue;
    if (!Number.isFinite(width) || !Number.isFinite(height)) continue;
    if (width <= 0 || height <= 0) continue;

    areas.push({
      pageIndex: page.pageIndex,
      left: clampPercent(left),
      top: clampPercent(top),
      width: clampPercent(width),
      height: clampPercent(height),
    });
  }

  const seen = new Set<string>();
  return areas
    .map((area) => ({
      ...area,
      left: clampPercent(area.left),
      top: clampPercent(area.top),
      width: clampPercent(area.width),
      height: clampPercent(area.height),
    }))
    .filter((area) => {
      const key = `${area.pageIndex}:${area.left}:${area.top}:${area.width}:${area.height}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 250);
};
