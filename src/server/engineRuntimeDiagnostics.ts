import type { EngineFailure } from "@/server/engineErrors";
import adapterFingerprint from "@samarthmn/dockosha-provider-docyantra/build-fingerprint.json";
import adapterManifest from "@samarthmn/dockosha-provider-docyantra/package.json";
import fontsManifest from "@samarthmn/doc-yantra-fonts/package.json";
import officeManifest from "@samarthmn/doc-yantra-office/package.json";
import pdfManifest from "@samarthmn/doc-yantra/package.json";

const DOCYANTRA_PROVIDER_PACKAGE = "@samarthmn/dockosha-provider-docyantra";
const DOCYANTRA_PDF_PACKAGE = "@samarthmn/doc-yantra";
const DOCYANTRA_OFFICE_PACKAGE = "@samarthmn/doc-yantra-office";
const DOCYANTRA_FONT_PACKAGE = "@samarthmn/doc-yantra-fonts";

const validatePackageManifest = (
  packageName: string,
  manifest: Record<string, unknown>,
): Record<string, unknown> => {
  if (manifest.name !== packageName) {
    throw new Error(`${packageName} manifest has an unexpected package name.`);
  }
  return manifest;
};

const adapterPackageManifest = validatePackageManifest(
  DOCYANTRA_PROVIDER_PACKAGE,
  adapterManifest,
);
const pdfPackageManifest = validatePackageManifest(
  DOCYANTRA_PDF_PACKAGE,
  pdfManifest,
);
const officePackageManifest = validatePackageManifest(
  DOCYANTRA_OFFICE_PACKAGE,
  officeManifest,
);
const fontsPackageManifest = validatePackageManifest(
  DOCYANTRA_FONT_PACKAGE,
  fontsManifest,
);

const readBuildFingerprint = (packageName: string): string => {
  const fingerprint = adapterFingerprint as Record<string, unknown>;
  if (
    typeof fingerprint.artifactHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(fingerprint.artifactHash)
  ) {
    throw new Error(
      `${packageName} has no valid build fingerprint artifact hash.`,
    );
  }
  return fingerprint.artifactHash;
};

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const PROVIDER_ID = /^[a-z][a-z0-9-]{1,63}$/u;

const DOCYANTRA_PROVIDER_ID = adapterPackageManifest.providerId;
if (
  typeof DOCYANTRA_PROVIDER_ID !== "string" ||
  !PROVIDER_ID.test(DOCYANTRA_PROVIDER_ID)
) {
  throw new Error(`${DOCYANTRA_PROVIDER_PACKAGE} has no valid provider id.`);
}

const readPackageVersion = (
  packageName: string,
  manifest: Record<string, unknown>,
): string => {
  const version = manifest.version;
  if (typeof version !== "string" || !SEMVER.test(version)) {
    throw new Error(`${packageName} has no valid package version.`);
  }
  return version;
};

const DOCYANTRA_PACKAGE_VERSION = readPackageVersion(
  DOCYANTRA_PROVIDER_PACKAGE,
  adapterPackageManifest,
);
const DOCYANTRA_ENGINE_VERSION = readPackageVersion(
  DOCYANTRA_PDF_PACKAGE,
  pdfPackageManifest,
);
const DOCYANTRA_OFFICE_VERSION = readPackageVersion(
  DOCYANTRA_OFFICE_PACKAGE,
  officePackageManifest,
);
const DOCYANTRA_FONT_VERSION = readPackageVersion(
  DOCYANTRA_FONT_PACKAGE,
  fontsPackageManifest,
);
if (
  DOCYANTRA_PACKAGE_VERSION !== DOCYANTRA_ENGINE_VERSION ||
  DOCYANTRA_ENGINE_VERSION !== DOCYANTRA_OFFICE_VERSION ||
  DOCYANTRA_OFFICE_VERSION !== DOCYANTRA_FONT_VERSION
) {
  throw new Error(
    "DocYantra adapter, PDF, Office, and fonts package versions differ.",
  );
}
const DOCYANTRA_BUILD_FINGERPRINT = readBuildFingerprint(
  DOCYANTRA_PROVIDER_PACKAGE,
);

type EngineRuntimeMetadata = {
  providerId: string;
  adapterVersion: string;
  engineVersion: string;
  buildFingerprint: string;
};

type EngineRuntimeLogInput = EngineRuntimeMetadata & {
  requestId: string;
  failure: EngineFailure;
};

const SAFE_MACHINE_VALUE = /^[a-z0-9][a-z0-9._:@/-]{0,127}$/iu;

const safeMachineValue = (value: unknown, fallback: string): string =>
  typeof value === "string" && SAFE_MACHINE_VALUE.test(value)
    ? value
    : fallback;

const failureReasonCode = (failure: EngineFailure): string => {
  if (
    failure.detail &&
    typeof failure.detail === "object" &&
    !Array.isArray(failure.detail) &&
    "reason" in failure.detail
  ) {
    return safeMachineValue(failure.detail.reason, failure.code);
  }
  return failure.code;
};

export const toSafeEngineRuntimeLog = (
  input: EngineRuntimeLogInput,
): {
  requestId: string;
  providerId: string;
  adapterVersion: string;
  engineVersion: string;
  buildFingerprint: string;
  operation: EngineFailure["operation"];
  reasonCode: string;
} => ({
  requestId: safeMachineValue(input.requestId, "unknown"),
  providerId: safeMachineValue(input.providerId, "unknown"),
  adapterVersion: safeMachineValue(input.adapterVersion, "unknown"),
  engineVersion: safeMachineValue(input.engineVersion, "unknown"),
  buildFingerprint: safeMachineValue(input.buildFingerprint, "unknown"),
  operation: input.failure.operation,
  reasonCode: failureReasonCode(input.failure),
});

export const logEngineRuntimeFailure = (input: {
  requestId: string;
  failure: EngineFailure;
}): void => {
  console.error(
    "[docyantra-runtime]",
    toSafeEngineRuntimeLog({
      requestId: input.requestId,
      failure: input.failure,
      providerId: DOCYANTRA_PROVIDER_ID,
      adapterVersion: DOCYANTRA_PACKAGE_VERSION,
      engineVersion: DOCYANTRA_ENGINE_VERSION,
      buildFingerprint: DOCYANTRA_BUILD_FINGERPRINT,
    }),
  );
};
