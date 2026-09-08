/**
 * Copies the worker and support assets shared by React-PDF and Mozilla's
 * PDFViewer. Both consumers resolve the root PDF.js package, so one asset tree
 * guarantees that the browser API, worker, CMaps, fonts, WASM, and viewer CSS
 * all come from the same release.
 */
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import console from "node:console";

const require = createRequire(import.meta.url);
const pdfjsPackagePath = require.resolve("pdfjs-dist/package.json");
const pdfjsPackageDir = dirname(pdfjsPackagePath);
const targetDir = join(process.cwd(), "public", "pdfjs");

const copyAssets = (sourceDir, destinationDir, assets) => {
  mkdirSync(destinationDir, { recursive: true });
  for (const [sourcePath, targetPath] of assets) {
    cpSync(join(sourceDir, sourcePath), join(destinationDir, targetPath), {
      recursive: true,
    });
  }
};

rmSync(targetDir, { force: true, recursive: true });

copyAssets(pdfjsPackageDir, targetDir, [
  ["build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],
  ["cmaps", "cmaps"],
  ["standard_fonts", "standard_fonts"],
  ["wasm", "wasm"],
  ["web/pdf_viewer.css", "pdf_viewer.css"],
  ["web/images", "images"],
]);

const pdfjsVersion = require(pdfjsPackagePath).version;
console.log(
  `[sync-pdfjs-assets] copied shared PDF.js ${pdfjsVersion} assets to public/pdfjs/`,
);
