#!/usr/bin/env node

import { Buffer } from "node:buffer";
import console from "node:console";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { isPrivateSamplePath } from "./private-sample-test-policy.mjs";
import { inventorySource, parseSourceArguments } from "./source-inventory.mjs";

// Public release-candidate policy. This checker reads an explicit filesystem
// tree; it does not depend on Git state or history.
export const INTERNAL_PATHS = [
  "Customer Interviews/",
  "pending-work/",
  "hyper-agent/",
  "memories/",
  "oss-checklist/",
  "marketing-docs/",
  "product-docs/",
  ".agents/",
  ".codex/",
  ".github/skills/",
  "docs/superpowers/",
  "CLAUDE.md",
  "scripts/worktree-setup.sh",
  "scripts/reset-local-stripe.ts",
  "tmp/",
];

export const OPS_PATHS = ["marketing-memory-api/", "billing-offers-console/"];

export const OMIT_PATHS = [
  ".git/",
  ".npmrc",
  "key.b64",
  "vercel-gotenberg-invoker.json",
  "node_modules/",
  ".next/",
  ".next-",
  "out/",
  "build/",
  "coverage/",
  "playwright-report/",
  "test-results/",
  "logs/",
  "exports/",
  "worktrees/",
  ".worktrees/",
  ".pnpm-store/",
  ".temp/",
  ".vercel/",
  ".email-previews/",
  "output/",
  "outputs/",
  "public/wasm/",
  "public/pdfjs/",
  "doc-kosha-private/",
  "doc-yantra/",
];

const OMITTED_DIRECTORY_NAMES = new Set([
  ".git",
  ".vercel",
  ".email-previews",
  "output",
  "outputs",
  "reports",
  "cache",
  ".cache",
  ".turbo",
  "playwright-report",
  "test-results",
  "image-gen-posts",
  "dist",
  "node_modules",
  "coverage",
  "build",
  "out",
  "logs",
  "exports",
  "worktrees",
  ".worktrees",
  ".pnpm-store",
  ".temp",
  ".source",
  "(synced-content)",
  "tmp",
  "doc-kosha-private",
  "doc-yantra",
]);

const GENERATED_DIRECTORY_NAMES = new Set([
  "node_modules",
  ".pnpm-store",
  ".next",
  "coverage",
  "build",
  "out",
  "dist",
]);

export const BANNED_CONTENT_TOKENS = [
  "DOCKOSHA_" + "EE_ENABLED",
  "NEXT_PUBLIC_" + "OSS_LAUNCH",
];

export const APPROVED_DOCYANTRA_PACKAGES = new Set([
  "@samarthmn/doc-yantra",
  "@samarthmn/doc-yantra-office",
  "@samarthmn/doc-yantra-fonts",
  "@samarthmn/dockosha-provider-docyantra",
]);

export const CONTENT_SCAN_ALLOWLIST = ["scripts/check-public-manifest.mjs"];

const CLASSIFIED_PATHS = [
  ["INTERNAL", INTERNAL_PATHS],
  ["OPS", OPS_PATHS],
  ["OMIT", OMIT_PATHS],
];
const NON_PUBLIC_CLASSIFICATIONS = new Set(["INTERNAL", "OPS", "OMIT"]);

const normalizePath = (filePath) =>
  filePath.replaceAll("\\", "/").replace(/^\.\//u, "");
const PRIVATE_ENGINE_ARTIFACT_PATH =
  /(?:^|\/)(?:doc[-_]?yantra|pdf[-_]?core|office[-_]?core|private[-_]?engine)(?:[^/]*)\.(?:wasm|tgz|tar|tar\.gz|zip|gz)$/iu;
const WASM_MAGIC = Buffer.from([0x00, 0x61, 0x73, 0x6d]);
const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export const isPrivateEngineArtifactPath = (filePath) =>
  PRIVATE_ENGINE_ARTIFACT_PATH.test(normalizePath(filePath));

const startsWith = (contents, signature) =>
  contents.subarray(0, signature.length).equals(signature);

const isTarArchive = (contents) =>
  contents.length >= 262 &&
  contents.subarray(257, 262).toString("utf8") === "ustar";

const findPrivateEngineArtifactViolations = (contents, filePath) => {
  if (startsWith(contents, WASM_MAGIC))
    return [{ path: filePath, token: "WebAssembly binary", line: 1 }];
  if (
    isPrivateEngineArtifactPath(filePath) &&
    (startsWith(contents, GZIP_MAGIC) ||
      startsWith(contents, ZIP_MAGIC) ||
      isTarArchive(contents))
  ) {
    return [{ path: filePath, token: "private engine archive", line: 1 }];
  }
  return [];
};
const matchesPathRule = (filePath, rule) => {
  const normalized = normalizePath(filePath);
  if (rule === ".env*" || rule === ".next-") return normalized.startsWith(rule);
  return rule.endsWith("/") ? normalized.startsWith(rule) : normalized === rule;
};

const isSensitiveCandidate = (filePath) => {
  const normalized = normalizePath(filePath);
  const basename = path.posix.basename(normalized);
  const sshPrivateKeyBasenames = new Set([
    "id_rsa",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
  ]);
  const segments = normalized.split("/");
  return (
    segments.some(
      (segment) =>
        segment.startsWith(".env") ||
        segment === ".npmrc" ||
        segment.startsWith(".next") ||
        OMITTED_DIRECTORY_NAMES.has(segment),
    ) ||
    basename === ".DS_Store" ||
    basename === "next-env.d.ts" ||
    basename === ".netrc" ||
    basename === ".pypirc" ||
    basename === ".yarnrc" ||
    basename === ".yarnrc.yml" ||
    /\.log(?:\.[^/]+)?$/iu.test(basename) ||
    basename.endsWith(".tsbuildinfo") ||
    sshPrivateKeyBasenames.has(basename) ||
    basename === "key.b64" ||
    basename === "vercel-gotenberg-invoker.json" ||
    /\.(?:pem|key|crt|cer|cert|p12|pfx|der|jks|keystore)$/iu.test(basename) ||
    /(?:service[-_]?account|credentials?|service[-_]?credentials?)[^/]*\.json$/iu.test(
      basename,
    )
  );
};

export const classifyPath = (filePath) => {
  const normalized = normalizePath(filePath);
  if (isPrivateSamplePath(normalized)) return "OMIT";
  if (normalized === "tmp" || normalized.startsWith("tmp/")) return "OMIT";
  if (isSensitiveCandidate(normalized)) return "OMIT";
  if (normalized === "testing-docs" || normalized.startsWith("testing-docs/"))
    return "PUBLIC";
  if (normalized === "AGENTS.md") return "PUBLIC";
  for (const [classification, rules] of CLASSIFIED_PATHS) {
    if (rules.some((rule) => matchesPathRule(normalized, rule)))
      return classification;
  }
  if (normalized.split("/").includes("node_modules")) return "OMIT";
  return "PUBLIC";
};

export const listPublicFiles = (candidateFiles) =>
  candidateFiles
    .map(normalizePath)
    .filter(
      (filePath) =>
        !NON_PUBLIC_CLASSIFICATIONS.has(classifyPath(filePath)) &&
        !isPrivateEngineArtifactPath(filePath),
    )
    .toSorted();

export const isProbablyBinary = (contents) => {
  const sample = contents.subarray(0, 8192);
  if (sample.includes(0)) return true;
  let suspiciousBytes = 0;
  for (const byte of sample) {
    const isAllowedControl =
      byte === 9 || byte === 10 || byte === 12 || byte === 13;
    if ((byte < 32 && !isAllowedControl) || byte === 127) suspiciousBytes += 1;
  }
  return sample.length > 0 && suspiciousBytes / sample.length > 0.1;
};

const findTokenLines = (contents, filePath) => {
  const violations = [];
  const lines = contents.toString("utf8").split(/\r?\n/u);
  lines.forEach((lineContents, index) => {
    for (const token of BANNED_CONTENT_TOKENS) {
      if (lineContents.includes(token))
        violations.push({ path: filePath, token, line: index + 1 });
    }
    const samarthmnReferences = lineContents.match(
      /@samarthmn(?:\/[A-Za-z0-9._-]+)?/gu,
    );
    for (const reference of samarthmnReferences ?? []) {
      const isRegistryMapping =
        filePath === "pnpm-workspace.yaml" &&
        /^\s+["']?@samarthmn["']?: https:\/\/npm\.pkg\.github\.com\/?\s*$/u.test(
          lineContents,
        );
      if (!APPROVED_DOCYANTRA_PACKAGES.has(reference) && !isRegistryMapping) {
        violations.push({ path: filePath, token: reference, line: index + 1 });
      }
    }
  });
  return violations;
};

const DEPENDENCY_FIELDS = new Set([
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
]);
const LOCAL_DEPENDENCY_PROTOCOL = /^(?:file|link|portal|patch|workspace):/iu;
const LOCAL_DEPENDENCY_PATH = /^(?:\.\.?[\\/]|[a-z]:[\\/])/iu;

const findManifestDependencyViolations = (contents, filePath) => {
  if (path.posix.basename(filePath) !== "package.json") return [];
  let manifest;
  try {
    manifest = JSON.parse(contents.toString("utf8"));
  } catch {
    return [];
  }

  const violations = [];
  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = manifest?.[field];
    if (!dependencies || typeof dependencies !== "object") continue;
    for (const [, specifier] of Object.entries(dependencies)) {
      if (typeof specifier !== "string") continue;
      const isLocalProtocol = LOCAL_DEPENDENCY_PROTOCOL.test(specifier);
      const isLocalPath = LOCAL_DEPENDENCY_PATH.test(specifier);
      if (!isLocalProtocol && !isLocalPath) continue;
      const valueOffset = contents.indexOf(JSON.stringify(specifier));
      const line =
        valueOffset < 0
          ? 1
          : contents.subarray(0, valueOffset).toString("utf8").split("\n")
              .length;
      violations.push({ path: filePath, token: specifier, line });
    }
  }
  return violations;
};

export const auditTrackedFiles = async (
  candidateFiles,
  readCandidateFile = (filePath) => readFile(filePath),
  { source = "export" } = {},
) => {
  const sortedFiles = candidateFiles.map(normalizePath).toSorted();
  const pathViolations = sortedFiles
    .map((filePath) => ({
      path: filePath,
      classification: classifyPath(filePath),
    }))
    .filter(({ classification }) =>
      source === "candidate" || source === "committed"
        ? classification !== "PUBLIC"
        : classification === "INTERNAL" || classification === "OPS",
    );
  const contentViolations = [];
  const scanErrors = [];
  let scannedTextFiles = 0;
  let skippedBinaryFiles = 0;
  let skippedAllowlistedFiles = 0;

  for (const filePath of sortedFiles) {
    if (classifyPath(filePath) === "OMIT") continue;
    if (CONTENT_SCAN_ALLOWLIST.includes(filePath)) {
      skippedAllowlistedFiles += 1;
      continue;
    }
    let contents;
    try {
      contents = await readCandidateFile(filePath);
    } catch (error) {
      scanErrors.push({
        path: filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const buffer = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
    if (isProbablyBinary(buffer)) {
      skippedBinaryFiles += 1;
      contentViolations.push(
        ...findPrivateEngineArtifactViolations(buffer, filePath),
      );
      continue;
    }
    scannedTextFiles += 1;
    contentViolations.push(
      ...findPrivateEngineArtifactViolations(buffer, filePath),
    );
    contentViolations.push(...findTokenLines(buffer, filePath));
    contentViolations.push(
      ...findManifestDependencyViolations(buffer, filePath),
    );
  }

  return {
    trackedFiles: sortedFiles.length,
    publicFiles: listPublicFiles(sortedFiles).length,
    pathViolations,
    contentViolations,
    scanErrors,
    scannedTextFiles,
    skippedBinaryFiles,
    skippedAllowlistedFiles,
  };
};

const skippedDirectory = (relativePath) => {
  const normalized = normalizePath(relativePath);
  return (
    classifyPath(`${normalized}/`) === "OMIT" ||
    normalized
      .split("/")
      .some(
        (part) =>
          part === "node_modules" ||
          part === "doc-kosha-private" ||
          part === "doc-yantra",
      )
  );
};

const symlinkViolation = (relativePath) => ({
  path: normalizePath(relativePath),
  classification: "SYMLINK",
});

export const enumerateCandidateFiles = async (
  rootDirectory,
  { includeOmitted = false } = {},
) => {
  const resolvedRoot = path.resolve(rootDirectory);
  let rootStat;
  try {
    rootStat = await lstat(resolvedRoot);
  } catch (error) {
    throw new Error(
      `Candidate root is not readable: ${resolvedRoot}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (rootStat.isSymbolicLink()) {
    throw new Error(`Candidate root must not be a symlink: ${resolvedRoot}`);
  }
  if (!rootStat.isDirectory()) {
    throw new Error(`Candidate root is not a directory: ${resolvedRoot}`);
  }

  const files = [];
  const symlinkViolations = [];
  const omittedDirectoryViolations = [];
  const visit = async (directory, relativeDirectory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.toSorted((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const absolutePath = path.join(directory, entry.name);
      let entryStat;
      try {
        entryStat = await lstat(absolutePath);
      } catch (error) {
        throw new Error(
          `Candidate entry is not readable: ${normalizePath(relativePath)}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      if (entryStat.isSymbolicLink()) {
        symlinkViolations.push(symlinkViolation(relativePath));
        continue;
      }
      if (entryStat.isDirectory()) {
        if (relativePath === ".git") {
          if (includeOmitted)
            omittedDirectoryViolations.push({
              path: ".git",
              classification: "OMIT",
            });
          continue;
        }
        const isGeneratedDirectory = relativePath
          .split("/")
          .some((part) => GENERATED_DIRECTORY_NAMES.has(part));
        const isOmittedDirectory =
          classifyPath(`${relativePath}/`) === "OMIT" || isGeneratedDirectory;
        if (includeOmitted && isOmittedDirectory) {
          omittedDirectoryViolations.push({
            path: normalizePath(relativePath),
            classification: "OMIT",
          });
          continue;
        }
        if (
          !isGeneratedDirectory &&
          (includeOmitted || !skippedDirectory(relativePath))
        )
          await visit(absolutePath, relativePath);
        continue;
      }
      if (
        !entryStat.isFile() ||
        (!includeOmitted && classifyPath(relativePath) === "OMIT")
      )
        continue;
      files.push(relativePath);
    }
  };
  await visit(rootDirectory, "");
  const candidateFiles = files.toSorted();
  Object.defineProperty(candidateFiles, "symlinkViolations", {
    value: symlinkViolations.toSorted((left, right) =>
      left.path.localeCompare(right.path),
    ),
    enumerable: false,
  });
  Object.defineProperty(candidateFiles, "omittedDirectoryViolations", {
    value: omittedDirectoryViolations.toSorted((left, right) =>
      left.path.localeCompare(right.path),
    ),
    enumerable: false,
  });
  return candidateFiles;
};

export const parseAuditArguments = (args) => {
  let mode = "check";
  let json = false;
  let root = process.cwd();
  const sourceArguments = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--source" || argument.startsWith("--source=")) {
      sourceArguments.push(argument);
      if (argument === "--source") {
        sourceArguments.push(args[index + 1]);
        index += 1;
      }
      continue;
    }
    if (argument.startsWith("--mode=")) {
      mode = argument.slice("--mode=".length);
      continue;
    }
    if (argument.startsWith("--root=")) {
      root = path.resolve(argument.slice("--root=".length));
      continue;
    }
    if (argument === "--root") {
      const value = args[index + 1];
      if (!value || value.startsWith("--"))
        throw new Error("--root requires a directory path");
      root = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (!["check", "list"].includes(mode))
    throw new Error(`Invalid mode "${mode}". Expected "check" or "list".`);
  return { mode, json, root, ...parseSourceArguments(sourceArguments) };
};

const countByClassification = (violations) => {
  const counts = { INTERNAL: 0, OPS: 0, OMIT: 0, SYMLINK: 0 };
  for (const { classification } of violations) counts[classification] += 1;
  return counts;
};

export const formatListViolation = ({ classification, path: filePath }) =>
  `[${classification}] ${filePath}`;

const printCheckReport = (result) => {
  const failed =
    result.pathViolations.length > 0 ||
    result.contentViolations.length > 0 ||
    result.scanErrors.length > 0;
  const counts = countByClassification(result.pathViolations);
  console.log(`Public manifest audit: ${failed ? "FAIL" : "PASS"}`);
  console.log(`Candidate files: ${result.trackedFiles}`);
  console.log(`Curated public files: ${result.publicFiles}`);
  console.log(
    `Path violations: ${result.pathViolations.length} (INTERNAL ${counts.INTERNAL}, OPS ${counts.OPS}, SYMLINK ${counts.SYMLINK})`,
  );
  console.log(`Banned content references: ${result.contentViolations.length}`);
  console.log(
    `Content scan: ${result.scannedTextFiles} text, ${result.skippedBinaryFiles} binary skipped, ${result.skippedAllowlistedFiles} allowlisted skipped, ${result.scanErrors.length} read errors`,
  );
  for (const violation of result.pathViolations)
    console.log(`  [${violation.classification}] ${violation.path}`);
  for (const violation of result.contentViolations)
    console.log(
      `  [BANNED_CONTENT] ${violation.path}:${violation.line} contains ${JSON.stringify(violation.token)}`,
    );
  for (const scanError of result.scanErrors)
    console.log(`  [READ_ERROR] ${scanError.path}: ${scanError.error}`);
};

const main = async () => {
  const { mode, json, root, source } = parseAuditArguments(
    process.argv.slice(2),
  );
  const inventory = await inventorySource({ source, root });
  const candidateFiles = inventory.files;
  const symlinkViolations = inventory.pathViolations ?? [];
  if (mode === "list") {
    const files =
      source === "export" ? candidateFiles : [...candidateFiles].toSorted();
    if (json)
      console.log(
        JSON.stringify(
          { count: files.length, files, symlinkViolations },
          null,
          2,
        ),
      );
    else {
      console.log(files.join("\n"));
      for (const violation of symlinkViolations)
        console.error(formatListViolation(violation));
    }
    if (symlinkViolations.length > 0) process.exitCode = 1;
    return;
  }
  const result = await auditTrackedFiles(candidateFiles, inventory.readFile, {
    source,
  });
  result.pathViolations.push(...symlinkViolations);
  result.pathViolations.sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const failed =
    result.pathViolations.length > 0 ||
    result.contentViolations.length > 0 ||
    result.scanErrors.length > 0;
  if (json)
    console.log(
      JSON.stringify(
        {
          status: failed ? "fail" : "pass",
          ...result,
          pathViolationCounts: countByClassification(result.pathViolations),
        },
        null,
        2,
      ),
    );
  else printCheckReport(result);
  if (failed) process.exitCode = 1;
};

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(
      `Public manifest audit could not run: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 2;
  });
}
