import assert from "node:assert/strict";
import test from "node:test";

import type { WatermarkDefinition } from "@/lib/branding";
import { buildWatermarkPayload } from "@/lib/watermarkPayload";

// watermarkPayload is a pure module (no env/server imports), so it can be
// imported statically — this is the ONE payload definition shared by the
// server download path and the browser wasm preview.

const baseDefinition: WatermarkDefinition = {
  text: "Internal",
  color: "#111827",
  fontSize: 1,
  opacity: 0.3,
};

test("diagonal_grid defaults rotation to -40deg; other patterns to 0", () => {
  const diagonal = buildWatermarkPayload({
    ...baseDefinition,
    pattern: "diagonal_grid",
  });
  assert.equal(diagonal.pattern, "diagonal_grid");
  assert.equal(diagonal.rotationDeg, -40);

  const grid = buildWatermarkPayload({
    ...baseDefinition,
    pattern: "grid",
  });
  assert.equal(grid.rotationDeg, 0);

  // Pattern itself defaults to "grid" when omitted.
  const defaulted = buildWatermarkPayload(baseDefinition);
  assert.equal(defaulted.pattern, "grid");
  assert.equal(defaulted.rotationDeg, 0);
});

test("an explicit rotationDeg of 0 wins over the diagonal_grid default", () => {
  const payload = buildWatermarkPayload({
    ...baseDefinition,
    pattern: "diagonal_grid",
    rotationDeg: 0,
  });
  assert.equal(payload.rotationDeg, 0);
});

test("fontSize converts rem to points (x12) and clamps to 8..64pt", () => {
  const nominal = buildWatermarkPayload({
    ...baseDefinition,
    fontSize: 1.5,
  });
  assert.equal(nominal.fontSizePt, 18);

  const tiny = buildWatermarkPayload({
    ...baseDefinition,
    fontSize: 0.25, // 3pt raw → clamped up
  });
  assert.equal(tiny.fontSizePt, 8);

  const huge = buildWatermarkPayload({
    ...baseDefinition,
    fontSize: 100, // 1200pt raw → clamped down
  });
  assert.equal(huge.fontSizePt, 64);
});

test("lines keep the fixed order text → email → ip → datetime", () => {
  const payload = buildWatermarkPayload(
    { ...baseDefinition, text: "Top Secret" },
    // Deliberately scrambled key order — output order must not follow it.
    {
      datetime: "2026-07-04T00:00:00Z",
      ip: "203.0.113.7",
      email: "viewer@example.com",
    },
  );
  assert.deepEqual(payload.lines, [
    "Top Secret",
    "viewer@example.com",
    "203.0.113.7",
    "2026-07-04T00:00:00Z",
  ]);
});

test("Date dynamic values are serialized with toISOString", () => {
  const stamped = new Date("2026-07-04T10:20:30.000Z");
  const payload = buildWatermarkPayload(baseDefinition, {
    datetime: stamped,
  });
  assert.deepEqual(payload.lines, ["Internal", "2026-07-04T10:20:30.000Z"]);
});

test("empty text and empty dynamics fall back to CONFIDENTIAL", () => {
  const payload = buildWatermarkPayload(
    { ...baseDefinition, text: "   " },
    { email: "  ", ip: null, datetime: undefined },
  );
  assert.deepEqual(payload.lines, ["CONFIDENTIAL"]);
});

test("image sizing is emitted only for image/hybrid modes", () => {
  const sized: WatermarkDefinition = {
    ...baseDefinition,
    imageWidthPt: 120,
    imageHeightPt: 80,
  };

  const textMode = buildWatermarkPayload({ ...sized, mode: "text" });
  assert.equal(textMode.contentType, "text");
  assert.equal(textMode.image, undefined);

  const defaultMode = buildWatermarkPayload(sized);
  assert.equal(defaultMode.contentType, "text");
  assert.equal(defaultMode.image, undefined);

  const imageMode = buildWatermarkPayload({ ...sized, mode: "image" });
  assert.equal(imageMode.contentType, "image");
  assert.deepEqual(imageMode.image, { widthPt: 120, heightPt: 80 });

  const hybridMode = buildWatermarkPayload({
    ...sized,
    mode: "hybrid",
  });
  assert.equal(hybridMode.contentType, "hybrid");
  assert.deepEqual(hybridMode.image, { widthPt: 120, heightPt: 80 });
});
