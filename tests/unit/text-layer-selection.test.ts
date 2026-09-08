import assert from "node:assert/strict";
import test from "node:test";
import { buildTextLayerSelection } from "@/components/documents/pdf/selection/textLayerSelectionGeometry";

test("text-layer selection converts screen rectangles with each page's full rotation", () => {
  const selection = buildTextLayerSelection({
    screenAreas: [
      {
        pageIndex: 2,
        left: 40,
        top: 10,
        width: 40,
        height: 30,
      },
      {
        pageIndex: 3,
        left: 5,
        top: 6,
        width: 7,
        height: 8,
      },
    ],
    selectedText: "TARGETWORD next",
    pageRotations: new Map([
      [2, 90],
      [3, 0],
    ]),
  });

  assert.deepEqual(selection, {
    areas: [
      {
        pageIndex: 2,
        left: 10,
        top: 20,
        width: 30,
        height: 40,
      },
      {
        pageIndex: 3,
        left: 5,
        top: 6,
        width: 7,
        height: 8,
      },
    ],
    selectedText: "TARGETWORD next",
    selectionRegion: {
      pageIndex: 3,
      left: 5,
      top: 6,
      width: 7,
      height: 8,
    },
  });
});

test("text-layer selection rejects empty text and rectangles", () => {
  assert.equal(
    buildTextLayerSelection({
      screenAreas: [],
      selectedText: "TARGETWORD",
      pageRotations: new Map(),
    }),
    null,
  );
  assert.equal(
    buildTextLayerSelection({
      screenAreas: [{ pageIndex: 0, left: 1, top: 2, width: 3, height: 4 }],
      selectedText: "   ",
      pageRotations: new Map([[0, 0]]),
    }),
    null,
  );
});
