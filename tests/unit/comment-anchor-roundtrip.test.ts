import assert from "node:assert/strict";
import test from "node:test";
import {
  areaToScreenArea,
  getAreaCssProperties,
  type PageArea,
} from "@/components/documents/pdf/geometry/pageAreas";
import { mergeHighlightAreas } from "@/components/documents/pdf/geometry/mergeAreas";
import { buildTextLayerSelection } from "@/components/documents/pdf/selection/textLayerSelectionGeometry";
import {
  pageAreasToStoredCommentAnchor,
  storedCommentAnchorToPageAreas,
} from "@/modules/comments/commentAnchorGeometry";

test("comment capture and stored-anchor rendering are inverse at every page rotation", () => {
  const cases: Array<{ rotation: number; screenArea: PageArea }> = [
    {
      rotation: 0,
      screenArea: {
        pageIndex: 1,
        left: 10,
        top: 20,
        width: 30,
        height: 40,
      },
    },
    {
      rotation: 90,
      screenArea: {
        pageIndex: 1,
        left: 40,
        top: 10,
        width: 40,
        height: 30,
      },
    },
    {
      rotation: 180,
      screenArea: {
        pageIndex: 1,
        left: 60,
        top: 40,
        width: 30,
        height: 40,
      },
    },
    {
      rotation: 270,
      screenArea: {
        pageIndex: 1,
        left: 20,
        top: 60,
        width: 40,
        height: 30,
      },
    },
  ];
  const expectedAnchor = {
    rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }],
    quote: "TARGETWORD",
  };

  for (const { rotation, screenArea } of cases) {
    const selection = buildTextLayerSelection({
      screenAreas: [screenArea],
      selectedText: "TARGETWORD",
      pageRotations: new Map([[screenArea.pageIndex, rotation]]),
    });
    assert.ok(selection);

    const anchor = pageAreasToStoredCommentAnchor(
      selection.areas,
      selection.selectedText,
    );
    assert.deepEqual(anchor, expectedAnchor);

    const [storedArea] = storedCommentAnchorToPageAreas({
      anchor,
      pageNumber: screenArea.pageIndex + 1,
    });
    assert.deepEqual(areaToScreenArea(storedArea, rotation), screenArea);
  }
});

test("a persisted comment anchor round-trips and keeps its legacy CSS box", () => {
  const storedAnchor = {
    rects: [
      {
        x: 0.123456,
        y: 0.234567,
        w: 0.345678,
        h: 0.045678,
      },
    ],
    quote: "Persisted selection",
  };

  const [area] = storedCommentAnchorToPageAreas({
    anchor: storedAnchor,
    pageNumber: 3,
  });

  assert.deepEqual(area, {
    pageIndex: 2,
    left: 12.3456,
    top: 23.4567,
    width: 34.5678,
    height: 4.5678,
  });
  assert.deepEqual(getAreaCssProperties(area, 90), {
    height: "34.5678%",
    position: "absolute",
    right: "23.4567%",
    top: "12.3456%",
    width: "4.5678%",
  });
  assert.deepEqual(
    pageAreasToStoredCommentAnchor([area], storedAnchor.quote),
    storedAnchor,
  );
});

test("comment anchors preserve merge thresholds and storage caps", () => {
  const glyphAreas = [
    { pageIndex: 0, left: 10, top: 10, width: 4, height: 2 },
    { pageIndex: 0, left: 14.2, top: 10.1, width: 5.8, height: 2 },
    { pageIndex: 0, left: 10, top: 20, width: 6, height: 2 },
  ];

  assert.deepEqual(mergeHighlightAreas(glyphAreas), [
    {
      pageIndex: 0,
      left: 10,
      top: 10,
      width: 10,
      height: 2.0999999999999996,
    },
    { pageIndex: 0, left: 10, top: 20, width: 6, height: 2 },
  ]);

  const manyAreas = Array.from({ length: 140 }, (_, index) => ({
    pageIndex: index,
    left: 1,
    top: 1,
    width: 1,
    height: 1,
  }));
  const anchor = pageAreasToStoredCommentAnchor(manyAreas, "q".repeat(1_100));
  assert.equal(anchor.rects.length, 128);
  assert.equal(anchor.quote?.length, 1_000);
});
