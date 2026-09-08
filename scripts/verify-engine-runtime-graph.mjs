#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import console from "node:console";

const DOCYANTRA_PROVIDER = "@samarthmn/dockosha-provider-docyantra";
const PDF_PACKAGE = "@samarthmn/doc-yantra";
const OFFICE_PACKAGE = "@samarthmn/doc-yantra-office";
const FONT_PACKAGE = "@samarthmn/doc-yantra-fonts";
const requireCjs = createRequire(path.join(process.cwd(), "package.json"));

const readJson = (filePath) => JSON.parse(readFileSync(filePath, "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const resolvePackage = (packageName) => {
  const manifestPath = requireCjs.resolve(`${packageName}/package.json`);
  return {
    directory: path.dirname(manifestPath),
    manifestPath,
    manifest: readJson(manifestPath),
  };
};

export const validateEnginePackageVersions = ({
  providerName,
  providerVersion,
  dependencies,
  peerDependencies,
  installedVersions,
}) => {
  const expectedPackages = [PDF_PACKAGE, OFFICE_PACKAGE, FONT_PACKAGE];
  for (const packageName of expectedPackages) {
    const declaredVersion =
      dependencies[packageName] ?? peerDependencies[packageName];
    const installedVersion = installedVersions[packageName];
    if (!declaredVersion || !installedVersion) {
      throw new Error(
        `Engine runtime package missing: ${packageName} for ${providerName}.`,
      );
    }
    if (
      declaredVersion !== providerVersion ||
      installedVersion !== providerVersion
    ) {
      throw new Error(
        `Engine runtime version mismatch for ${packageName}: provider=${providerVersion}, declared=${declaredVersion}, installed=${installedVersion}.`,
      );
    }
  }
  return providerVersion;
};

const requireAsset = (packageDirectory, relativePath) => {
  const assetPath = path.join(packageDirectory, relativePath);
  if (!existsSync(assetPath)) {
    throw new Error(`Engine runtime asset missing: ${relativePath}.`);
  }
  return assetPath;
};

const readFingerprint = (packageDirectory, expectedTarget) => {
  const fingerprintPath = requireAsset(
    packageDirectory,
    "build-fingerprint.json",
  );
  const fingerprint = readJson(fingerprintPath);
  if (
    fingerprint.target !== expectedTarget ||
    typeof fingerprint.sourceHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(fingerprint.sourceHash)
  ) {
    throw new Error(
      `Engine runtime fingerprint mismatch for ${expectedTarget}.`,
    );
  }
  return { fingerprintPath, fingerprint };
};

const verifyFontAssets = (fontDirectory) => {
  const manifestPath = requireAsset(fontDirectory, "fonts/manifest.json");
  const manifest = readJson(manifestPath);
  if (!Array.isArray(manifest.fonts) || manifest.fonts.length === 0) {
    throw new Error("Engine font manifest contains no fonts.");
  }
  const paths = [manifestPath];
  for (const font of manifest.fonts) {
    if (
      !font ||
      typeof font.file !== "string" ||
      typeof font.sha256 !== "string"
    ) {
      throw new Error("Engine font manifest entry is invalid.");
    }
    const fontPath = requireAsset(fontDirectory, `fonts/${font.file}`);
    if (sha256(readFileSync(fontPath)) !== font.sha256) {
      throw new Error(`Engine font fingerprint mismatch: ${font.file}.`);
    }
    paths.push(fontPath);
  }
  return { manifestPath, paths };
};

export const inspectInstalledEngineRuntimeGraph = () => {
  const providerSpecifier = DOCYANTRA_PROVIDER;

  const provider = resolvePackage(providerSpecifier);
  const pdf = resolvePackage(PDF_PACKAGE);
  const office = resolvePackage(OFFICE_PACKAGE);
  const fonts = resolvePackage(FONT_PACKAGE);
  const providerVersion = String(provider.manifest.version ?? "");
  validateEnginePackageVersions({
    providerName: providerSpecifier,
    providerVersion,
    dependencies: provider.manifest.dependencies ?? {},
    peerDependencies: provider.manifest.peerDependencies ?? {},
    installedVersions: {
      [PDF_PACKAGE]: pdf.manifest.version,
      [OFFICE_PACKAGE]: office.manifest.version,
      [FONT_PACKAGE]: fonts.manifest.version,
    },
  });

  const pdfFingerprint = readFingerprint(pdf.directory, "pdf");
  const officeFingerprint = readFingerprint(office.directory, "office");
  const pdfFontManifest = requireAsset(pdf.directory, "font-manifest.json");
  const fontAssets = verifyFontAssets(fonts.directory);
  if (
    sha256(readFileSync(pdfFontManifest)) !==
    sha256(readFileSync(fontAssets.manifestPath))
  ) {
    throw new Error(
      "Engine font fingerprint mismatch between PDF engine and font package.",
    );
  }

  const criticalAssets = [
    provider.manifestPath,
    requireAsset(provider.directory, "dist/index.js"),
    pdf.manifestPath,
    requireAsset(pdf.directory, "worker-entry.cjs"),
    requireAsset(pdf.directory, "pdf_core_wasm_bg.wasm"),
    pdfFontManifest,
    pdfFingerprint.fingerprintPath,
    office.manifestPath,
    requireAsset(office.directory, "worker-entry.cjs"),
    requireAsset(office.directory, "office_core_wasm_bg.wasm"),
    officeFingerprint.fingerprintPath,
    fonts.manifestPath,
    ...fontAssets.paths,
  ];
  const fingerprintMaterial = criticalAssets
    .map((assetPath) => [
      path.relative(process.cwd(), assetPath),
      sha256(readFileSync(assetPath)),
    ])
    .sort(([left], [right]) => left.localeCompare(right));

  return {
    providerId: "docyantra",
    providerVersion,
    buildFingerprint: sha256(JSON.stringify(fingerprintMaterial)),
    assetPaths: criticalAssets.map((assetPath) =>
      path.relative(process.cwd(), assetPath),
    ),
  };
};

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  try {
    requireCjs.resolve(DOCYANTRA_PROVIDER);
    inspectInstalledEngineRuntimeGraph();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
