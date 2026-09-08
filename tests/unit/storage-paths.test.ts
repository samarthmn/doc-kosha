import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUniqueUploadFilename,
  fitStorageFilename,
} from "@/server/storage/storagePaths";

test("unique upload filenames are capped by UTF-8 bytes without splitting code points", () => {
  const result = buildUniqueUploadFilename(
    `${"😀".repeat(200)}.docx`,
    "abc123",
  );

  assert.ok(Buffer.byteLength(result, "utf8") <= 255);
  assert.match(result, /__abc123\.docx$/);
  assert.doesNotMatch(result, /�/);
});

test("ASCII upload filenames preserve the established suffix shape", () => {
  assert.equal(
    buildUniqueUploadFilename("proposal.docx", "abc123"),
    "proposal__abc123.docx",
  );
});

test("non-document asset filenames are also byte capped", () => {
  const result = fitStorageFilename(`${"界".repeat(200)}.png`);
  assert.ok(Buffer.byteLength(result, "utf8") <= 255);
  assert.match(result, /\.png$/);
  assert.doesNotMatch(result, /�/);
});
