import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = async (path: string): Promise<string> =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const extractCssBlock = (source: string, selector: string): string => {
  const selectorStart = source.indexOf(selector);
  assert.notEqual(selectorStart, -1, `missing ${selector}`);

  const blockStart = source.indexOf("{", selectorStart);
  assert.notEqual(blockStart, -1, `missing block for ${selector}`);

  let depth = 0;
  for (let index = blockStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character !== "}") continue;
    depth -= 1;
    if (depth === 0) {
      return source.slice(blockStart + 1, index);
    }
  }

  assert.fail(`unterminated block for ${selector}`);
};

test("PDF thumbnail buttons retain a visible keyboard focus ring", async () => {
  const thumbnails = await readSource(
    "src/components/documents/pdf/panels/PdfThumbnailsPanel.tsx",
  );

  assert.match(thumbnails, /data-dk-thumbnail=\{pageNumber\}/);
  assert.match(thumbnails, /focus-visible:outline-2/);
  assert.match(thumbnails, /focus-visible:outline-offset-2/);
  assert.match(thumbnails, /focus-visible:outline-ring/);
  assert.match(thumbnails, /focus-visible:outline-solid/);
  assert.doesNotMatch(thumbnails, /focus-visible:outline-(?:0|none)/);
});

test("reduced motion freezes the PDF skeleton and video loading spinner", async () => {
  const css = await readSource("src/app/globals.css");
  const viewer = await readSource("src/components/documents/Viewer.tsx");
  const skeleton = await readSource("src/components/ui/skeleton.tsx");
  const reducedMotion = extractCssBlock(
    css,
    "@media (prefers-reduced-motion: reduce)",
  );

  assert.match(viewer, /const loader = \(\) => \(/);
  assert.match(viewer, /<Skeleton className=/);
  assert.match(skeleton, /animate-pulse/);
  for (const selector of [
    ".animate-pulse",
    ".dk-video-player .vjs-loading-spinner",
    ".dk-video-player .vjs-loading-spinner::before",
    ".dk-video-player .vjs-loading-spinner::after",
  ]) {
    assert.match(reducedMotion, new RegExp(selector.replaceAll(".", "\\.")));
  }
  assert.match(reducedMotion, /animation:\s*none\s*!important/);
  assert.match(
    extractCssBlock(reducedMotion, ".dk-video-player .vjs-loading-spinner"),
    /visibility:\s*visible\s*!important/,
    "the frozen Video.js spinner must remain visible as a buffering state cue",
  );
});

test("the PDF engine disables smooth scrolling for reduced-motion users", async () => {
  const viewer = await readSource("src/components/documents/Viewer.tsx");

  assert.match(
    viewer,
    /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)/,
  );
  assert.match(
    viewer,
    /const \[reduceMotion, setReduceMotion\] = useState\(false\)/,
  );
  assert.equal(
    viewer.match(/smoothScroll=\{!reduceMotion\}/g)?.length,
    2,
    "the minimal and full Mozilla PDF viewers must share the preference",
  );
  assert.doesNotMatch(
    viewer,
    /\n\s*smoothScroll\s*\n/,
    "smooth scrolling must not be enabled unconditionally",
  );
});
