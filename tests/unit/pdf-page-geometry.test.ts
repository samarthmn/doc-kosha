import assert from "node:assert/strict";
import test from "node:test";
import {
  areaToScreenArea,
  clampPercent,
  getPageOverlayHostStyles,
  getAreaCssProperties,
  rectsToAreas,
  transformArea,
  transformCapturedAreas,
  type PageArea,
} from "@/components/documents/pdf/geometry/pageAreas";
import { mergeHighlightAreas } from "@/components/documents/pdf/geometry/mergeAreas";

const STORED_AREA: PageArea = {
  pageIndex: 2,
  left: 10,
  top: 20,
  width: 30,
  height: 40,
};

test("overlay hosts use the full rendered viewport instead of the border-reduced page box", () => {
  assert.deepEqual(
    getPageOverlayHostStyles({
      width: 611,
      height: 472.1363636363636,
    }),
    {
      bottom: "auto",
      height: "472.1363636363636px",
      left: "0px",
      right: "auto",
      top: "0px",
      width: "611px",
    },
  );
});

test("getAreaCssProperties preserves the persisted area mapping at every rotation", () => {
  const expected = [
    {
      rotation: 0,
      style: {
        height: "40%",
        position: "absolute",
        top: "20%",
        left: "10%",
        width: "30%",
      },
    },
    {
      rotation: 90,
      style: {
        height: "30%",
        position: "absolute",
        right: "20%",
        top: "10%",
        width: "40%",
      },
    },
    {
      rotation: 180,
      style: {
        bottom: "20%",
        height: "40%",
        position: "absolute",
        right: "10%",
        width: "30%",
      },
    },
    {
      rotation: 270,
      style: {
        bottom: "10%",
        height: "30%",
        left: "20%",
        position: "absolute",
        width: "40%",
      },
    },
  ] as const;

  for (const { rotation, style } of expected) {
    assert.deepEqual(getAreaCssProperties(STORED_AREA, rotation), style);
  }
});

test("transformArea returns screen-space selections to persisted coordinates", () => {
  const screenAreas = [
    { rotation: 0, area: STORED_AREA },
    {
      rotation: 90,
      area: { pageIndex: 2, left: 40, top: 10, width: 40, height: 30 },
    },
    {
      rotation: 180,
      area: { pageIndex: 2, left: 60, top: 40, width: 30, height: 40 },
    },
    {
      rotation: 270,
      area: { pageIndex: 2, left: 20, top: 60, width: 40, height: 30 },
    },
  ] as const;

  for (const { rotation, area } of screenAreas) {
    assert.deepEqual(transformArea(area, rotation), STORED_AREA);
  }
});

test("transformCapturedAreas maps toolbar-rotated captures to the same persisted area", () => {
  const screenAreas = [
    { rotation: 0, area: STORED_AREA },
    {
      rotation: 90,
      area: { pageIndex: 2, left: 40, top: 10, width: 40, height: 30 },
    },
    {
      rotation: 180,
      area: { pageIndex: 2, left: 60, top: 40, width: 30, height: 40 },
    },
    {
      rotation: 270,
      area: { pageIndex: 2, left: 20, top: 60, width: 40, height: 30 },
    },
  ] as const;

  for (const { rotation, area } of screenAreas) {
    assert.deepEqual(
      transformCapturedAreas([area], new Map([[area.pageIndex, rotation]])),
      [STORED_AREA],
    );
  }
});

test("areaToScreenArea is the drawing inverse at every rotation", () => {
  for (const rotation of [0, 90, 180, 270]) {
    const screenArea = areaToScreenArea(STORED_AREA, rotation);
    assert.deepEqual(transformArea(screenArea, rotation), STORED_AREA);
  }
});

test("clampPercent clamps bounds and rounds persisted percentages to four decimals", () => {
  assert.equal(clampPercent(-0.0001), 0);
  assert.equal(clampPercent(0), 0);
  assert.equal(clampPercent(12.34567), 12.3457);
  assert.equal(clampPercent(100), 100);
  assert.equal(clampPercent(100.0001), 100);
});

test("rectsToAreas assigns each client rect by its centre point", () => {
  const areas = rectsToAreas({
    clientRects: [
      {
        left: 20,
        top: 10,
        right: 60,
        bottom: 20,
        width: 40,
        height: 10,
      },
      {
        left: 100,
        top: 120,
        right: 150,
        bottom: 140,
        width: 50,
        height: 20,
      },
      {
        left: 10,
        top: 102,
        right: 20,
        bottom: 108,
        width: 10,
        height: 6,
      },
    ],
    pageBoxes: [
      {
        pageIndex: 0,
        rect: {
          left: 0,
          top: 0,
          right: 200,
          bottom: 100,
          width: 200,
          height: 100,
        },
      },
      {
        pageIndex: 1,
        rect: {
          left: 0,
          top: 110,
          right: 200,
          bottom: 210,
          width: 200,
          height: 100,
        },
      },
    ],
  });

  assert.deepEqual(areas, [
    { pageIndex: 0, left: 10, top: 10, width: 20, height: 10 },
    { pageIndex: 1, left: 50, top: 10, width: 25, height: 20 },
  ]);
});

test("rectsToAreas de-duplicates identical persisted rectangles", () => {
  const rect = {
    left: 20,
    top: 10,
    right: 60,
    bottom: 20,
    width: 40,
    height: 10,
  };
  const areas = rectsToAreas({
    clientRects: [rect, rect],
    pageBoxes: [
      {
        pageIndex: 0,
        rect: {
          left: 0,
          top: 0,
          right: 200,
          bottom: 100,
          width: 200,
          height: 100,
        },
      },
    ],
  });

  assert.deepEqual(areas, [
    { pageIndex: 0, left: 10, top: 10, width: 20, height: 10 },
  ]);
});

test("mergeHighlightAreas keeps its percent-unit line and gap thresholds", () => {
  const merged = mergeHighlightAreas([
    { pageIndex: 0, left: 22.2, top: 10, width: 8, height: 2 },
    { pageIndex: 1, left: 4, top: 3, width: 2, height: 1 },
    { pageIndex: 0, left: 10, top: 10, width: 12, height: 2 },
    { pageIndex: 0, left: 10, top: 20, width: 5, height: 2 },
  ]);

  assert.deepEqual(merged, [
    { pageIndex: 0, left: 10, top: 10, width: 20.2, height: 2 },
    { pageIndex: 0, left: 10, top: 20, width: 5, height: 2 },
    { pageIndex: 1, left: 4, top: 3, width: 2, height: 1 },
  ]);
});
