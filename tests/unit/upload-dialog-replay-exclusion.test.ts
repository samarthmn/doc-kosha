import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../src/components/documents/UploadModal.tsx", import.meta.url),
  "utf8",
);

test("both upload dialogs are excluded from PostHog replay", () => {
  const dialogContentTags = source.match(/<DialogContent\b[\s\S]*?>/g) ?? [];

  assert.equal(dialogContentTags.length, 2);
  dialogContentTags.forEach((tag) => {
    assert.match(tag, /className="[^"]*\bph-no-capture\b[^"]*"/);
    assert.match(tag, /\bdata-ph-no-capture(?:\s|=|>)/);
    assert.doesNotMatch(
      tag,
      /className="[^"]*\brelative\b[^"]*"/,
      "upload dialogs must not override DialogContent's fixed centering",
    );
  });
});
