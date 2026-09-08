#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import console from "node:console";
import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const ALLOWED_LICENSES = new Set([
  "MIT",
  "MIT-0",
  "ISC",
  "Zlib",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "0BSD",
  "Unlicense",
  "CC0",
  "CC0-1.0",
  "OFL-1.1",
  "Python-2.0",
  "BlueOak-1.0.0",
]);

const normalizeLicenseValue = (license) => {
  if (typeof license === "string") {
    return license.trim();
  }

  if (Array.isArray(license)) {
    return license
      .map((value) => normalizeLicenseValue(value))
      .filter(Boolean)
      .join(" OR ");
  }

  if (license && typeof license === "object" && "type" in license) {
    return normalizeLicenseValue(license.type);
  }

  return "";
};

const reviewReason = (license) => {
  if (!license || /^(?:UNKNOWN|UNLICENSED|NONE|NOASSERTION)$/iu.test(license)) {
    return "license metadata is missing or explicitly unlicensed";
  }

  if (/\b(?:AGPL|GPL|LGPL)(?:[-\s.]|$)/iu.test(license)) {
    return "copyleft terms require distribution-obligation review";
  }

  if (/\b(?:MPL|EPL|CDDL)(?:[-\s.]|$)/iu.test(license)) {
    return "weak-copyleft terms need file-level obligation review";
  }

  if (/\b(?:SSPL|BUSL)(?:[-\s.]|$)/iu.test(license)) {
    return "source-available terms require distribution-policy review";
  }

  return "license is unknown or absent from the documented dependency policy allowlist";
};

const ALLOWED_LICENSES_LOWERCASE = new Set(
  [...ALLOWED_LICENSES].map((license) => license.toLowerCase()),
);

const parseLicenseExpression = (license) => {
  const tokens =
    license.match(/\(|\)|\bAND\b|\bOR\b|\bWITH\b|[^\s()]+/giu) ?? [];
  let cursor = 0;

  const parsePrimary = () => {
    const token = tokens[cursor];
    if (!token) {
      return null;
    }

    if (token === "(") {
      cursor += 1;
      const expression = parseOr();
      if (!expression || tokens[cursor] !== ")") {
        return null;
      }
      cursor += 1;
      return expression;
    }

    if (token === ")" || /^(?:AND|OR|WITH)$/iu.test(token)) {
      return null;
    }

    cursor += 1;
    return {
      allowed: ALLOWED_LICENSES_LOWERCASE.has(token.toLowerCase()),
      hasChoice: false,
    };
  };

  const parseWith = () => {
    const left = parsePrimary();
    if (!left) {
      return null;
    }

    if (tokens[cursor]?.toUpperCase() !== "WITH") {
      return left;
    }

    cursor += 1;
    const exception = parsePrimary();
    if (!exception) {
      return null;
    }

    // Exceptions are not included in the documented dependency policy list.
    return { allowed: false, hasChoice: left.hasChoice || exception.hasChoice };
  };

  const parseAnd = () => {
    let result = parseWith();
    if (!result) {
      return null;
    }

    while (tokens[cursor]?.toUpperCase() === "AND") {
      cursor += 1;
      const right = parseWith();
      if (!right) {
        return null;
      }
      result = {
        allowed: result.allowed && right.allowed,
        hasChoice: result.hasChoice || right.hasChoice,
      };
    }
    return result;
  };

  const parseOr = () => {
    let result = parseAnd();
    if (!result) {
      return null;
    }

    while (tokens[cursor]?.toUpperCase() === "OR") {
      cursor += 1;
      const right = parseAnd();
      if (!right) {
        return null;
      }
      result = {
        allowed: result.allowed || right.allowed,
        hasChoice: true,
      };
    }
    return result;
  };

  const expression = parseOr();
  return expression && cursor === tokens.length ? expression : null;
};

// Human-reviewed decisions for packages whose license is not blanket-allowed.
// Keyed by package name; the value is the exact license expression the review
// covered, so a changed license string re-opens the review while version
// bumps do not.
export const REVIEWED_LICENSE_DECISIONS = new Map([
  // DocYantra is DocKosha's first-party conversion engine. Core, Office, and
  // adapter packages are consumed under AGPL-3.0-only. The fonts package is
  // the exact reviewed dual expression: AGPL wrapper and OFL font binaries.
  // A different SPDX string reopens review; this is not a wildcard allow.
  ["@samarthmn/doc-yantra", "AGPL-3.0-only"],
  ["@samarthmn/doc-yantra-office", "AGPL-3.0-only"],
  ["@samarthmn/doc-yantra-fonts", "AGPL-3.0-only AND OFL-1.1"],
  ["@samarthmn/dockosha-provider-docyantra", "AGPL-3.0-only"],
  // lightningcss ships unmodified as part of the Tailwind CSS toolchain; its
  // platform packages are reviewed together under the same MPL-2.0 expression.
  ["lightningcss", "MPL-2.0"],
  ["lightningcss-android-arm64", "MPL-2.0"],
  ["lightningcss-darwin-arm64", "MPL-2.0"],
  ["lightningcss-darwin-x64", "MPL-2.0"],
  ["lightningcss-freebsd-x64", "MPL-2.0"],
  ["lightningcss-linux-arm-gnueabihf", "MPL-2.0"],
  ["lightningcss-linux-arm64-gnu", "MPL-2.0"],
  ["lightningcss-linux-arm64-musl", "MPL-2.0"],
  ["lightningcss-linux-x64-gnu", "MPL-2.0"],
  ["lightningcss-linux-x64-musl", "MPL-2.0"],
  ["lightningcss-win32-arm64-msvc", "MPL-2.0"],
  ["lightningcss-win32-x64-msvc", "MPL-2.0"],
  // libvips is distributed as replaceable LGPL platform artifacts. The
  // selected artifact's notices and applicable obligations remain required.
  ["@img/sharp-libvips-darwin-arm64", "LGPL-3.0-or-later"],
  ["@img/sharp-libvips-darwin-x64", "LGPL-3.0-or-later"],
  ["@img/sharp-libvips-linux-arm64", "LGPL-3.0-or-later"],
  ["@img/sharp-libvips-linux-arm", "LGPL-3.0-or-later"],
  ["@img/sharp-libvips-linux-ppc64", "LGPL-3.0-or-later"],
  ["@img/sharp-libvips-linux-riscv64", "LGPL-3.0-or-later"],
  ["@img/sharp-libvips-linux-s390x", "LGPL-3.0-or-later"],
  ["@img/sharp-libvips-linux-x64", "LGPL-3.0-or-later"],
  ["@img/sharp-libvips-linuxmusl-arm64", "LGPL-3.0-or-later"],
  ["@img/sharp-libvips-linuxmusl-x64", "LGPL-3.0-or-later"],
  // Sentry CLI is an FSL build tool only; it uploads sourcemaps and is not
  // part of the application runtime. Record every lockfile platform variant.
  ["@sentry/cli-darwin", "FSL-1.1-MIT"],
  ["@sentry/cli-linux-arm64", "FSL-1.1-MIT"],
  ["@sentry/cli-linux-arm", "FSL-1.1-MIT"],
  ["@sentry/cli-linux-i686", "FSL-1.1-MIT"],
  ["@sentry/cli-linux-x64", "FSL-1.1-MIT"],
  ["@sentry/cli-win32-arm64", "FSL-1.1-MIT"],
  ["@sentry/cli-win32-i686", "FSL-1.1-MIT"],
  ["@sentry/cli-win32-x64", "FSL-1.1-MIT"],
  ["@sentry/cli", "FSL-1.1-MIT"],
  // Browser-support data tables consumed by the build toolchain
  // (browserslist); attribution travels inside the package. Not application
  // code.
  ["caniuse-lite", "CC-BY-4.0"],
]);

export const classifyLicense = (rawLicense, packageName) => {
  const decidedLicense = packageName
    ? REVIEWED_LICENSE_DECISIONS.get(packageName)
    : undefined;
  if (
    decidedLicense !== undefined &&
    normalizeLicenseValue(rawLicense) === decidedLicense
  ) {
    return {
      classification: "ALLOWED",
      reason: "human-reviewed decision recorded in REVIEWED_LICENSE_DECISIONS",
    };
  }
  return classifyLicenseExpressionOnly(rawLicense);
};

const classifyLicenseExpressionOnly = (rawLicense) => {
  const license = normalizeLicenseValue(rawLicense);
  if (ALLOWED_LICENSES_LOWERCASE.has(license.toLowerCase())) {
    return {
      classification: "ALLOWED",
      reason: "license is on the documented dependency policy allowlist",
    };
  }

  const expression = parseLicenseExpression(license);
  if (expression?.allowed) {
    return {
      classification: "ALLOWED",
      reason: expression.hasChoice
        ? "a documented dependency policy choice is available"
        : "all license terms are on the documented dependency policy allowlist",
    };
  }

  return {
    classification: "REVIEW",
    reason: reviewReason(license),
  };
};

const sortPackages = (packages) =>
  packages.toSorted(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.version.localeCompare(right.version) ||
      left.license.localeCompare(right.license),
  );

const deduplicatePackages = (packages) => {
  const seen = new Set();
  return packages.filter((dependency) => {
    const key = `${dependency.name}\0${dependency.version}\0${dependency.license}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const parsePnpmLicenseReport = (report) => {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("pnpm license report must be an object");
  }
  const groups = Object.entries(report);
  if (groups.length === 0) {
    throw new Error("pnpm license report is empty");
  }
  const packages = [];

  for (const [licenseGroup, entries] of groups) {
    if (!Array.isArray(entries)) {
      throw new Error(`pnpm license group ${licenseGroup} is malformed`);
    }

    for (const entry of entries) {
      if (
        !entry ||
        typeof entry !== "object" ||
        typeof entry.name !== "string" ||
        !entry.name.trim()
      ) {
        throw new Error(
          `pnpm license entry in ${licenseGroup} is missing a name`,
        );
      }

      const versions = Array.isArray(entry.versions)
        ? entry.versions
        : [entry.version ?? "UNKNOWN"];
      if (
        versions.length === 0 ||
        versions.some(
          (version) => typeof version !== "string" || !version.trim(),
        )
      ) {
        throw new Error(
          `pnpm license entry ${entry.name} has malformed versions`,
        );
      }
      const license = normalizeLicenseValue(entry.license) || licenseGroup;
      for (const version of versions) {
        packages.push({
          name: entry.name,
          version: String(version),
          license,
        });
      }
    }
  }

  const normalizedPackages = sortPackages(deduplicatePackages(packages));
  if (normalizedPackages.length === 0) {
    throw new Error("pnpm license report has no package records");
  }
  return normalizedPackages;
};

export const runPnpmLicenseCommand = ({ executor = spawnSync } = {}) => {
  const command = executor("pnpm", ["licenses", "list", "--prod", "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
    killSignal: "SIGKILL",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (command.error) {
    throw new Error(command.error.message);
  }

  if (command.status !== 0) {
    const detail = command.stderr.trim() || `exit status ${command.status}`;
    throw new Error(detail);
  }

  try {
    if (typeof command.stdout !== "string" || !command.stdout.trim()) {
      throw new Error("pnpm returned an empty license report");
    }
    return parsePnpmLicenseReport(JSON.parse(command.stdout));
  } catch (error) {
    throw new Error(
      `pnpm returned invalid license JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

const dependencyReference = (value) => {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && typeof value.version === "string") {
    return value.version;
  }

  return "";
};

const packageVersionFromReference = (reference) => {
  const withoutPeers = reference.split("(")[0];
  if (withoutPeers.startsWith("npm:")) {
    return withoutPeers.slice(withoutPeers.lastIndexOf("@") + 1);
  }
  return withoutPeers;
};

const resolveSnapshotKey = (snapshots, name, reference) => {
  if (
    !reference ||
    /^(?:link|file|workspace):/u.test(reference) ||
    reference.startsWith("/")
  ) {
    return null;
  }

  const directKey = `${name}@${reference}`;
  if (Object.hasOwn(snapshots, directKey)) {
    return directKey;
  }

  const version = packageVersionFromReference(reference);
  const versionPrefix = `${name}@${version}`;
  return (
    Object.keys(snapshots).find(
      (key) => key === versionPrefix || key.startsWith(`${versionPrefix}(`),
    ) ?? null
  );
};

export const collectProductionPairs = (lockfile) => {
  const importer = lockfile.importers?.["."];
  const snapshots = lockfile.snapshots ?? {};
  if (!importer || typeof importer !== "object") {
    throw new Error("pnpm-lock.yaml does not contain the root importer");
  }

  const queue = [];
  for (const [dependencyMap, required] of [
    [importer.dependencies, true],
    [importer.optionalDependencies, false],
  ]) {
    for (const [name, value] of Object.entries(dependencyMap ?? {})) {
      queue.push([name, dependencyReference(value), required]);
    }
  }

  const visitedSnapshots = new Map();
  const pairs = new Map();
  while (queue.length > 0) {
    const [name, reference, required] = queue.shift();
    if (required && (!name || !reference)) {
      throw new Error(
        "pnpm-lock.yaml contains an unresolved required dependency reference",
      );
    }
    const snapshotKey = resolveSnapshotKey(snapshots, name, reference);
    const version = packageVersionFromReference(reference);
    if (required && (!version || !snapshotKey)) {
      throw new Error(
        `pnpm-lock.yaml cannot resolve required dependency ${name}@${reference}`,
      );
    }
    if (name && version) {
      const pair = `${name}\0${version}`;
      pairs.set(pair, (pairs.get(pair) ?? false) || required);
    }

    const previousRequirement = visitedSnapshots.get(snapshotKey);
    if (
      !snapshotKey ||
      previousRequirement === true ||
      previousRequirement === required
    ) {
      continue;
    }
    visitedSnapshots.set(
      snapshotKey,
      (previousRequirement ?? false) || required,
    );

    const snapshot = snapshots[snapshotKey];
    for (const [dependencyMap, dependencyRequired] of [
      [snapshot?.dependencies, required],
      [snapshot?.optionalDependencies, false],
    ]) {
      for (const [childName, childReference] of Object.entries(
        dependencyMap ?? {},
      )) {
        queue.push([
          childName,
          dependencyReference(childReference),
          dependencyRequired,
        ]);
      }
    }
  }

  return pairs;
};

const readPackageMetadata = async (packageDirectory) => {
  try {
    const manifest = JSON.parse(
      await readFile(path.join(packageDirectory, "package.json"), "utf8"),
    );
    if (
      typeof manifest.name !== "string" ||
      typeof manifest.version !== "string"
    ) {
      return null;
    }

    return {
      name: manifest.name,
      version: manifest.version,
      license:
        normalizeLicenseValue(manifest.license ?? manifest.licenses) ||
        "UNKNOWN",
    };
  } catch {
    return null;
  }
};

export const collectInstalledPackageMetadata = async (
  modulesDirectory = path.join(process.cwd(), "node_modules"),
) => {
  const metadata = new Map();
  const visitedModuleDirectories = new Set();
  const visitedPackageDirectories = new Set();
  const visitedScopeDirectories = new Set();

  const canonicalDirectory = async (directory) => {
    try {
      return await realpath(directory);
    } catch {
      return null;
    }
  };

  const addPackageMetadata = (packageMetadata) => {
    if (!packageMetadata) {
      return;
    }
    metadata.set(
      `${packageMetadata.name}\0${packageMetadata.version}`,
      packageMetadata,
    );
  };

  const visitPackageDirectory = async (packageDirectory) => {
    const canonical = await canonicalDirectory(packageDirectory);
    if (!canonical || visitedPackageDirectories.has(canonical)) {
      return;
    }
    visitedPackageDirectories.add(canonical);

    addPackageMetadata(await readPackageMetadata(packageDirectory));
    await visitModulesDirectory(path.join(packageDirectory, "node_modules"));
  };

  const visitScopeDirectory = async (scopeDirectory) => {
    const canonical = await canonicalDirectory(scopeDirectory);
    if (!canonical || visitedScopeDirectories.has(canonical)) {
      return;
    }
    visitedScopeDirectories.add(canonical);

    let scopedEntries;
    try {
      scopedEntries = await readdir(scopeDirectory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const scopedEntry of scopedEntries) {
      if (
        scopedEntry.name.startsWith(".") ||
        (!scopedEntry.isDirectory() && !scopedEntry.isSymbolicLink())
      ) {
        continue;
      }
      await visitPackageDirectory(path.join(scopeDirectory, scopedEntry.name));
    }
  };

  const visitPnpmStore = async (storeDirectory) => {
    const canonical = await canonicalDirectory(storeDirectory);
    if (!canonical || visitedScopeDirectories.has(canonical)) {
      return;
    }
    visitedScopeDirectories.add(canonical);

    let storeEntries;
    try {
      storeEntries = await readdir(storeDirectory, { withFileTypes: true });
    } catch {
      return;
    }

    await visitModulesDirectory(path.join(storeDirectory, "node_modules"));
    for (const storeEntry of storeEntries) {
      if (
        storeEntry.name === "node_modules" ||
        (!storeEntry.isDirectory() && !storeEntry.isSymbolicLink())
      ) {
        continue;
      }
      await visitModulesDirectory(
        path.join(storeDirectory, storeEntry.name, "node_modules"),
      );
    }
  };

  const visitModulesDirectory = async (directory) => {
    const canonical = await canonicalDirectory(directory);
    if (!canonical || visitedModuleDirectories.has(canonical)) {
      return;
    }
    visitedModuleDirectories.add(canonical);

    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === ".pnpm") {
        if (entry.isDirectory() || entry.isSymbolicLink()) {
          await visitPnpmStore(path.join(directory, entry.name));
        }
        continue;
      }
      if (
        entry.name.startsWith(".") ||
        (!entry.isDirectory() && !entry.isSymbolicLink())
      ) {
        continue;
      }
      const entryPath = path.join(directory, entry.name);
      if (entry.name.startsWith("@")) {
        await visitScopeDirectory(entryPath);
      } else {
        await visitPackageDirectory(entryPath);
      }
    }
  };

  await visitModulesDirectory(modulesDirectory);
  return metadata;
};

const decodeYamlScalar = (value) => {
  const trimmed = value.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(trimmed);
  }
  return trimmed;
};

const parseYamlEntry = (line) => {
  const trimmed = line.trim();
  let separator = -1;
  let quote = null;

  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (quote === "'" && character === "'" && trimmed[index + 1] === "'") {
      index += 1;
      continue;
    }
    if (quote && character === quote) {
      quote = null;
      continue;
    }
    if (!quote && (character === "'" || character === '"')) {
      quote = character;
      continue;
    }
    if (!quote && character === ":") {
      separator = index;
      break;
    }
  }

  if (separator < 0) {
    return null;
  }

  return {
    key: decodeYamlScalar(trimmed.slice(0, separator)),
    value: decodeYamlScalar(trimmed.slice(separator + 1)),
  };
};

export const parsePnpmLockfile = (contents) => {
  const lockfile = { importers: {}, snapshots: {} };
  let section = null;
  let importer = null;
  let importerDependencyType = null;
  let importerDependency = null;
  let snapshot = null;
  let snapshotDependencyType = null;

  for (const line of contents.split(/\r?\n/u)) {
    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue;
    }

    const indent = line.length - line.trimStart().length;
    const entry = parseYamlEntry(line);
    if (!entry) {
      continue;
    }

    if (indent === 0) {
      section = ["importers", "snapshots"].includes(entry.key)
        ? entry.key
        : null;
      importer = null;
      snapshot = null;
      continue;
    }

    if (section === "importers") {
      if (indent === 2) {
        importer = entry.key;
        lockfile.importers[importer] = {};
        importerDependencyType = null;
        importerDependency = null;
        continue;
      }

      if (importer !== ".") {
        continue;
      }

      if (indent === 4) {
        importerDependencyType = [
          "dependencies",
          "optionalDependencies",
        ].includes(entry.key)
          ? entry.key
          : null;
        if (importerDependencyType) {
          lockfile.importers[importer][importerDependencyType] = {};
        }
        importerDependency = null;
        continue;
      }

      if (indent === 6 && importerDependencyType) {
        importerDependency = entry.key;
        lockfile.importers[importer][importerDependencyType][
          importerDependency
        ] = {};
        continue;
      }

      if (
        indent === 8 &&
        entry.key === "version" &&
        importerDependencyType &&
        importerDependency
      ) {
        lockfile.importers[importer][importerDependencyType][
          importerDependency
        ].version = entry.value;
      }
      continue;
    }

    if (section === "snapshots") {
      if (indent === 2) {
        snapshot = entry.key;
        lockfile.snapshots[snapshot] = {};
        snapshotDependencyType = null;
        continue;
      }

      if (indent === 4) {
        snapshotDependencyType = [
          "dependencies",
          "optionalDependencies",
        ].includes(entry.key)
          ? entry.key
          : null;
        if (snapshotDependencyType) {
          lockfile.snapshots[snapshot][snapshotDependencyType] = {};
        }
        continue;
      }

      if (indent === 6 && snapshot && snapshotDependencyType) {
        lockfile.snapshots[snapshot][snapshotDependencyType][entry.key] =
          entry.value;
      }
    }
  }

  return lockfile;
};

const runLockfileFallback = async ({
  lockfileText,
  installedPackages,
} = {}) => {
  const [sourceLockfileText, metadata] = await Promise.all([
    lockfileText ??
      readFile(path.join(process.cwd(), "pnpm-lock.yaml"), "utf8"),
    installedPackages ?? collectInstalledPackageMetadata(),
  ]);
  const productionPairs = collectProductionPairs(
    parsePnpmLockfile(sourceLockfileText),
  );
  const packages = [];

  for (const [pair, required] of productionPairs) {
    const installed = metadata.get(pair);
    if (installed) {
      packages.push(installed);
      continue;
    }

    if (!required) {
      continue;
    }

    const [name, version] = pair.split("\0");
    packages.push({ name, version, license: "UNKNOWN" });
  }

  return sortPackages(deduplicatePackages(packages));
};

const validateProductionCoverage = (packages, lockfileText) => {
  const productionPairs = collectProductionPairs(
    parsePnpmLockfile(lockfileText),
  );
  const availablePairs = new Set(
    packages.map((dependency) => `${dependency.name}\0${dependency.version}`),
  );
  const missing = [...productionPairs]
    .filter(([pair, required]) => required && !availablePairs.has(pair))
    .map(([pair]) => pair.replace("\0", "@"));
  if (missing.length > 0) {
    throw new Error(
      `pnpm license report omitted required production packages: ${missing.join(", ")}`,
    );
  }
};

export const auditLicenses = async ({
  commandExecutor,
  lockfileText,
  installedPackages,
} = {}) => {
  let packages;
  let method = "pnpm licenses list --prod --json";
  let fallbackReason = null;

  try {
    packages = runPnpmLicenseCommand({ executor: commandExecutor });
    const sourceLockfile =
      lockfileText ??
      (await readFile(path.join(process.cwd(), "pnpm-lock.yaml"), "utf8"));
    validateProductionCoverage(packages, sourceLockfile);
  } catch (error) {
    fallbackReason = error instanceof Error ? error.message : String(error);
    method = "pnpm-lock.yaml + installed node_modules package.json fallback";
    packages = await runLockfileFallback({ lockfileText, installedPackages });
  }

  const reviewedPackages = packages.map((dependency) => ({
    ...dependency,
    ...classifyLicense(dependency.license, dependency.name),
  }));
  const review = reviewedPackages.filter(
    ({ classification }) => classification === "REVIEW",
  );

  return {
    status: review.length > 0 ? "review" : "pass",
    method,
    fallbackReason,
    packageCount: reviewedPackages.length,
    allowedCount: reviewedPackages.length - review.length,
    reviewCount: review.length,
    review,
  };
};

const parseArguments = (args) => {
  let json = false;
  for (const argument of args) {
    if (argument === "--json") {
      json = true;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return { json };
};

const printReport = (report) => {
  console.log(
    `Dependency license audit: ${report.status === "pass" ? "PASS" : "REVIEW"}`,
  );
  console.log(`Source: ${report.method}`);
  if (report.fallbackReason) {
    console.log(
      `Fallback used because pnpm license reporting failed: ${report.fallbackReason}`,
    );
  }
  console.log(`Production package versions: ${report.packageCount}`);
  console.log(`ALLOWED: ${report.allowedCount}`);
  console.log(`REVIEW: ${report.reviewCount}`);

  if (report.review.length > 0) {
    console.log("\nPackages requiring review:");
    for (const dependency of report.review) {
      console.log(
        `  ${dependency.name}@${dependency.version} — ${dependency.license} — ${dependency.reason}`,
      );
    }
  }
};

const main = async () => {
  const { json } = parseArguments(process.argv.slice(2));
  const report = await auditLicenses();
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  if (report.status !== "pass") {
    process.exitCode = 1;
  }
};

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";

if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(
      `Dependency license audit could not run: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 2;
  });
}
