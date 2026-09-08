import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL(
    "../../src/components/documents/internal/InternalDocumentViewerShell.tsx",
    import.meta.url,
  ),
  "utf8",
);

const publicViewerSource = readFileSync(
  new URL(
    "../../src/components/pages/PublicDocumentViewerClient.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("internal viewer header inherits the page background", () => {
  assert.match(source, /data-testid="internal-document-viewer-header"/);
  const header = source.match(
    /<div(?=[^>]*data-testid="internal-document-viewer-header")[^>]*>/,
  )?.[0];
  assert.ok(header);
  assert.doesNotMatch(header, /bg-background|backdrop-blur|sticky|top-0/);
});

test("internal viewer renders child panels at mobile widths while retaining desktop split constraints", () => {
  assert.match(
    source,
    /className="dk-nocturne-surface flex min-h-0 flex-col overflow-hidden rounded-lg lg:h-full"/,
  );
  assert.match(
    source,
    /className="min-w-0 overflow-x-hidden lg:min-h-0 lg:flex-1 lg:overflow-y-auto"[\s\S]*?\{children\}/,
  );
  assert.match(source, /lg:sticky lg:top-6 lg:h-\[calc\(100dvh-8rem\)\]/);
  assert.doesNotMatch(source, /className="dk-nocturne-surface hidden[^"]*"/);
});

test("internal viewer reserves a bounded mobile canvas height", () => {
  const mobileCanvasClasses =
    source.match(/"([^"]*h-\[68dvh\][^"]*)"/)?.[1].split(/\s+/) ?? [];
  const desktopCanvasClasses =
    source
      .match(/"([^"]*lg:h-\[calc\(100dvh-8rem\)\][^"]*)"/)?.[1]
      .split(/\s+/) ?? [];

  for (const token of [
    "h-[68dvh]",
    "min-h-[28rem]",
    "max-h-[44rem]",
    "flex-col",
  ]) {
    assert.ok(mobileCanvasClasses.includes(token), `missing ${token}`);
  }
  for (const token of [
    "lg:h-[calc(100dvh-8rem)]",
    "lg:min-h-0",
    "lg:max-h-none",
  ]) {
    assert.ok(desktopCanvasClasses.includes(token), `missing ${token}`);
  }
  assert.match(source, /hideViewerOnMobile \? "hidden lg:flex" : "flex"/);
  assert.match(source, /"dk-document-viewer h-full min-h-0 w-full flex-1"/);
});

test("internal video releases the mobile fixed-height and flex constraints", () => {
  const videoCanvasClasses =
    source.match(/usesContentHeightCanvas &&\s*"([^"]*)"/)?.[1].split(/\s+/) ??
    [];

  for (const token of [
    "h-auto",
    "min-h-0",
    "max-h-[none]",
    "flex-none",
    "lg:h-auto",
    "lg:flex-1",
  ]) {
    assert.ok(
      videoCanvasClasses.includes(token),
      `video shell is missing ${token}`,
    );
  }
  assert.match(
    source,
    /usesContentHeightCanvas\s*\?\s*"dk-document-viewer h-auto min-h-0 w-full flex-none"\s*:\s*"dk-document-viewer h-full min-h-0 w-full flex-1"/,
    "the nested media viewer must not reintroduce a full-height flex constraint for video",
  );
});

test("public video releases the viewport lock so portrait playback can scroll", () => {
  assert.match(publicViewerSource, /isVideoExtension/);
  assert.match(
    publicViewerSource,
    /usesContentHeightCanvas\s*\?\s*"h-auto overflow-y-auto"\s*:\s*"h-dvh overflow-hidden"/,
    "the public route must release its viewport lock for video",
  );
  assert.match(
    publicViewerSource,
    /usesContentHeightCanvas\s*\?\s*"h-auto min-h-0 w-full"\s*:\s*"h-full min-h-0 w-full"/,
    "the public Viewer must receive content-height sizing for video",
  );
});
