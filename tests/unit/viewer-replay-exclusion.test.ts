import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const viewerSource = readFileSync(
  new URL("../../src/components/documents/Viewer.tsx", import.meta.url),
  "utf8",
);
const posthogConfigSource = readFileSync(
  new URL("../../src/lib/analytics/posthogConfig.ts", import.meta.url),
  "utf8",
);

test("non-PDF viewer content uses the media replay exclusion marker", () => {
  const renderer = viewerSource.match(
    /<DocumentRenderer[\s\S]*?className=\{cn\([\s\S]*?\)\}[\s\S]*?\/>/,
  )?.[0];

  assert.ok(renderer, "expected the non-PDF DocumentRenderer branch");
  assert.match(renderer, /dk-media-viewer/);
  assert.match(posthogConfigSource, /"\.dk-media-viewer"/);
  assert.match(posthogConfigSource, /"\.dk-media-viewer \*"/);
});
