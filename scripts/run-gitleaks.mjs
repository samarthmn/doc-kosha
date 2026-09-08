#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import console from "node:console";
import {
  copyFileSync,
  lstatSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  auditTrackedFiles,
  enumerateCandidateFiles,
  listPublicFiles,
} from "./check-public-manifest.mjs";
import { inventorySource, parseSourceArguments } from "./source-inventory.mjs";

const parseRunArguments = (args) => {
  let root = process.cwd();
  const sourceArguments = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
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
    sourceArguments.push(argument);
    if (argument === "--source") {
      sourceArguments.push(args[index + 1]);
      index += 1;
    }
  }
  return { root, ...parseSourceArguments(sourceArguments) };
};

const isValidPath = (target, kind) => {
  let stats;
  try {
    stats = lstatSync(target);
  } catch (error) {
    console.error(
      `Gitleaks ${kind} is not readable: ${target}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }

  const valid =
    kind === "candidate root" ? stats.isDirectory() : stats.isFile();
  if (!valid || stats.isSymbolicLink()) {
    console.error(
      `Gitleaks ${kind} must be a regular non-symlink ${kind === "candidate root" ? "directory" : "file"}: ${target}`,
    );
    return false;
  }
  return true;
};

const assertRegularFile = (filePath) => {
  const stats = lstatSync(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(
      `Gitleaks source must be a regular non-symlink file: ${filePath}`,
    );
  }
  return stats;
};

export const stagePublicFiles = (candidateRoot, stagingRoot, publicFiles) => {
  let byteCount = 0;
  for (const relativePath of publicFiles) {
    const sourcePath = path.resolve(candidateRoot, relativePath);
    const destinationPath = path.resolve(stagingRoot, relativePath);
    const sourceStats = assertRegularFile(sourcePath);
    byteCount += sourceStats.size;
    mkdirSync(path.dirname(destinationPath), { recursive: true });
    try {
      linkSync(sourcePath, destinationPath);
    } catch (error) {
      const fallbackCodes = new Set(["EACCES", "EPERM", "EXDEV", "ENOTSUP"]);
      if (
        !error ||
        typeof error !== "object" ||
        !fallbackCodes.has(Reflect.get(error, "code"))
      ) {
        throw error;
      }
      copyFileSync(sourcePath, destinationPath);
    }
  }
  return { fileCount: publicFiles.length, byteCount };
};

export const stageInventoryFiles = async (
  stagingRoot,
  publicFiles,
  readInventoryFile,
) => {
  let byteCount = 0;
  for (const relativePath of publicFiles) {
    const destinationPath = path.resolve(stagingRoot, relativePath);
    if (!destinationPath.startsWith(`${path.resolve(stagingRoot)}${path.sep}`))
      throw new Error("Gitleaks source inventory contains an unsafe path");
    const contents = await readInventoryFile(relativePath);
    const buffer = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
    mkdirSync(path.dirname(destinationPath), { recursive: true });
    writeFileSync(destinationPath, buffer, { flag: "wx", mode: 0o600 });
    byteCount += buffer.length;
  }
  return { fileCount: publicFiles.length, byteCount };
};

export const collectPublicFiles = async (candidateRoot) => {
  const candidateFiles = await enumerateCandidateFiles(candidateRoot);
  const symlinkViolations = candidateFiles.symlinkViolations ?? [];
  if (symlinkViolations.length > 0) {
    throw new Error(
      `Gitleaks candidate contains symlink violations: ${symlinkViolations
        .map(({ path: relativePath }) => relativePath)
        .join(", ")}`,
    );
  }
  return listPublicFiles(candidateFiles);
};

export const runGitleaks = async (
  candidateRoot,
  configPath,
  { source = "export" } = {},
) => {
  if (!isValidPath(configPath, "config file")) return 2;
  const inventory = await inventorySource({ source, root: candidateRoot });
  const audit = await auditTrackedFiles(inventory.files, inventory.readFile, {
    source,
  });
  audit.pathViolations.push(...(inventory.pathViolations ?? []));
  if (
    audit.pathViolations.length > 0 ||
    audit.contentViolations.length > 0 ||
    audit.scanErrors.length > 0
  )
    throw new Error(
      "Gitleaks source inventory failed the public boundary audit",
    );
  const publicFiles = inventory.files;
  const scratchParent = path.join(candidateRoot, "tmp");
  const scratchParentExisted = (() => {
    try {
      return lstatSync(scratchParent).isDirectory();
    } catch {
      return false;
    }
  })();
  mkdirSync(scratchParent, { recursive: true });
  let stagingRoot;
  try {
    stagingRoot = mkdtempSync(path.join(scratchParent, "gitleaks-public-"));
    const staged = await stageInventoryFiles(
      stagingRoot,
      publicFiles,
      inventory.readFile,
    );
    if (staged.fileCount === 0 || staged.byteCount === 0) {
      throw new Error("Gitleaks staging produced no bytes to scan.");
    }
    const result = spawnSync(
      "gitleaks",
      [
        "dir",
        "--config",
        path.join(stagingRoot, ".gitleaks.toml"),
        "--redact",
        "--no-banner",
        ".",
      ],
      {
        cwd: stagingRoot,
        stdio: "inherit",
        timeout: 120_000,
        killSignal: "SIGKILL",
      },
    );

    if (result.error) {
      console.error(
        "Unable to invoke Gitleaks CLI: install the official gitleaks executable and ensure it is available on PATH.",
      );
      return 2;
    }
    return result.status ?? 2;
  } finally {
    if (stagingRoot) rmSync(stagingRoot, { recursive: true, force: true });
    if (!scratchParentExisted) {
      try {
        rmdirSync(scratchParent);
      } catch {
        // A concurrent process may own remaining files; never remove them.
      }
    }
  }
};

const main = async () => {
  const { root: candidateRoot, source } = parseRunArguments(
    process.argv.slice(2),
  );
  const configPath = path.join(candidateRoot, ".gitleaks.toml");

  if (
    !isValidPath(candidateRoot, "candidate root") ||
    !isValidPath(configPath, "config file")
  ) {
    process.exitCode = 2;
    return;
  }
  process.exitCode = await runGitleaks(candidateRoot, configPath, { source });
};

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";

if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(
      `Gitleaks scan could not run: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 2;
  });
}
