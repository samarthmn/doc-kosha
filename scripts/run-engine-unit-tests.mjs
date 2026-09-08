#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import console from "node:console";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { PRIVATE_SAMPLE_ENGINE_TEST_PATHS } from "./private-sample-test-policy.mjs";

const checkoutEngineTestDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "tests",
  "unit",
  "engine",
);

const TAP_SKIP_LINE_PATTERN = /^(?:not )?ok \d+ - .*? # SKIP(?: (.*))?$/u;

// These are the complete reasons emitted by the existing fixture tests. The
// dynamic portions are bounded to the fixtures/extensions those tests own;
// provider loading, capability, and arbitrary skips are not represented.
const ALLOWED_SKIP_REASON_PATTERNS = [
  /^font CDN degraded \(font_unresolved\) — (?:[1-4]\.docx corpus conversion requires CDN font resolution|(?:docx|pptx|xlsx|xlsm) routing requires CDN font resolution|(?:explicit Arabic bidi paragraph|multi-scalar combining cluster|standalone decomposed combining cluster|standalone plain Latin width control|adjacent direct and combining runs|combining run before direct run|single mixed Latin and Arabic fallback run|Arabic Extended-A combining marks|plain Arabic width control|common Arabic combining marks|Hebrew combining marks) semantic-text conversion requires CDN font resolution|Office worker smoke conversion requires CDN font resolution|adapter availability smoke conversion requires CDN font resolution|CJK conversion requires CDN font resolution|wrapped RTL conversion requires CDN font resolution|30 MiB Office conversion requires CDN font resolution|converted DOCX watermark requires CDN font resolution)$/u,
  /^unexpected external font fetch \([1-9]\d* failed fetches\) — (?:conversion unavailable|byte golden requires the installed font set)$/u,
];

const normalizeTapWhitespace = (value) => value.trim().replace(/[ \t]+/gu, " ");

export const extractTapSkipReason = (line) => {
  if (typeof line !== "string") return null;
  const match = normalizeTapWhitespace(line).match(TAP_SKIP_LINE_PATTERN);
  return match?.[1] ?? null;
};

export const isAllowedTapSkipLine = (line) => {
  const reason = extractTapSkipReason(line);
  return (
    reason !== null &&
    ALLOWED_SKIP_REASON_PATTERNS.some((pattern) => pattern.test(reason))
  );
};

export const discoverEngineUnitTestFiles = (
  directory = checkoutEngineTestDirectory,
  { selection = "public" } = {},
) => {
  if (!["public", "private-samples"].includes(selection)) {
    throw new Error(`Unknown engine test selection: ${selection}`);
  }
  const discoveredNames = readdirSync(directory)
    .filter(
      (fileName) =>
        fileName.endsWith(".test.ts") || fileName.endsWith(".test.mjs"),
    )
    .sort();
  const privateNames = PRIVATE_SAMPLE_ENGINE_TEST_PATHS.map((filePath) =>
    path.basename(filePath),
  );
  const privateNameSet = new Set(privateNames);
  if (selection === "private-samples") {
    const discoveredNameSet = new Set(discoveredNames);
    const missingNames = privateNames.filter(
      (fileName) => !discoveredNameSet.has(fileName),
    );
    if (missingNames.length > 0) {
      throw new Error(
        `Private sample engine test files are missing: ${missingNames.join(", ")}`,
      );
    }
    return privateNames.map((fileName) => path.join(directory, fileName));
  }
  return discoveredNames
    .filter((fileName) => !privateNameSet.has(fileName))
    .map((fileName) => path.join(directory, fileName));
};

export const parseEngineTestArguments = (args) => {
  if (args.length === 0) return { selection: "public" };
  if (args.length === 1 && args[0] === "--private-samples") {
    return { selection: "private-samples" };
  }
  throw new Error(`Unknown engine test argument: ${args[0] ?? ""}`);
};

export const getChildProcessStatus = (result) => {
  if (result.error) {
    throw new Error(
      `Engine unit test process could not start: ${result.error.message}`,
    );
  }
  if (result.signal) {
    throw new Error(
      `Engine unit test process ended on signal ${result.signal}`,
    );
  }
  return result.status ?? 1;
};

export const assertEngineTestReport = (stdout, stderr) => {
  if (!/(?:^|\n)TAP version 13(?:\n|$)/u.test(`${stdout}\n${stderr}`)) {
    throw new Error(
      "Engine unit test process produced no TAP report; the test child may not have started.",
    );
  }
};

export const runEngineUnitGate = async ({
  selection = "public",
  testDirectory = checkoutEngineTestDirectory,
  checkoutRoot = process.cwd(),
} = {}) => {
  let createProvider;
  try {
    ({ createProvider } =
      await import("@samarthmn/dockosha-provider-docyantra"));
    const provider = createProvider();
    if (provider.id !== "docyantra") {
      throw new Error(`Unexpected engine provider id: ${provider.id}`);
    }
  } catch (error) {
    console.error(
      "Private DocYantra access is required. Install the locked private packages in the DocKosha checkout and authenticate to GitHub Packages.",
    );
    console.error(
      error instanceof Error
        ? `Provider initialization failed: ${error.message}`
        : "Provider initialization failed.",
    );
    return 1;
  }

  const engineTestDirectory = testDirectory;
  let testFiles;
  try {
    testFiles = discoverEngineUnitTestFiles(engineTestDirectory, { selection });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--test",
      "--test-reporter=tap",
      "--test-concurrency=1",
      ...testFiles,
    ],
    {
      cwd: checkoutRoot,
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  process.stdout.write(stdout);
  process.stderr.write(stderr);

  let status;
  try {
    status = getChildProcessStatus(result);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  if (status !== 0) {
    return status;
  }

  try {
    assertEngineTestReport(stdout, stderr);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  // Provider loading and capability coverage are assertions in the suite and
  // must fail; an unrecognised skip must never make the gate green. The only
  // accepted skips are the documented fixture-level external-font cases.
  const unexpectedSkips = `${stdout}\n${stderr}`
    .split(/\r?\n/u)
    .filter((line) => /# SKIP\b/u.test(line))
    .filter((line) => !isAllowedTapSkipLine(line));

  if (unexpectedSkips.length > 0) {
    console.error(
      `Engine unit gate found unexpected TAP skip(s):\n${unexpectedSkips.join("\n")}`,
    );
    return 1;
  }

  return 0;
};

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  try {
    const options = parseEngineTestArguments(process.argv.slice(2));
    process.exitCode = await runEngineUnitGate(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
