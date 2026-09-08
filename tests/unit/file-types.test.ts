import assert from "node:assert/strict";
import test from "node:test";

import {
  ALL_SUPPORTED_EXTENSIONS,
  isSupportedUploadExtension,
} from "@/lib/constants";
import {
  isActiveConvertibleExtension,
  isCompletedConversionEligibleExtension,
} from "@/lib/fileTypes";

test("upload support and new conversion routing reject legacy Office formats", () => {
  const uploadExtensions = new Set<string>(ALL_SUPPORTED_EXTENSIONS);

  for (const extension of ["doc", "ppt", "xls"]) {
    assert.equal(uploadExtensions.has(extension), false);
    assert.equal(isSupportedUploadExtension(extension), false);
    assert.equal(isActiveConvertibleExtension(extension), false);
  }
});

test("completed conversion eligibility preserves legacy Office formats", () => {
  for (const extension of ["doc", "ppt", "xls"]) {
    assert.equal(isCompletedConversionEligibleExtension(extension), true);
  }
});
