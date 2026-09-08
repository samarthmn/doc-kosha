import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import path from "node:path";

const projectRoot = process.cwd();

test("asset sync emits one PDF.js 5 worker and viewer asset set", async () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/sync-pdfjs-assets.mjs"],
    {
      cwd: projectRoot,
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);

  const worker = await readFile(
    path.join(projectRoot, "public/pdfjs/pdf.worker.min.mjs"),
    "utf8",
  );
  const viewerStyles = await readFile(
    path.join(projectRoot, "public/pdfjs/pdf_viewer.css"),
    "utf8",
  );

  assert.match(
    worker,
    /5\.4\.296/,
    "the worker must match the root PDF.js API",
  );
  assert.match(viewerStyles, /\.pdfViewer\b/);
  await assert.rejects(
    stat(path.join(projectRoot, "public/pdfjs/v3")),
    /ENOENT/,
    "the retired PDF.js 3 asset tree must not be emitted",
  );
});
