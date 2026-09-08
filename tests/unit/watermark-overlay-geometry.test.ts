import assert from "node:assert/strict";
import test from "node:test";
import type { WatermarkOverlayModel } from "@/lib/watermark";
import { calculateWatermarkPageLayout } from "@/components/documents/watermarkOverlay";

const createModel = (
  overrides: Partial<WatermarkOverlayModel["layout"]> = {},
): WatermarkOverlayModel => ({
  lines: [{ text: "CONFIDENTIAL", kind: "primary" }],
  style: {
    color: "#4B5563",
    fontSizeRem: 1.5,
    opacity: 0.65,
  },
  layout: {
    pattern: "diagonal_grid",
    rotationDeg: -40,
    xSpacingPt: 36,
    ySpacingPt: 36,
    mode: "text",
    ...overrides,
  },
});

test("single pattern centres exactly one stamp", () => {
  const layout = calculateWatermarkPageLayout({
    model: createModel({ pattern: "single" }),
    width: 100,
    height: 80,
    scale: 1,
  });

  assert.deepEqual(layout.stamps, [{ x: 50, y: 40 }]);
});

test("diagonal grid positions scale with the PDF zoom", () => {
  const scaleOne = calculateWatermarkPageLayout({
    model: createModel(),
    width: 48,
    height: 48,
    scale: 1,
  });
  const scaleTwo = calculateWatermarkPageLayout({
    model: createModel(),
    width: 48,
    height: 48,
    scale: 2,
  });

  assert.equal(scaleOne.stamps.length, 16);
  assert.deepEqual(scaleOne.stamps[0], { x: -48, y: -48 });
  assert.deepEqual(scaleOne.stamps.at(-1), { x: 96, y: 96 });
  assert.equal(scaleTwo.stamps.length, 4);
  assert.deepEqual(scaleTwo.stamps[0], { x: -48, y: -48 });
  assert.deepEqual(scaleTwo.stamps.at(-1), { x: 48, y: 48 });
});

test("grid spacing has a 24 CSS pixel safety floor", () => {
  const layout = calculateWatermarkPageLayout({
    model: createModel({ xSpacingPt: 0, ySpacingPt: 0 }),
    width: 48,
    height: 48,
    scale: 1,
  });

  assert.equal(layout.safeXSpacingPx, 24);
  assert.equal(layout.safeYSpacingPx, 24);
  assert.equal(layout.stamps.length, 49);
  assert.deepEqual(layout.stamps[1], { x: -48, y: -24 });
  assert.deepEqual(layout.stamps.at(-1), { x: 96, y: 96 });
});

test("grid generation stops at 500 stamps", () => {
  const layout = calculateWatermarkPageLayout({
    model: createModel({ xSpacingPt: 0, ySpacingPt: 0 }),
    width: 400,
    height: 400,
    scale: 1,
  });

  assert.equal(layout.stamps.length, 500);
});

test("points use the deliberate 96/72 CSS pixel conversion at every zoom", () => {
  // PDF points are 1/72 inch while CSS pixels are 1/96 inch. Pinning this
  // keeps the browser preview aligned with pdf-lib/DocYantra downloads.
  const scaleOne = calculateWatermarkPageLayout({
    model: createModel(),
    width: 100,
    height: 80,
    scale: 1,
  });
  const scaleTwo = calculateWatermarkPageLayout({
    model: createModel(),
    width: 100,
    height: 80,
    scale: 2,
  });

  assert.equal(scaleOne.pxPerPt, 96 / 72);
  assert.equal(scaleOne.fontSizePt, 18);
  assert.equal(scaleOne.fontSizePx, 24);
  assert.equal(scaleTwo.pxPerPt, 2 * (96 / 72));
  assert.equal(scaleTwo.fontSizePx, 48);
});
