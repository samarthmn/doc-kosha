const normalizePath = (filePath) =>
  filePath.replaceAll("\\", "/").replace(/^\.\//u, "");

export const PRIVATE_SAMPLE_DIRECTORY = "mock-files/";

export const PRIVATE_SAMPLE_BROWSER_TEST_PATHS = [
  "tests/e2e/cjk-office-conversion.spec.ts",
  "tests/e2e/core-product-flow.spec.ts",
  "tests/e2e/document-conversion.spec.ts",
  "tests/e2e/document-lifecycle-fixes.spec.ts",
  "tests/e2e/document-redaction.spec.ts",
  "tests/e2e/free-plan-limits.spec.ts",
  "tests/e2e/public-viewer-chunk-resilience.spec.ts",
];

export const PRIVATE_SAMPLE_ENGINE_TEST_PATHS = [
  "tests/unit/engine/complex-docx-conversion.test.ts",
  "tests/unit/engine/engine-boot-probe.test.ts",
  "tests/unit/engine/office-core-profile-validation.test.ts",
  "tests/unit/engine/pdf-conversion-csv-md.test.ts",
  "tests/unit/engine/pdf-conversion-golden.test.ts",
  "tests/unit/engine/pdf-conversion-load-smoke.test.ts",
  "tests/unit/engine/pdf-conversion-routing.test.ts",
  "tests/unit/engine/pdf-large-file.test.ts",
  "tests/unit/engine/pdf-watermark-service.test.ts",
  "tests/unit/engine/redaction-service-engine.test.ts",
];

export const PRIVATE_SAMPLE_TEST_PATHS = [
  ...PRIVATE_SAMPLE_BROWSER_TEST_PATHS,
  ...PRIVATE_SAMPLE_ENGINE_TEST_PATHS,
];

const PRIVATE_SAMPLE_TEST_PATH_SET = new Set(PRIVATE_SAMPLE_TEST_PATHS);

export const isPrivateSamplePath = (filePath) => {
  const normalized = normalizePath(filePath);
  return (
    normalized === PRIVATE_SAMPLE_DIRECTORY.slice(0, -1) ||
    normalized.startsWith(PRIVATE_SAMPLE_DIRECTORY) ||
    PRIVATE_SAMPLE_TEST_PATH_SET.has(normalized)
  );
};
