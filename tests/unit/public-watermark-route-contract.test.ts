import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const routeSource = (name: string): string =>
  readFileSync(
    path.join(process.cwd(), "src/app/api/public/links", name, "route.ts"),
    "utf8",
  );

test("single-file routes gate watermark enforcement by document eligibility", () => {
  for (const route of ["download", "file", "signed-url"]) {
    const source = routeSource(route);
    assert.match(source, /isWatermarkEligibleDocument/);
    assert.match(source, /fileType: .*\.file_type/);
    assert.match(source, /storagePath: .*\.storage_path/);
  }
});

test("direct public delivery validates and repairs converted assets before signing", () => {
  for (const route of ["download", "file", "signed-url"]) {
    const source = routeSource(route);
    assert.match(source, /resolvePublicDirectAsset/);
  }

  const directAsset = readFileSync(
    path.join(process.cwd(), "src/server/publicDirectAsset.ts"),
    "utf8",
  );
  assert.match(directAsset, /processDocumentProcessingJob/);
  assert.match(directAsset, /force:\s*true/);
  assert.match(
    directAsset,
    /catch\s*\(error\)[\s\S]*\.from\("documents"\)/,
    "typed conversion failure must still re-read and select the latest original",
  );
});

test("public watermark routes bound PDF and branding-asset buffer reads", () => {
  for (const route of ["download", "file"]) {
    const source = routeSource(route);
    assert.doesNotMatch(source, /\bdownloadToBuffer\(/);
    assert.match(source, /downloadToBufferBounded/);
    assert.match(source, /PDF_PROCESSING_MAX_INPUT_BYTES/);
    assert.match(source, /BRANDING_LOGO_MAX_FILE_SIZE_BYTES/);
    assert.match(source, /maxBytes:\s*PDF_PROCESSING_MAX_INPUT_BYTES/);
    assert.match(source, /maxBytes:\s*BRANDING_LOGO_MAX_FILE_SIZE_BYTES/);
  }

  const signedUrl = routeSource("signed-url");
  assert.match(signedUrl, /PUBLIC_DOWNLOAD_OPERATION_TIMEOUT_MS/);
  assert.match(signedUrl, /deadlineAt:\s*deadline\.deadlineAt/);

  const downloadSource = routeSource("download");
  assert.match(
    downloadSource,
    /if\s*\(!converted\.ok\s*&&\s*converted\.status\s*!==\s*404\)\s*{\s*return converted;/,
  );

  const fileSource = routeSource("file");
  assert.match(
    fileSource,
    /downloadResult\.status\s*===\s*404[\s\S]*processDocumentProcessingJob/,
  );

  const zipSource = routeSource("download-zip");
  assert.doesNotMatch(zipSource, /\bdownloadToBuffer\(/);
  assert.match(zipSource, /BRANDING_LOGO_MAX_FILE_SIZE_BYTES/);
  assert.match(zipSource, /maxBytes:\s*BRANDING_LOGO_MAX_FILE_SIZE_BYTES/);
});

test("ZIP watermarks only eligible entries and merged PDF omits media", () => {
  const zipSource = routeSource("download-zip");
  assert.match(zipSource, /watermarkedDocumentIds/);
  assert.match(zipSource, /forcePdfDocumentIds: watermarkedDocumentIds/);
  assert.match(zipSource, /watermarkedDocumentIds\.has\(doc\.id\)/);

  const mergedSource = routeSource("download-merged");
  assert.match(
    mergedSource,
    /documents = documents\.filter\(\(document\) =>[\s\S]*isWatermarkEligibleDocument/,
  );
});

test("merged PDF bounds every storage read against conversion and aggregate budgets", () => {
  const source = routeSource("download-merged");

  assert.doesNotMatch(source, /\bdownloadToBuffer\(/);
  assert.match(source, /downloadToBufferBounded/);
  assert.match(source, /DOCUMENT_CONVERSION_MAX_INPUT_BYTES/);
  assert.match(source, /BRANDING_LOGO_MAX_FILE_SIZE_BYTES/);
  assert.match(source, /maxBytes:\s*BRANDING_LOGO_MAX_FILE_SIZE_BYTES/);
  // The pkg-only merge envelope is the shared 100 MB wasm ceiling, with the
  // watermark image counted against the same aggregate budget.
  assert.match(
    source,
    /mergeBudgetBytes\s*=\s*\n?\s*PDF_MERGE_MAX_TOTAL_BYTES\s*-\s*\(imageBytes\?\.byteLength\s*\?\?\s*0\)/,
  );
  assert.doesNotMatch(source, /DOCYANTRA_MULTIPART_MAX_UPLOAD_BYTES/);
  assert.match(
    source,
    /remainingPdfBytes\s*=\s*mergeBudgetBytes\s*-\s*totalBytes/,
  );
  assert.match(
    source,
    /ensurePdfBuffer\(\s*supabase,\s*doc,\s*remainingPdfBytes,\s*deadline,?\s*\)/,
  );
  assert.match(source, /pdfResult\.pdfBytes\.byteLength\s*>\s*maxPdfBytes/);
  assert.match(
    source,
    /toPublicEngineErrorResponse\(mergeResult\)/,
    "all merge failures must use the shared code-derived public contract",
  );
});

test("public document operations pass one route deadline through every transform", () => {
  for (const route of ["download", "file"]) {
    const source = routeSource(route);
    assert.match(source, /PUBLIC_DOWNLOAD_OPERATION_TIMEOUT_MS/);
    assert.match(source, /deadlineAt/);
    assert.match(source, /remainingOperationTimeMs/);
    assert.match(source, /timeoutMs:\s*remainingOperationTimeMs/);
  }

  const merged = routeSource("download-merged");
  assert.match(merged, /MERGED_DOWNLOAD_OPERATION_TIMEOUT_MS/);
  assert.match(merged, /MERGED_DOWNLOAD_FINALIZE_RESERVE_MS/);
  assert.match(merged, /preflightMergeInput/);
  assert.match(merged, /mapWithConcurrency/);
  assert.match(merged, /timeoutMs:\s*remainingOperationTimeMs/);

  const zip = routeSource("download-zip");
  assert.match(zip, /ZIP_DOWNLOAD_OPERATION_TIMEOUT_MS/);
  assert.match(zip, /ZIP_DOWNLOAD_FINALIZE_RESERVE_MS/);
  assert.match(zip, /timeoutMs:\s*remainingOperationTimeMs/);
  assert.match(zip, /deadlineSignal/);
});

test("conversion kickoff maps synchronous typed admission failures", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/app/api/convert/document/route.ts"),
    "utf8",
  );
  assert.match(source, /admitDocumentProcessingJob/);
  assert.match(source, /if\s*\(!admission\.accepted\)/);
  assert.match(source, /engineFailureSchema\.safeParse/);
  assert.match(source, /toPublicEngineErrorResponse/);
  assert.match(source, /deadlineAt/);
});

test("public watermark delivery reaches the engine through the provider facade", () => {
  const watermarkService = readFileSync(
    path.join(process.cwd(), "src/server/watermarkService.ts"),
    "utf8",
  );

  assert.match(watermarkService, /@\/server\/documentProcessing\/provider/);
  assert.doesNotMatch(watermarkService, /@\/server\/pdfCoreWasm/);
});
