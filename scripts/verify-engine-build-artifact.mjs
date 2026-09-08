#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import console from "node:console";
import { inspectInstalledEngineRuntimeGraph } from "./verify-engine-runtime-graph.mjs";

const DOCYANTRA_PROVIDER = "@samarthmn/dockosha-provider-docyantra";
const requireCjs = createRequire(path.join(process.cwd(), "package.json"));

const CORE_REQUIRED_TRACE_SUFFIXES = [
  "node_modules/@samarthmn/dockosha-provider-docyantra/package.json",
  "node_modules/@samarthmn/dockosha-provider-docyantra/dist/index.js",
  "node_modules/@samarthmn/doc-yantra/package.json",
  "node_modules/@samarthmn/doc-yantra/worker-entry.cjs",
  "node_modules/@samarthmn/doc-yantra/pdf_core_wasm_bg.wasm",
  "node_modules/@samarthmn/doc-yantra/font-manifest.json",
  "node_modules/@samarthmn/doc-yantra/build-fingerprint.json",
  "node_modules/@samarthmn/doc-yantra-office/package.json",
  "node_modules/@samarthmn/doc-yantra-office/worker-entry.cjs",
  "node_modules/@samarthmn/doc-yantra-office/office_core_wasm_bg.wasm",
  "node_modules/@samarthmn/doc-yantra-office/build-fingerprint.json",
  "node_modules/zod/package.json",
  "node_modules/zod/index.cjs",
];
const FONT_REQUIRED_TRACE_SUFFIXES = [
  "node_modules/@samarthmn/doc-yantra-fonts/package.json",
  "node_modules/@samarthmn/doc-yantra-fonts/fonts/manifest.json",
];

const normalizeTracePath = (tracePath) => tracePath.replaceAll("\\", "/");

export const verifyEngineTraceFiles = (traceFiles, fontFileNames = []) => {
  const normalizedFiles = traceFiles.map(normalizeTracePath);
  const requiredSuffixes = [
    ...CORE_REQUIRED_TRACE_SUFFIXES,
    ...FONT_REQUIRED_TRACE_SUFFIXES,
    ...fontFileNames.map(
      (fontFile) =>
        `node_modules/@samarthmn/doc-yantra-fonts/fonts/${fontFile}`,
    ),
  ];
  for (const suffix of requiredSuffixes) {
    if (!normalizedFiles.some((tracePath) => tracePath.endsWith(suffix))) {
      throw new Error(
        `Public file route trace is incomplete: missing ${suffix}.`,
      );
    }
  }
};

export const verifyPublicFileRouteBuildArtifact = ({
  distDirectory = process.env.NEXT_DISTDIR?.trim() || ".next",
} = {}) => {
  const graph = inspectInstalledEngineRuntimeGraph();
  const traceManifestPath = path.join(
    process.cwd(),
    distDirectory,
    "server/app/api/public/links/file/route.js.nft.json",
  );
  if (!existsSync(traceManifestPath)) {
    throw new Error(
      `Public file route trace manifest is missing: ${traceManifestPath}.`,
    );
  }
  const traceManifest = JSON.parse(readFileSync(traceManifestPath, "utf8"));
  if (!Array.isArray(traceManifest.files)) {
    throw new Error("Public file route trace manifest has no files array.");
  }

  const fontManifestPath = requireCjs.resolve(
    "@samarthmn/doc-yantra-fonts/fonts/manifest.json",
  );
  const fontManifest = JSON.parse(readFileSync(fontManifestPath, "utf8"));
  const fontFileNames = Array.isArray(fontManifest.fonts)
    ? fontManifest.fonts
        .map((font) => font?.file)
        .filter((fontFile) => typeof fontFile === "string")
    : [];
  if (fontFileNames.length === 0) {
    throw new Error("Installed engine font manifest contains no font assets.");
  }
  verifyEngineTraceFiles(traceManifest.files, fontFileNames);

  const traceDirectory = path.dirname(traceManifestPath);
  for (const traceFile of traceManifest.files) {
    if (
      typeof traceFile !== "string" ||
      !existsSync(path.resolve(traceDirectory, traceFile))
    ) {
      throw new Error(
        `Public file route trace references a missing file: ${String(traceFile)}.`,
      );
    }
  }

  return {
    providerId: graph.providerId,
    providerVersion: graph.providerVersion,
    buildFingerprint: graph.buildFingerprint,
    traceManifestPath,
  };
};

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  try {
    requireCjs.resolve(DOCYANTRA_PROVIDER);
    const result = verifyPublicFileRouteBuildArtifact();
    process.stdout.write(
      `Verified public file runtime bundle (${result.providerId} ${result.providerVersion}, ${result.buildFingerprint}).\n`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
