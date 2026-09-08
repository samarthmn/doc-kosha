import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { TextDecoder } from "node:util";

import {
  enumerateCandidateFiles,
  listPublicFiles,
} from "./check-public-manifest.mjs";

const VALID_SOURCES = new Set(["export", "candidate", "committed"]);
const BLOB_ID = /^[0-9a-f]{40,64}$/iu;
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;
const GIT_TIMEOUT_MS = 15_000;
const decodeGitText = new TextDecoder("utf-8", { fatal: true });

export const isSafeInventoryPath = (filePath) =>
  typeof filePath === "string" &&
  filePath.length > 0 &&
  !filePath.includes("\\") &&
  !filePath.startsWith("/") &&
  ![...filePath].some((character) => {
    const code = character.codePointAt(0);
    return code !== undefined && (code <= 31 || code === 127);
  }) &&
  !filePath
    .split("/")
    .some((part) => part === "" || part === "." || part === "..");

export const parseSourceArguments = (args) => {
  let source = "export";
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    let value;
    if (argument.startsWith("--source="))
      value = argument.slice("--source=".length);
    else if (argument === "--source") {
      value = args[index + 1];
      if (!value || value.startsWith("--"))
        throw new Error("--source requires export, candidate, or committed");
      index += 1;
    } else throw new Error(`Unknown source argument: ${argument}`);
    if (!VALID_SOURCES.has(value))
      throw new Error(
        `Invalid source "${value}". Expected export, candidate, or committed.`,
      );
    source = value;
  }
  return { source };
};

const ensureDirectory = async (root) => {
  const stat = await lstat(root).catch((error) => {
    throw new Error(
      `Candidate root is not readable: ${root}: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  if (stat.isSymbolicLink() || !stat.isDirectory())
    throw new Error(`Candidate root must be a real directory: ${root}`);
};

const defaultRunGit = (args, cwd) =>
  spawnSync("git", args, {
    cwd,
    encoding: null,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    timeout: GIT_TIMEOUT_MS,
    killSignal: "SIGKILL",
    windowsHide: true,
  });

const gitResult = (result, action) => {
  if (result?.error) throw new Error(`Git ${action} could not run`);
  if (result?.status !== 0 || !Buffer.isBuffer(result?.stdout))
    throw new Error(`Git ${action} failed`);
  return result.stdout;
};

export const inventoryCommittedFiles = async ({
  root = process.cwd(),
  runGit = (args) => defaultRunGit(args, root),
} = {}) => {
  await ensureDirectory(root);
  const requestedRoot = await realpath(root);
  let gitTopLevel;
  try {
    gitTopLevel = decodeGitText
      .decode(
        gitResult(
          runGit(["rev-parse", "--show-toplevel"]),
          "repository root discovery",
        ),
      )
      .trim();
  } catch {
    throw new Error("Git repository root could not be verified");
  }
  if (!gitTopLevel)
    throw new Error("Git repository root could not be verified");
  let canonicalGitTopLevel;
  try {
    canonicalGitTopLevel = await realpath(gitTopLevel);
  } catch {
    throw new Error("Git repository root could not be verified");
  }
  if (canonicalGitTopLevel !== requestedRoot)
    throw new Error("Committed source root must be the Git repository root");
  const tree = gitResult(
    runGit(["ls-tree", "-rz", "--full-tree", "HEAD"]),
    "tree inventory",
  );
  if (tree.length === 0) throw new Error("Git committed inventory is empty");
  const blobs = new Map();
  let treeText;
  try {
    treeText = decodeGitText.decode(tree);
  } catch {
    throw new Error("Git committed inventory contains invalid UTF-8");
  }
  for (const entry of treeText.split("\0")) {
    if (!entry) continue;
    const match = /^(\d{6})\s+(\w+)\s+([0-9a-f]{40,64})\t(.+)$/iu.exec(entry);
    if (!match)
      throw new Error("Git committed inventory contains an invalid tree entry");
    const [, mode, type, blobId, filePath] = match;
    if (!isSafeInventoryPath(filePath))
      throw new Error("Git committed inventory contains an unsafe path");
    if (mode === "120000")
      throw new Error(
        `Git committed inventory contains a symlink: ${filePath}`,
      );
    if (mode === "160000")
      throw new Error(
        `Git committed inventory contains a submodule: ${filePath}`,
      );
    if (
      !new Set(["100644", "100755"]).has(mode) ||
      type !== "blob" ||
      !BLOB_ID.test(blobId)
    )
      throw new Error(
        `Git committed inventory contains a non-regular entry: ${filePath}`,
      );
    if (blobs.has(filePath))
      throw new Error("Git committed inventory contains duplicate paths");
    blobs.set(filePath, blobId);
  }
  if (blobs.size === 0) throw new Error("Git committed inventory is empty");
  const files = [...blobs.keys()].toSorted();
  return {
    source: "committed",
    files,
    readFile: async (filePath) => {
      if (!blobs.has(filePath))
        throw new Error("Committed file is not in the immutable inventory");
      const blobId = blobs.get(filePath);
      return gitResult(runGit(["cat-file", "blob", blobId]), "blob read");
    },
  };
};

export const inventorySource = async ({
  source = "export",
  root = process.cwd(),
} = {}) => {
  if (!VALID_SOURCES.has(source))
    throw new Error(
      `Invalid source "${source}". Expected export, candidate, or committed.`,
    );
  if (source === "committed") return inventoryCommittedFiles({ root });
  await ensureDirectory(root);
  const files = await enumerateCandidateFiles(root, {
    includeOmitted: source === "candidate",
  });
  const symlinkViolations = files.symlinkViolations ?? [];
  if (symlinkViolations.length > 0)
    throw new Error("Source inventory contains symlinks");
  const selected = source === "export" ? listPublicFiles(files) : [...files];
  if (selected.length === 0) throw new Error("Source inventory is empty");
  const resolvedRoot = path.resolve(root);
  return {
    source,
    files: selected,
    pathViolations:
      source === "candidate" ? (files.omittedDirectoryViolations ?? []) : [],
    readFile: async (filePath) => {
      if (!isSafeInventoryPath(filePath) || !selected.includes(filePath))
        throw new Error("Source file is not in the inventory");
      const absolutePath = path.resolve(resolvedRoot, ...filePath.split("/"));
      if (path.relative(resolvedRoot, absolutePath).startsWith(".."))
        throw new Error("Source file escapes the inventory root");
      const stat = await lstat(absolutePath);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error("Source inventory contains a non-regular file");
      return readFile(absolutePath);
    },
  };
};
