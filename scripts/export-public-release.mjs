#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import console from "node:console";
import { lstat, mkdir, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  auditTrackedFiles,
  classifyPath,
  enumerateCandidateFiles,
  listPublicFiles,
} from "./check-public-manifest.mjs";
import { inventorySource } from "./source-inventory.mjs";

const SOURCE_ROOT = path.resolve(process.cwd());
const KNOWN_PRIVATE_SIBLING_ROOTS = new Set([
  "doc-kosha-private",
  "doc-yantra",
]);

const shouldNormalizeCase = process.platform === "win32";

const comparablePath = (filePath) => {
  const resolved = path.resolve(filePath);
  return shouldNormalizeCase ? resolved.toLowerCase() : resolved;
};

const pathsEqual = (left, right) =>
  comparablePath(left) === comparablePath(right);

const isInside = (parent, child) => {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
};

const normalizeRelativePath = (filePath) =>
  filePath.replaceAll("\\", "/").replace(/^\.\//u, "");

export const isSafeRelativePath = (filePath) => {
  if (filePath.includes("\\")) return false;
  const normalized = normalizeRelativePath(filePath);
  return (
    normalized.length > 0 &&
    normalized !== "." &&
    !normalized.startsWith("/") &&
    !normalized.split("/").includes("..")
  );
};

export const isKnownPrivateSiblingDestination = (sourceRoot, destination) => {
  const siblingParent = path.dirname(path.resolve(sourceRoot));
  const relative = path.relative(siblingParent, path.resolve(destination));
  if (!relative || path.isAbsolute(relative)) return false;
  const [firstSegment] = relative.split(path.sep);
  if (!firstSegment) return false;
  const comparableSegment = shouldNormalizeCase
    ? firstSegment.toLowerCase()
    : firstSegment;
  return KNOWN_PRIVATE_SIBLING_ROOTS.has(comparableSegment);
};

export const parseExportArguments = (args) => {
  let destination;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument.startsWith("--destination=")) {
      if (destination)
        throw new Error("Destination was provided more than once");
      destination = argument.slice("--destination=".length);
      continue;
    }
    if (argument === "--destination") {
      if (destination)
        throw new Error("Destination was provided more than once");
      const value = args[index + 1];
      if (!value || value.startsWith("--"))
        throw new Error("An explicit destination is required");
      destination = value;
      index += 1;
      continue;
    }
    throw new Error("Unknown exporter argument");
  }
  if (!destination) throw new Error("An explicit destination is required");
  return { destination: path.resolve(destination) };
};

const readDestinationState = async (destination) => {
  try {
    const destinationStat = await lstat(destination);
    if (destinationStat.isSymbolicLink())
      throw new Error("The destination must not be a symlink");
    if (!destinationStat.isDirectory())
      throw new Error("The destination must be a directory");
    const entries = await readdir(destination);
    if (entries.length > 0) throw new Error("The destination must be empty");
    return "existing-empty";
  } catch (error) {
    if (error?.code === "ENOENT") return "missing";
    throw error;
  }
};

export const validateDestination = async (sourceRoot, destination) => {
  const resolvedSource = await realpath(sourceRoot);
  const resolvedDestination = path.resolve(destination);
  if (isKnownPrivateSiblingDestination(resolvedSource, resolvedDestination))
    throw new Error("The destination must not be a known private sibling");
  const parent = path.dirname(resolvedDestination);
  let resolvedParent;
  try {
    resolvedParent = await realpath(parent);
  } catch {
    throw new Error("The destination parent must already exist");
  }
  const destinationWithResolvedParent = path.join(
    resolvedParent,
    path.basename(resolvedDestination),
  );
  if (!pathsEqual(destinationWithResolvedParent, resolvedDestination))
    throw new Error("The destination path must not pass through a symlink");
  if (
    isKnownPrivateSiblingDestination(
      resolvedSource,
      destinationWithResolvedParent,
    )
  )
    throw new Error("The destination must not be a known private sibling");
  if (
    isInside(resolvedSource, destinationWithResolvedParent) ||
    isInside(destinationWithResolvedParent, resolvedSource)
  )
    throw new Error(
      "The destination must be separate from the current checkout",
    );
  const destinationState = await readDestinationState(resolvedDestination);
  let canonicalDestination = destinationWithResolvedParent;
  if (destinationState === "existing-empty") {
    canonicalDestination = await realpath(resolvedDestination);
    if (!pathsEqual(canonicalDestination, destinationWithResolvedParent))
      throw new Error("The destination identity changed during validation");
  }
  return {
    destination: resolvedDestination,
    canonicalParent: resolvedParent,
    canonicalDestination,
    destinationState,
    destinationWithResolvedParent,
  };
};

const revalidateDirectoryIdentity = async (directory, canonicalDirectory) => {
  let directoryStat;
  try {
    directoryStat = await lstat(directory);
  } catch (error) {
    if (error?.code === "ENOENT")
      throw new Error("A required destination directory is missing");
    throw new Error("A required destination directory could not be checked");
  }
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory())
    throw new Error("A required destination path is not a real directory");
  let actualDirectory;
  try {
    actualDirectory = await realpath(directory);
  } catch {
    throw new Error("A required destination directory could not be resolved");
  }
  if (!pathsEqual(actualDirectory, canonicalDirectory))
    throw new Error("A destination directory identity changed");
};

const ensureDestinationRoot = async ({
  destination,
  canonicalParent,
  canonicalDestination,
  destinationState,
}) => {
  await revalidateDirectoryIdentity(path.dirname(destination), canonicalParent);
  if (destinationState === "missing") {
    let destinationStat;
    try {
      destinationStat = await lstat(destination);
    } catch (error) {
      if (error?.code !== "ENOENT")
        throw new Error("The destination root could not be checked");
    }
    if (destinationStat)
      throw new Error("The destination root appeared during validation");
    try {
      await mkdir(destination);
    } catch {
      throw new Error("The destination root could not be created safely");
    }
  }
  await revalidateDirectoryIdentity(destination, canonicalDestination);
  let entries;
  try {
    entries = await readdir(destination);
  } catch {
    throw new Error("The destination root could not be checked");
  }
  if (entries.length > 0) throw new Error("The destination must be empty");
};

const ensureDestinationDirectory = async (
  destinationIdentity,
  relativeDirectory,
) => {
  const { destination, canonicalDestination } = destinationIdentity;
  await revalidateDirectoryIdentity(destination, canonicalDestination);
  const parts = relativeDirectory ? relativeDirectory.split("/") : [];
  let current = destination;
  let canonicalCurrent = canonicalDestination;
  for (const part of parts) {
    const parent = current;
    const canonicalParent = canonicalCurrent;
    current = path.join(parent, part);
    canonicalCurrent = path.join(canonicalParent, part);
    let exists = true;
    try {
      const directoryStat = await lstat(current);
      if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory())
        throw new Error("A required destination path is not a real directory");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      exists = false;
    }
    await revalidateDirectoryIdentity(parent, canonicalParent);
    if (!exists) {
      try {
        await mkdir(current);
      } catch {
        throw new Error("A destination directory could not be created safely");
      }
    }
    await revalidateDirectoryIdentity(current, canonicalCurrent);
  }
  return { directory: current, canonicalDirectory: canonicalCurrent };
};

const readSourceFile = async (sourcePath) => {
  const handle = await open(
    sourcePath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const sourceStat = await handle.stat();
    if (!sourceStat.isFile())
      throw new Error("A public candidate is not a regular file");
    return {
      contents: await handle.readFile(),
      mode: sourceStat.mode & 0o777,
    };
  } finally {
    await handle.close();
  }
};

const writeDestinationFile = async (
  destinationPath,
  contents,
  mode,
  parentIdentity,
) => {
  await revalidateDirectoryIdentity(
    parentIdentity.directory,
    parentIdentity.canonicalDirectory,
  );
  const handle = await open(
    destinationPath,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    mode,
  );
  try {
    await handle.writeFile(contents);
    await handle.chmod(mode);
  } finally {
    await handle.close();
  }
};

const addParentDirectories = (entries, relativePath) => {
  const parts = relativePath.split("/");
  for (let index = 1; index < parts.length; index += 1)
    entries.add(parts.slice(0, index).join("/"));
};

const inspectTree = async (rootDirectory) => {
  const files = [];
  const directories = [];
  const symlinks = [];
  const nonRegularEntries = [];
  const visit = async (directory, relativeDirectory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.toSorted((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const absolutePath = path.join(directory, entry.name);
      const entryStat = await lstat(absolutePath);
      if (entryStat.isSymbolicLink()) {
        symlinks.push(relativePath);
        continue;
      }
      if (entryStat.isDirectory()) {
        directories.push(relativePath);
        if (classifyPath(`${relativePath}/`) !== "OMIT")
          await visit(absolutePath, relativePath);
      } else if (entryStat.isFile()) files.push(relativePath);
      else nonRegularEntries.push(relativePath);
    }
  };
  await visit(rootDirectory, "");
  return {
    files: files.toSorted(),
    directories: directories.toSorted(),
    symlinks: symlinks.toSorted(),
    nonRegularEntries: nonRegularEntries.toSorted(),
  };
};

const manifestHash = (manifestEntries) => {
  const hash = createHash("sha256");
  for (const entry of manifestEntries)
    hash.update(`${entry.path}\0${entry.hash}\0${entry.bytes}\n`);
  return hash.digest("hex");
};

const verifyDestination = async (
  destination,
  expectedFiles,
  expectedManifest,
) => {
  const destinationCandidates = await enumerateCandidateFiles(destination, {
    includeOmitted: true,
  });
  const destinationSymlinks = destinationCandidates.symlinkViolations ?? [];
  const destinationPublicFiles = listPublicFiles(destinationCandidates);
  const destinationTree = await inspectTree(destination);
  const expectedFileSet = new Set(expectedFiles);
  const expectedDirectorySet = new Set();
  for (const filePath of expectedFiles)
    addParentDirectories(expectedDirectorySet, filePath);
  const unexpectedFiles = destinationTree.files.filter(
    (filePath) => !expectedFileSet.has(filePath),
  );
  const unexpectedDirectories = destinationTree.directories.filter(
    (directoryPath) => !expectedDirectorySet.has(directoryPath),
  );
  if (
    destinationSymlinks.length > 0 ||
    destinationTree.symlinks.length > 0 ||
    destinationTree.nonRegularEntries.length > 0 ||
    unexpectedFiles.length > 0 ||
    unexpectedDirectories.length > 0 ||
    destinationPublicFiles.length !== expectedFiles.length ||
    destinationPublicFiles.some(
      (filePath, index) => filePath !== expectedFiles[index],
    )
  )
    throw new Error(
      "The copied tree contains unexpected, excluded, or unsafe paths",
    );

  const audit = await auditTrackedFiles(
    destinationCandidates,
    async (filePath) => {
      const file = await readSourceFile(path.join(destination, filePath));
      return file.contents;
    },
    { source: "candidate" },
  );
  if (
    audit.pathViolations.length > 0 ||
    audit.contentViolations.length > 0 ||
    audit.scanErrors.length > 0
  )
    throw new Error("The copied tree failed the public manifest audit");

  const actualManifest = [];
  let totalBytes = 0;
  for (const filePath of expectedFiles) {
    const file = await readSourceFile(path.join(destination, filePath));
    const hash = createHash("sha256").update(file.contents).digest("hex");
    actualManifest.push({ path: filePath, hash, bytes: file.contents.length });
    totalBytes += file.contents.length;
  }
  if (manifestHash(actualManifest) !== manifestHash(expectedManifest))
    throw new Error("The copied tree failed its content hash verification");
  return { totalBytes, manifestHash: manifestHash(actualManifest) };
};

export const exportPublicRelease = async ({
  sourceRoot = SOURCE_ROOT,
  destination,
}) => {
  const validatedDestination = await validateDestination(
    sourceRoot,
    destination,
  );

  const sourceInventory = await inventorySource({
    source: "export",
    root: sourceRoot,
  });
  const publicFiles = sourceInventory.files;
  const expectedManifest = [];
  let totalBytes = 0;

  await ensureDestinationRoot(validatedDestination);
  for (const filePath of publicFiles) {
    if (!isSafeRelativePath(filePath) || classifyPath(filePath) !== "PUBLIC")
      throw new Error("The public manifest contains an unsafe path");
    const relativeDirectory = path.posix.dirname(filePath);
    const sourcePath = path.resolve(sourceRoot, ...filePath.split("/"));
    const destinationPath = path.resolve(
      validatedDestination.destination,
      ...filePath.split("/"),
    );
    if (
      !isInside(path.resolve(sourceRoot), sourcePath) ||
      !isInside(validatedDestination.destination, destinationPath)
    )
      throw new Error("The public manifest contains a path outside its root");
    const sourceStat = await lstat(sourcePath);
    if (sourceStat.isSymbolicLink() || !sourceStat.isFile())
      throw new Error("A public candidate is not a regular file");
    const parentIdentity = await ensureDestinationDirectory(
      validatedDestination,
      relativeDirectory === "." ? "" : relativeDirectory,
    );
    const sourceFile = await readSourceFile(sourcePath);
    const hash = createHash("sha256").update(sourceFile.contents).digest("hex");
    await revalidateDirectoryIdentity(
      validatedDestination.destination,
      validatedDestination.canonicalDestination,
    );
    await writeDestinationFile(
      destinationPath,
      sourceFile.contents,
      sourceFile.mode,
      parentIdentity,
    );
    expectedManifest.push({
      path: filePath,
      hash,
      bytes: sourceFile.contents.length,
    });
    totalBytes += sourceFile.contents.length;
  }

  const verification = await verifyDestination(
    validatedDestination.destination,
    publicFiles,
    expectedManifest,
  );
  return {
    files: publicFiles.length,
    bytes: verification.totalBytes,
    manifestHash: verification.manifestHash,
    sourceBytes: totalBytes,
  };
};

const main = async () => {
  const { destination } = parseExportArguments(process.argv.slice(2));
  const result = await exportPublicRelease({ destination });
  console.log("Public release export: PASS");
  console.log(`Files: ${result.files}`);
  console.log(`Bytes: ${result.bytes}`);
  console.log(`Manifest SHA-256: ${result.manifestHash}`);
};

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(
      `Public release export failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
