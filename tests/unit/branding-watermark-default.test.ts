import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveRequiredWatermarkDefinition,
  resolveWatermarkDefinition,
} from "@/lib/branding";

test("required links without branding retain a safe default watermark", () => {
  assert.equal(resolveWatermarkDefinition(null), null);
  assert.deepEqual(resolveRequiredWatermarkDefinition(null), {
    text: "CONFIDENTIAL",
    color: "#4B5563",
    fontSize: 1.2,
    opacity: 0.65,
  });
});
