import assert from "node:assert/strict";
import test from "node:test";

import type { WatermarkDefinition } from "@/lib/branding";
import { materializeWatermark } from "@/lib/watermarks";
import {
  isWatermarkEligibleDocument,
  requiredWatermarkImageError,
} from "@/server/watermarkPolicy";

const definition = (
  mode: WatermarkDefinition["mode"],
): WatermarkDefinition => ({
  text: mode === "image" ? "" : "Confidential",
  color: "#111111",
  fontSize: 1,
  opacity: 0.5,
  mode,
});

test("watermarks include active and completed-only legacy document formats", () => {
  for (const fileType of [
    "pdf",
    "docx",
    "xlsx",
    "xlsm",
    "pptx",
    "csv",
    "md",
    "doc",
    "ppt",
    "xls",
  ]) {
    assert.equal(
      isWatermarkEligibleDocument({ fileType, storagePath: null }),
      true,
      fileType,
    );
  }

  for (const fileType of ["png", "jpg", "webp", "mp4", "webm", "mp3", "wav"]) {
    assert.equal(
      isWatermarkEligibleDocument({ fileType, storagePath: null }),
      false,
      fileType,
    );
  }

  assert.equal(
    isWatermarkEligibleDocument({
      fileType: "application/octet-stream",
      storagePath: "workspace/folder/REPORT.DOCX?version=1",
    }),
    true,
  );
});

test("required image and hybrid watermarks fail closed without image bytes", () => {
  assert.match(
    requiredWatermarkImageError(definition("image"), null) ?? "",
    /requires/i,
  );
  assert.match(
    requiredWatermarkImageError(definition("hybrid"), new Uint8Array()) ?? "",
    /requires/i,
  );
  assert.equal(
    requiredWatermarkImageError(definition("hybrid"), new Uint8Array([1])),
    null,
  );
  assert.equal(requiredWatermarkImageError(definition("text"), null), null);
});

test("image-bearing templates without an image path are not materialized", () => {
  for (const mode of ["image", "hybrid"] as const) {
    assert.equal(
      materializeWatermark({
        id: `missing-${mode}`,
        name: "Incomplete template",
        definition: {
          text: mode === "image" ? "" : "Confidential",
          type: mode,
        },
        image_storage_path: null,
      }),
      null,
    );
  }
});
