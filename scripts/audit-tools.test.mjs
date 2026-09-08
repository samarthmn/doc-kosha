import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import {
  auditTrackedFiles,
  classifyPath,
  enumerateCandidateFiles,
  formatListViolation,
  isProbablyBinary,
  listPublicFiles,
  parseAuditArguments,
} from "./check-public-manifest.mjs";
import {
  inventoryCommittedFiles,
  inventorySource,
  parseSourceArguments,
} from "./source-inventory.mjs";
import {
  classifyLicense,
  collectInstalledPackageMetadata,
  collectProductionPairs,
  parsePnpmLockfile,
  parsePnpmLicenseReport,
} from "./check-licenses.mjs";
import {
  isKnownPrivateSiblingDestination,
  isSafeRelativePath,
  parseExportArguments,
} from "./export-public-release.mjs";
import * as engineTestRunner from "./run-engine-unit-tests.mjs";
import {
  collectPublicFiles,
  runGitleaks,
  stageInventoryFiles,
  stagePublicFiles,
} from "./run-gitleaks.mjs";

const taskTmpRoot = path.join(process.cwd(), "tmp");
const taskTmpRootExisted = existsSync(taskTmpRoot);

const cleanupOwnedEmptyTmpRoot = (tmpRoot, existedInitially) => {
  if (existedInitially) return;
  try {
    rmdirSync(tmpRoot);
  } catch {
    // Preserve any files another process created while this suite ran.
  }
};

test.after(() => {
  cleanupOwnedEmptyTmpRoot(taskTmpRoot, taskTmpRootExisted);
});

test("audit scratch cleanup removes only an owned empty tmp parent", () => {
  const fixtureRoot = path.join(
    process.cwd(),
    "tmp",
    `audit-scratch-cleanup-${process.pid}`,
  );
  const ownedTmpRoot = path.join(fixtureRoot, "owned", "tmp");
  const preexistingTmpRoot = path.join(fixtureRoot, "preexisting", "tmp");
  mkdirSync(ownedTmpRoot, { recursive: true });
  mkdirSync(preexistingTmpRoot, { recursive: true });

  try {
    cleanupOwnedEmptyTmpRoot(ownedTmpRoot, false);
    cleanupOwnedEmptyTmpRoot(preexistingTmpRoot, true);
    assert.equal(existsSync(ownedTmpRoot), false);
    assert.equal(existsSync(preexistingTmpRoot), true);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

const EXPECTED_PRIVATE_SAMPLE_BROWSER_TEST_PATHS = [
  "tests/e2e/cjk-office-conversion.spec.ts",
  "tests/e2e/core-product-flow.spec.ts",
  "tests/e2e/document-conversion.spec.ts",
  "tests/e2e/document-lifecycle-fixes.spec.ts",
  "tests/e2e/document-redaction.spec.ts",
  "tests/e2e/free-plan-limits.spec.ts",
  "tests/e2e/public-viewer-chunk-resilience.spec.ts",
];

const EXPECTED_PRIVATE_SAMPLE_ENGINE_TEST_PATHS = [
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

const EXPECTED_PRIVATE_SAMPLE_TEST_PATHS = [
  ...EXPECTED_PRIVATE_SAMPLE_BROWSER_TEST_PATHS,
  ...EXPECTED_PRIVATE_SAMPLE_ENGINE_TEST_PATHS,
];

test("public selection omits private samples and dependent tests", () => {
  const selected = listPublicFiles([
    "mock-files/pdf/file1.pdf",
    ...EXPECTED_PRIVATE_SAMPLE_TEST_PATHS,
    "tests/e2e/security-headers.spec.ts",
    "tests/unit/engine/parity-red.test.ts",
    "public/dummy-pdf.pdf",
    "public/assets/blog-placeholder.png",
  ]);

  assert.deepEqual(selected, [
    "public/assets/blog-placeholder.png",
    "public/dummy-pdf.pdf",
    "tests/e2e/security-headers.spec.ts",
    "tests/unit/engine/parity-red.test.ts",
  ]);
  for (const assetPath of [
    "public/dummy-pdf.pdf",
    "public/assets/blog-placeholder.png",
  ]) {
    assert.equal(classifyPath(assetPath), "PUBLIC", assetPath);
  }
});

test("engine unit discovery separates public and private sample suites", () => {
  const publicTestNames = engineTestRunner
    .discoverEngineUnitTestFiles()
    .map((filePath) => path.basename(filePath));
  assert.deepEqual(publicTestNames, [
    "engine-runtime-contract.test.mjs",
    "package-freshness.test.ts",
    "parity-red.test.ts",
    "provider-static-integration.test.ts",
  ]);

  const syntheticDirectory = path.join(
    "tmp",
    `sample-discovery-${process.pid}`,
  );
  mkdirSync(syntheticDirectory, { recursive: true });
  try {
    for (const name of [
      ...publicTestNames,
      "provider.ts",
      ...EXPECTED_PRIVATE_SAMPLE_ENGINE_TEST_PATHS.map((filePath) =>
        path.basename(filePath),
      ),
    ]) {
      writeFileSync(path.join(syntheticDirectory, name), "");
    }
    const privateTestNames = engineTestRunner
      .discoverEngineUnitTestFiles(syntheticDirectory, {
        selection: "private-samples",
      })
      .map((filePath) => path.basename(filePath));
    assert.deepEqual(
      privateTestNames,
      EXPECTED_PRIVATE_SAMPLE_ENGINE_TEST_PATHS.map((filePath) =>
        path.basename(filePath),
      ),
    );
    assert.deepEqual(
      engineTestRunner
        .discoverEngineUnitTestFiles(syntheticDirectory)
        .map((filePath) => path.basename(filePath)),
      publicTestNames,
    );
    assert.equal(privateTestNames.includes("provider.ts"), false);
    for (const name of privateTestNames)
      rmSync(path.join(syntheticDirectory, name));
    assert.deepEqual(
      engineTestRunner
        .discoverEngineUnitTestFiles(syntheticDirectory)
        .map((filePath) => path.basename(filePath)),
      publicTestNames,
    );
  } finally {
    rmSync(syntheticDirectory, { recursive: true, force: true });
  }
  assert.equal(publicTestNames.includes("provider.ts"), false);
});

test("engine unit runner parses only the explicit private sample opt-in", () => {
  assert.equal(typeof engineTestRunner.parseEngineTestArguments, "function");
  assert.deepEqual(engineTestRunner.parseEngineTestArguments([]), {
    selection: "public",
  });
  assert.deepEqual(
    engineTestRunner.parseEngineTestArguments(["--private-samples"]),
    { selection: "private-samples" },
  );
  assert.throws(
    () => engineTestRunner.parseEngineTestArguments(["--unknown"]),
    /Unknown engine test argument/u,
  );
});

test("engine unit runner rejects a child process that did not start", () => {
  assert.throws(
    () =>
      engineTestRunner.getChildProcessStatus({
        error: new Error("spawnSync node EPERM"),
        status: 0,
        signal: null,
      }),
    /Engine unit test process could not start: spawnSync node EPERM/u,
  );
});

test("engine unit runner rejects a successful child with no test report", () => {
  assert.throws(
    () => engineTestRunner.assertEngineTestReport("", ""),
    /Engine unit test process produced no TAP report/u,
  );
  assert.doesNotThrow(() =>
    engineTestRunner.assertEngineTestReport("TAP version 13\n1..1\n", ""),
  );
});

test("private engine discovery fails when an intended suite is absent", () => {
  const fixtureDirectory = path.join(
    process.cwd(),
    "tmp",
    `private-engine-discovery-${process.pid}`,
  );
  mkdirSync(fixtureDirectory, { recursive: true });
  for (const filePath of EXPECTED_PRIVATE_SAMPLE_ENGINE_TEST_PATHS.slice(1)) {
    writeFileSync(path.join(fixtureDirectory, path.basename(filePath)), "");
  }
  try {
    assert.throws(
      () =>
        engineTestRunner.discoverEngineUnitTestFiles(fixtureDirectory, {
          selection: "private-samples",
        }),
      /complex-docx-conversion\.test\.ts/u,
    );
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test("engine unit discovery still recognizes both test extensions", () => {
  const testNames = engineTestRunner
    .discoverEngineUnitTestFiles()
    .map((filePath) => path.basename(filePath));
  assert.deepEqual(
    testNames.filter((name) => name.endsWith(".test.mjs")),
    ["engine-runtime-contract.test.mjs"],
  );
  assert.equal(testNames.includes("provider.ts"), false);
});

test("classifyPath distinguishes public, internal, ops, and omitted paths", () => {
  assert.equal(classifyPath("src/app/page.tsx"), "PUBLIC");
  assert.equal(classifyPath("pending-work/note.md"), "INTERNAL");
  assert.equal(classifyPath("scripts/worktree-setup.sh"), "INTERNAL");
  assert.equal(classifyPath("billing-offers-console/app.ts"), "OPS");
  assert.equal(classifyPath(".env.production"), "OMIT");
  assert.equal(
    classifyPath("supabase/.temp/start-secrets/env/docker.env"),
    "OMIT",
  );
  assert.equal(classifyPath("docs-site/.source/browser.ts"), "OMIT");
  assert.equal(
    classifyPath(
      "nested/docs-site/content/docs/guide/(synced-content)/page.md",
    ),
    "OMIT",
  );
  assert.equal(classifyPath("node_modules/pkg/index.js"), "OMIT");
  assert.equal(isSafeRelativePath("src/app/page.tsx"), true);
  assert.equal(isSafeRelativePath("../outside.txt"), false);
  assert.equal(isSafeRelativePath("nested\\outside.txt"), false);
  const syntheticCheckout = path.join("/synthetic", "doc-kosha");
  assert.equal(
    isKnownPrivateSiblingDestination(
      syntheticCheckout,
      path.join("/synthetic", "doc-kosha-private"),
    ),
    true,
  );
  assert.equal(
    isKnownPrivateSiblingDestination(
      syntheticCheckout,
      path.join("/synthetic", "doc-yantra", "nested-export"),
    ),
    true,
  );
  assert.equal(
    isKnownPrivateSiblingDestination(
      syntheticCheckout,
      path.join("/synthetic", "doc-kosha-private-copy"),
    ),
    false,
  );
  assert.throws(() => parseExportArguments([]), /explicit destination/u);
  assert.deepEqual(
    parseExportArguments(["--destination", "../public-candidate"]),
    { destination: path.resolve("../public-candidate") },
  );
});

test("audit source modes keep export filtered and make candidate strict", async () => {
  assert.deepEqual(parseSourceArguments([]), { source: "export" });
  assert.deepEqual(parseSourceArguments(["--source=candidate"]), {
    source: "candidate",
  });
  assert.deepEqual(parseAuditArguments(["--source", "committed"]), {
    mode: "check",
    json: false,
    root: process.cwd(),
    source: "committed",
  });
  await assert.rejects(
    () => inventorySource({ source: "candidate", root: "missing-root" }),
    /Candidate root is not readable/u,
  );
});

test("candidate audit rejects omitted paths while export filtering omits them", async () => {
  const files = new Map([
    ["src/public.ts", Buffer.from("export const publicValue = true;\n")],
    ["nested/.env.local", Buffer.from("not printed\n")],
    [".npmrc", Buffer.from("registry=https://example.invalid\n")],
  ]);
  assert.deepEqual(listPublicFiles([...files.keys()]), ["src/public.ts"]);
  const result = await auditTrackedFiles(
    [...files.keys()],
    async (filePath) => files.get(filePath),
    { source: "candidate" },
  );
  assert.deepEqual(result.pathViolations, [
    { path: ".npmrc", classification: "OMIT" },
    { path: "nested/.env.local", classification: "OMIT" },
  ]);
  assert.equal(result.scannedTextFiles, 1);
});

test("candidate inventory reports empty omitted directories without reading their contents", async () => {
  const fixtureDirectory = path.join(
    process.cwd(),
    "tmp",
    `candidate-directories-${process.pid}`,
  );
  mkdirSync(path.join(fixtureDirectory, ".next"), { recursive: true });
  mkdirSync(path.join(fixtureDirectory, ".git"), { recursive: true });
  mkdirSync(path.join(fixtureDirectory, "node_modules", "package"), {
    recursive: true,
  });
  writeFileSync(
    path.join(fixtureDirectory, "node_modules", "package", "secret.txt"),
    "must not be read\n",
  );
  writeFileSync(path.join(fixtureDirectory, "README.md"), "public\n");
  try {
    const exported = await inventorySource({
      source: "export",
      root: fixtureDirectory,
    });
    assert.deepEqual(exported.files, ["README.md"]);
    const candidate = await inventorySource({
      source: "candidate",
      root: fixtureDirectory,
    });
    assert.deepEqual(candidate.pathViolations, [
      { path: ".git", classification: "OMIT" },
      { path: ".next", classification: "OMIT" },
      { path: "node_modules", classification: "OMIT" },
    ]);
    assert.deepEqual(candidate.files, ["README.md"]);
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test("list mode formats real omitted directory data with its classification", async () => {
  const fixtureDirectory = path.join(
    process.cwd(),
    "tmp",
    `candidate-list-${process.pid}`,
  );
  mkdirSync(path.join(fixtureDirectory, ".next"), { recursive: true });
  writeFileSync(path.join(fixtureDirectory, "README.md"), "public\n");
  try {
    const candidate = await inventorySource({
      source: "candidate",
      root: fixtureDirectory,
    });
    assert.deepEqual(candidate.pathViolations, [
      { path: ".next", classification: "OMIT" },
    ]);
    assert.equal(
      formatListViolation(candidate.pathViolations[0]),
      "[OMIT] .next",
    );
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test("committed inventory uses immutable blob ids and rejects unsafe Git tree entries", async () => {
  const calls = [];
  const runGit = (args) => {
    calls.push(args);
    if (args[0] === "rev-parse")
      return {
        status: 0,
        stdout: Buffer.from(`${process.cwd()}\n`),
        stderr: Buffer.alloc(0),
      };
    if (args[0] === "ls-tree")
      return {
        status: 0,
        stdout: Buffer.from(
          "100644 blob aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\tREADME.md\0" +
            "100755 blob bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\tscripts/check.mjs\0",
        ),
        stderr: Buffer.alloc(0),
      };
    if (args[0] === "cat-file")
      return {
        status: 0,
        stdout: Buffer.from(`blob:${args.at(-1)}`),
        stderr: Buffer.alloc(0),
      };
    throw new Error(`unexpected git command ${args.join(" ")}`);
  };
  const inventory = await inventoryCommittedFiles({ runGit });
  assert.deepEqual(inventory.files, ["README.md", "scripts/check.mjs"]);
  assert.equal(
    (await inventory.readFile("README.md")).toString(),
    "blob:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
  assert.deepEqual(calls[0], ["rev-parse", "--show-toplevel"]);
  assert.deepEqual(calls[1], ["ls-tree", "-rz", "--full-tree", "HEAD"]);
  await assert.rejects(
    () =>
      inventoryCommittedFiles({
        runGit: (args) =>
          args[0] === "rev-parse"
            ? {
                status: 0,
                stdout: Buffer.from(`${process.cwd()}\n`),
                stderr: Buffer.alloc(0),
              }
            : {
                status: 0,
                stdout: Buffer.from(
                  "120000 blob aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\tunsafe-link\0",
                ),
                stderr: Buffer.alloc(0),
              },
      }),
    /symlink/u,
  );
});

test("listPublicFiles returns only sorted public candidates", () => {
  const trackedFiles = [
    "workers/custom-domains/src/index.ts",
    "src/z.ts",
    "oss-checklist/private.md",
    "src/a.ts",
    ".env.production",
    "supabase/.temp/start-secrets/env/docker.env",
    "nested/.temp/generated.env",
    "docs-site/.source/browser.ts",
    "nested/docs-site/.source/server.ts",
    "docs-site/content/docs/guide/(synced-content)/page.md",
    "nested/docs-site/content/docs/other/(synced-content)/page.md",
    "node_modules/pkg/index.js",
    "key.b64",
    "service-account.json",
    "cert.pem",
    "credentials.p12",
    "private-key.pfx",
    "nested/.env.production",
    "nested/.npmrc",
    "nested/.vercel/project.json",
    "nested/.email-previews/message.html",
    "nested/output/result.txt",
    "nested/outputs/result.txt",
    "nested/reports/report.json",
    "nested/cache/build.json",
    "nested/.cache/state.json",
    "nested/.turbo/cache.json",
    "testing-docs/.env.production",
    "testing-docs/node_modules/pkg/index.js",
    "testing-docs/.vercel/project.json",
    "testing-docs/reports/report.json",
    "testing-docs/cache/state.json",
    "testing-docs/playwright-report/report.html",
    "testing-docs/test-results/result.xml",
    "testing-docs/image-gen-posts/image.png",
    "testing-docs/dist/bundle.js",
    "testing-docs/next-env.d.ts",
    "testing-docs/tsconfig.tsbuildinfo",
    "testing-docs/debug.log",
    "testing-docs/npm-debug.log.2026",
    "testing-docs/.DS_Store",
    "testing-docs/.netrc",
    "testing-docs/.pypirc",
    "testing-docs/.yarnrc",
    "testing-docs/.yarnrc.yml",
    "testing-docs/id_rsa",
    "testing-docs/id_dsa",
    "testing-docs/id_ecdsa",
    "testing-docs/id_ed25519",
    "testing-docs/client.der",
    "testing-docs/client.keystore",
    "testing-docs/TESTING.md",
    ".vercel/project.json",
    "outputs/result.txt",
    ".email-previews/message.html",
    "nested/playwright-report/report.html",
    "nested/test-results/result.xml",
    "nested/image-gen-posts/image.png",
    "nested/dist/bundle.js",
    "nested/next-env.d.ts",
    "nested/tsconfig.tsbuildinfo",
    "nested/debug.log",
    "nested/app.log.1",
    "nested/.DS_Store",
    "nested/.netrc",
    "nested/.pypirc",
    "nested/.yarnrc",
    "nested/.yarnrc.yml",
    "nested/id_rsa",
    "nested/id_dsa",
    "nested/id_ecdsa",
    "nested/id_ed25519",
    "nested/client.der",
    "nested/client.keystore",
    "assets/private-engine.wasm",
    "archives/docyantra-engine.tgz",
    "doc-yantra/private-source.rs",
  ];

  assert.deepEqual(listPublicFiles(trackedFiles), [
    "src/a.ts",
    "src/z.ts",
    "testing-docs/TESTING.md",
    "workers/custom-domains/src/index.ts",
  ]);
});

test("auditTrackedFiles rejects private engine binaries before source publication", async () => {
  const wasm = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
  const files = new Map([
    ["assets/renamed-engine.bin", wasm],
    ["archives/docyantra-engine.tgz", Buffer.from([0x1f, 0x8b, 0x08])],
    ["src/safe.ts", Buffer.from("export const safe = true;\n")],
  ]);

  const result = await auditTrackedFiles([...files.keys()], async (filePath) =>
    files.get(filePath),
  );

  assert.deepEqual(result.contentViolations, [
    {
      path: "archives/docyantra-engine.tgz",
      token: "private engine archive",
      line: 1,
    },
    {
      path: "assets/renamed-engine.bin",
      token: "WebAssembly binary",
      line: 1,
    },
  ]);
});

test("auditTrackedFiles reports path and content violations without flagging product prose", async () => {
  const privateScope = "@" + "samarthmn";
  const files = new Map([
    [
      "src/allowed.md",
      Buffer.from(
        "The separate DocYantra product name may appear in product prose.",
      ),
    ],
    [
      "src/private.ts",
      Buffer.from(`import value from "${privateScope}/private";`),
    ],
    ["oss-checklist/plan.md", Buffer.from("internal")],
    [
      "scripts/check-public-manifest.mjs",
      Buffer.from(`const configuredToken = "${privateScope}";`),
    ],
  ]);

  const result = await auditTrackedFiles([...files.keys()], async (path) =>
    files.get(path),
  );

  assert.deepEqual(result.pathViolations, [
    { path: "oss-checklist/plan.md", classification: "INTERNAL" },
  ]);
  assert.deepEqual(result.contentViolations, [
    {
      path: "src/private.ts",
      token: `${privateScope}/private`,
      line: 1,
    },
  ]);
  assert.equal(result.scannedTextFiles, 3);
  assert.equal(result.skippedBinaryFiles, 0);
  assert.equal(result.skippedAllowlistedFiles, 1);
});

test("auditTrackedFiles rejects private sibling file links in a candidate tree", async () => {
  const siblingLink = "file:" + "../private-engine";
  const files = new Map([
    [
      "package.json",
      Buffer.from(
        JSON.stringify({
          dependencies: { engine: `${siblingLink}/packages/provider` },
        }),
      ),
    ],
  ]);

  const result = await auditTrackedFiles([...files.keys()], async (filePath) =>
    files.get(filePath),
  );

  assert.deepEqual(result.contentViolations, [
    {
      path: "package.json",
      token: `${siblingLink}/packages/provider`,
      line: 1,
    },
  ]);

  const fixtureDirectory = path.join(
    process.cwd(),
    "tmp",
    `manifest-audit-${process.pid}`,
  );
  const symlinkPath = path.join(fixtureDirectory, "safe-link.txt");
  const rootSymlinkPath = path.join(
    process.cwd(),
    "tmp",
    `manifest-audit-root-link-${process.pid}`,
  );
  mkdirSync(fixtureDirectory, { recursive: true });
  writeFileSync(path.join(fixtureDirectory, "safe.txt"), "safe\n");
  writeFileSync(path.join(fixtureDirectory, "key.b64"), "secret fixture\n");
  symlinkSync(path.join(fixtureDirectory, "safe.txt"), symlinkPath);
  symlinkSync(fixtureDirectory, rootSymlinkPath, "dir");

  try {
    const candidateTree = await enumerateCandidateFiles(fixtureDirectory);
    assert.deepEqual(candidateTree, ["safe.txt"]);
    assert.deepEqual(candidateTree.symlinkViolations, [
      { path: "safe-link.txt", classification: "SYMLINK" },
    ]);
    await assert.rejects(
      () => enumerateCandidateFiles(rootSymlinkPath),
      /must not be a symlink/u,
    );
    await assert.rejects(
      () => enumerateCandidateFiles(path.join(fixtureDirectory, "missing")),
      /Candidate root is not readable/u,
    );

    let readCount = 0;
    const safeRead = await auditTrackedFiles(
      ["key.b64", "safe.txt"],
      async (filePath) => {
        assert.notEqual(filePath, "key.b64");
        readCount += 1;
        return Buffer.from("safe\n");
      },
    );
    assert.equal(readCount, 1);
    assert.equal(safeRead.contentViolations.length, 0);
  } finally {
    rmSync(rootSymlinkPath, { force: true });
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test("auditTrackedFiles allows only the four approved DocYantra package names", async () => {
  const rejectedPackage = "@" + "samarthmn/other-private-package";
  const approved = [
    "@" + "samarthmn/doc-yantra",
    "@" + "samarthmn/doc-yantra-office",
    "@" + "samarthmn/doc-yantra-fonts",
    "@" + "samarthmn/dockosha-provider-docyantra",
  ];
  const files = new Map([
    [
      "package.json",
      Buffer.from(
        JSON.stringify({
          dependencies: Object.fromEntries(
            approved.map((name) => [name, "0.0.22"]),
          ),
        }),
      ),
    ],
    ["src/invalid.ts", Buffer.from(`import "${rejectedPackage}";\n`)],
  ]);

  const result = await auditTrackedFiles([...files.keys()], async (filePath) =>
    files.get(filePath),
  );

  assert.deepEqual(result.contentViolations, [
    {
      path: "src/invalid.ts",
      token: rejectedPackage,
      line: 1,
    },
  ]);
});

test("auditTrackedFiles permits only the intended scoped registry mapping", async () => {
  const scope = "@" + "samarthmn";
  const mapping = `  "${scope}": https://npm.pkg.github.com/\n`;
  const allowed = await auditTrackedFiles(["pnpm-workspace.yaml"], async () =>
    Buffer.from(`registries:\n${mapping}`),
  );
  assert.deepEqual(allowed.contentViolations, []);
  for (const [file, content] of [
    ["src/invalid.ts", mapping],
    ["pnpm-workspace.yaml", `  "${scope}": https://example.com/\n`],
    [
      "pnpm-workspace.yaml",
      `  "${scope}/private": https://npm.pkg.github.com/\n`,
    ],
  ]) {
    const rejected = await auditTrackedFiles([file], async () =>
      Buffer.from(content),
    );
    assert.equal(rejected.contentViolations.length, 1);
  }
});

test("auditTrackedFiles rejects local dependency protocols but permits public registry versions", async () => {
  const approvedAdapter = "@" + "samarthmn/dockosha-provider-docyantra";
  const manifest = {
    dependencies: {
      [approvedAdapter]: "workspace:*",
      safe: "^1.2.3",
      siblingFile: "file:../engine",
      siblingLink: "link:../engine",
      siblingPortal: "portal:../engine",
      localPath: "../local-package",
      workspacePackage: "workspace:^",
    },
  };
  const files = new Map([
    ["package.json", Buffer.from(JSON.stringify(manifest))],
  ]);

  const result = await auditTrackedFiles([...files.keys()], async (filePath) =>
    files.get(filePath),
  );

  assert.deepEqual(
    result.contentViolations.map(({ token }) => token),
    [
      "workspace:*",
      "file:../engine",
      "link:../engine",
      "portal:../engine",
      "../local-package",
      "workspace:^",
    ],
  );
});

test("isProbablyBinary detects NUL-delimited data and accepts ordinary UTF-8 text", () => {
  assert.equal(isProbablyBinary(Buffer.from([0x41, 0x00, 0x42])), true);
  assert.equal(isProbablyBinary(Buffer.from("plain text\n")), false);
});

test("public source CI cannot install or authenticate private engine packages", () => {
  const workflow = JSON.parse(
    readFileSync(
      path.join(process.cwd(), ".github", "workflows", "ci.yml"),
      "utf8",
    ),
  );
  const publicSource = workflow.jobs["public-source"];
  const publicText = JSON.stringify(publicSource);
  const workflowText = JSON.stringify(workflow);
  const publicRuns = publicSource.steps
    .map((step) => step.run ?? "")
    .join("\n");
  const assertPublicPermissions = (job) =>
    assert.equal(
      job.permissions,
      undefined,
      "public-source must inherit the top-level read-only permissions",
    );
  assert.doesNotMatch(publicRuns, /\b(?:pnpm|npm) (?:install|ci)\b/u);
  assert.match(publicRuns, /--source=committed/u);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assertPublicPermissions(publicSource);
  assert.throws(
    () =>
      assertPublicPermissions({
        ...publicSource,
        permissions: { packages: "read" },
      }),
    /inherit the top-level read-only permissions/u,
  );
  assert.equal(publicSource.steps[0].with["persist-credentials"], false);
  assert.doesNotMatch(
    publicText,
    /NODE_AUTH_TOKEN|registry-url|actions\/cache|upload-artifact|upload-pages-artifact/u,
  );
  assert.equal(publicSource.steps[1].with["package-manager-cache"], false);
  assert.deepEqual(
    workflowText.match(/\$\{\{\s*secrets\.[A-Z0-9_]+\s*\}\}/gu),
    [
      "${{ secrets.GH_PACKAGES_READ_TOKEN }}",
      "${{ secrets.GH_PACKAGES_READ_TOKEN }}",
    ],
  );

  const privateChecks = workflow.jobs["private-engine-checks"];
  const privateText = JSON.stringify(privateChecks);
  assert.equal(privateChecks.environment, "maintainer-engine-ci");
  assert.match(privateChecks.if, /workflow_dispatch.*default_branch/u);
  assert.doesNotMatch(
    privateText,
    /packages: read|GITHUB_TOKEN|actions\/cache|upload-artifact/u,
  );
  assert.equal(privateChecks.steps[2].with["package-manager-cache"], false);
  assert.equal(
    privateChecks.steps[3].env.NODE_AUTH_TOKEN,
    "${{ secrets.GH_PACKAGES_READ_TOKEN }}",
  );

  const privateE2e = workflow.jobs["private-engine-e2e"];
  assert.equal(privateE2e.needs, "private-engine-checks");
  assert.equal(privateE2e.environment, "maintainer-engine-ci");
  assert.match(privateE2e.if, /workflow_dispatch.*default_branch/u);
  assert.doesNotMatch(
    JSON.stringify(privateE2e),
    /packages: read|GITHUB_TOKEN|actions\/cache|upload-artifact/u,
  );
  assert.equal(
    privateE2e.steps[3].env.NODE_AUTH_TOKEN,
    "${{ secrets.GH_PACKAGES_READ_TOKEN }}",
  );
});

test("gitleaks detects assigned Cloudflare Worker origin secrets", () => {
  const config = readFileSync(
    path.join(process.cwd(), ".gitleaks.toml"),
    "utf8",
  );
  const runner = readFileSync(
    path.join(process.cwd(), "scripts", "run-gitleaks.mjs"),
    "utf8",
  );

  assert.match(config, /id = "dockosha-cloudflare-worker-origin-secret"/u);
  assert.match(config, /cloudflare_worker_origin_secret.*\{32,\}/u);
  assert.match(config, /sk_live_\|sk_test_\|rk_live_\|rk_test_/u);
  assert.match(config, /regexTarget = "secret"/u);
  assert.match(config, /\^0123456789abcdef0123456789abcdef\$/u);
  assert.doesNotMatch(config, /\\s/u);
  assert.match(runner, /spawnSync\(\s*"gitleaks"/su);
  assert.match(runner, /inventorySource/u);
  assert.match(runner, /source = "export"/u);
  assert.match(runner, /enumerateCandidateFiles/u);
  assert.match(runner, /listPublicFiles/u);
  assert.match(
    runner,
    /const scratchParent = path\.join\(candidateRoot, "tmp"\)/u,
  );
  assert.match(runner, /mkdtempSync\(path\.join\(scratchParent/u);
  assert.match(runner, /for \(const relativePath of publicFiles\)/u);
  assert.match(runner, /stageInventoryFiles\(/u);
  assert.match(runner, /stagingRoot/u);
  assert.match(runner, /cwd: stagingRoot/u);
  assert.match(runner, /path\.join\(stagingRoot, "\.gitleaks\.toml"\)/u);
  assert.match(runner, /byteCount/u);
  assert.match(runner, /fileCount/u);
  assert.match(runner, /finally/u);
  assert.match(
    runner,
    /rmSync\(stagingRoot, \{ recursive: true, force: true \}\)/u,
  );
  assert.doesNotMatch(
    runner,
    /\["dir", "--config", configPath, "--redact", "--no-banner", candidateRoot\]/u,
  );
  assert.doesNotMatch(
    runner,
    /\bnpx\b|\b(?:npm|pnpm)\b|gitleaks\s+git|git\s+(?:log|history)/iu,
  );
});

test("gitleaks excludes only generated dependency and cache surfaces", () => {
  const config = readFileSync(
    path.join(process.cwd(), ".gitleaks.toml"),
    "utf8",
  );

  for (const excludedPath of [
    "'''(^|/)node_modules/'''",
    "'''(^|/)\\.next(?:-[^/]*)?(?:/|$)'''",
    "'''(^|/)tmp/'''",
    "'''^docs-site/node_modules/'''",
    "'''^docs-site/\\.next(?:-[^/]*)?(?:/|$)'''",
    "'''^docs-site/\\.source(?:/|$)'''",
  ]) {
    assert.equal(config.includes(excludedPath), true, excludedPath);
  }
  assert.doesNotMatch(config, /tests\//u);
  assert.doesNotMatch(config, /\.env/u);
});

test("gitleaks staging excludes sensitive and omitted files", async () => {
  const fixtureDirectory = path.join(
    process.cwd(),
    "tmp",
    `gitleaks-public-fixture-${process.pid}`,
  );
  const stagingDirectory = path.join(
    process.cwd(),
    "tmp",
    `gitleaks-public-staging-${process.pid}`,
  );
  mkdirSync(path.join(fixtureDirectory, "src"), { recursive: true });
  mkdirSync(path.join(fixtureDirectory, "node_modules", "dependency"), {
    recursive: true,
  });
  mkdirSync(path.join(fixtureDirectory, "tmp"), { recursive: true });
  writeFileSync(path.join(fixtureDirectory, "src", "public.txt"), "public\n");
  writeFileSync(path.join(fixtureDirectory, ".env.local"), "secret\n");
  writeFileSync(path.join(fixtureDirectory, "key.b64"), "secret\n");
  writeFileSync(
    path.join(fixtureDirectory, "node_modules", "dependency", "index.js"),
    "secret\n",
  );
  writeFileSync(path.join(fixtureDirectory, "tmp", "secret.txt"), "secret\n");

  try {
    const publicFiles = await collectPublicFiles(fixtureDirectory);
    assert.deepEqual(publicFiles, ["src/public.txt"]);
    mkdirSync(stagingDirectory);
    stagePublicFiles(fixtureDirectory, stagingDirectory, publicFiles);
    assert.equal(
      existsSync(path.join(stagingDirectory, "src", "public.txt")),
      true,
    );
    assert.equal(existsSync(path.join(stagingDirectory, ".env.local")), false);
    assert.equal(existsSync(path.join(stagingDirectory, "key.b64")), false);
    assert.equal(
      existsSync(path.join(stagingDirectory, "node_modules")),
      false,
    );
    assert.equal(existsSync(path.join(stagingDirectory, "tmp")), false);
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
});

test("gitleaks staging uses the inventory bytes without reading the checkout", async () => {
  const stagingDirectory = path.join(
    process.cwd(),
    "tmp",
    `gitleaks-inventory-staging-${process.pid}`,
  );
  mkdirSync(stagingDirectory, { recursive: true });
  const files = new Map([
    ["src/space name-ü.txt", Buffer.from("immutable staged bytes\n")],
  ]);
  try {
    const staged = await stageInventoryFiles(
      stagingDirectory,
      [...files.keys()],
      async (filePath) => files.get(filePath),
    );
    assert.deepEqual(staged, { fileCount: 1, byteCount: 23 });
    assert.equal(
      readFileSync(
        path.join(stagingDirectory, "src", "space name-ü.txt"),
        "utf8",
      ),
      "immutable staged bytes\n",
    );
  } finally {
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
});

test("gitleaks scans the staged root with a relative target", async () => {
  const fixtureDirectory = path.join(
    process.cwd(),
    "tmp",
    `gitleaks-run-fixture-${process.pid}`,
  );
  const fakeBinDirectory = path.join(
    process.cwd(),
    "tmp",
    `gitleaks-fake-bin-${process.pid}`,
  );
  const capturePath = path.join(
    process.cwd(),
    "tmp",
    `gitleaks-run-capture-${process.pid}.txt`,
  );
  mkdirSync(path.join(fixtureDirectory, "src"), { recursive: true });
  mkdirSync(fakeBinDirectory, { recursive: true });
  writeFileSync(
    path.join(fixtureDirectory, ".gitleaks.toml"),
    'title = "test"\n',
  );
  writeFileSync(path.join(fixtureDirectory, "src", "public.txt"), "public\n");
  const fakeGitleaks = path.join(fakeBinDirectory, "gitleaks");
  writeFileSync(
    fakeGitleaks,
    '#!/bin/sh\nprintf \'%s\\n\' "$PWD" "$@" > "$GITLEAKS_CAPTURE"\n',
  );
  chmodSync(fakeGitleaks, 0o755);
  const previousPath = process.env.PATH;
  const previousCapture = process.env.GITLEAKS_CAPTURE;
  process.env.PATH = `${fakeBinDirectory}${path.delimiter}${previousPath ?? ""}`;
  process.env.GITLEAKS_CAPTURE = capturePath;

  try {
    assert.equal(
      await runGitleaks(
        fixtureDirectory,
        path.join(fixtureDirectory, ".gitleaks.toml"),
      ),
      0,
    );
    const [scanRoot, ...argumentsPassed] = readFileSync(capturePath, "utf8")
      .trim()
      .split("\n");
    assert.match(scanRoot, /gitleaks-public-[^/]+$/u);
    assert.deepEqual(argumentsPassed, [
      "dir",
      "--config",
      path.join(scanRoot, ".gitleaks.toml"),
      "--redact",
      "--no-banner",
      ".",
    ]);
    assert.equal(existsSync(path.join(fixtureDirectory, "tmp")), false);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    if (previousCapture === undefined) delete process.env.GITLEAKS_CAPTURE;
    else process.env.GITLEAKS_CAPTURE = previousCapture;
    rmSync(fixtureDirectory, { recursive: true, force: true });
    rmSync(fakeBinDirectory, { recursive: true, force: true });
    rmSync(capturePath, { recursive: true, force: true });
  }
});

test("candidate secret scanning rejects omitted material before staging it", async () => {
  const fixtureDirectory = path.join(
    process.cwd(),
    "tmp",
    `gitleaks-candidate-fixture-${process.pid}`,
  );
  mkdirSync(fixtureDirectory, { recursive: true });
  writeFileSync(
    path.join(fixtureDirectory, ".gitleaks.toml"),
    'title = "test"\n',
  );
  writeFileSync(
    path.join(fixtureDirectory, ".env.local"),
    "ignored credential\n",
  );
  try {
    await assert.rejects(
      () =>
        runGitleaks(
          fixtureDirectory,
          path.join(fixtureDirectory, ".gitleaks.toml"),
          { source: "candidate" },
        ),
      /public boundary audit/u,
    );
    assert.equal(existsSync(path.join(fixtureDirectory, "tmp")), false);
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test("classifyLicense allows only fully allowed SPDX expressions", () => {
  assert.deepEqual(classifyLicense("MIT OR Apache-2.0"), {
    classification: "ALLOWED",
    reason: "a documented dependency policy choice is available",
  });
  assert.deepEqual(classifyLicense("(MIT AND BSD-3-Clause)"), {
    classification: "ALLOWED",
    reason:
      "all license terms are on the documented dependency policy allowlist",
  });
  assert.deepEqual(classifyLicense("(MPL-2.0 OR Apache-2.0)"), {
    classification: "ALLOWED",
    reason: "a documented dependency policy choice is available",
  });
  assert.equal(
    classifyLicense("MIT AND (MPL-2.0 OR Apache-2.0)").classification,
    "ALLOWED",
  );
});

test("classifyLicense sends copyleft, source-available, and unknown values to review", () => {
  assert.equal(classifyLicense("GPL-3.0-only").classification, "REVIEW");
  assert.equal(classifyLicense("BUSL-1.1").classification, "REVIEW");
  assert.equal(
    classifyLicense("MIT AND (MPL-2.0 OR EPL-2.0)").classification,
    "REVIEW",
  );
  assert.equal(classifyLicense("UNLICENSED").classification, "REVIEW");
  assert.equal(classifyLicense("").classification, "REVIEW");
  assert.equal(classifyLicense("Custom-Proprietary").classification, "REVIEW");
});

test("parsePnpmLicenseReport flattens license groups and package versions", () => {
  const report = {
    MIT: [
      {
        name: "alpha",
        versions: ["1.0.0", "2.0.0"],
        license: "MIT",
      },
    ],
    UNKNOWN: [
      {
        name: "@scope/beta",
        versions: ["3.0.0"],
      },
    ],
  };

  assert.deepEqual(parsePnpmLicenseReport(report), [
    { name: "@scope/beta", version: "3.0.0", license: "UNKNOWN" },
    { name: "alpha", version: "1.0.0", license: "MIT" },
    { name: "alpha", version: "2.0.0", license: "MIT" },
  ]);
});

test("license fallback discovers nested and scoped package manifests safely", async () => {
  const fixtureDirectory = path.join(
    process.cwd(),
    "tmp",
    `license-fallback-${process.pid}`,
  );
  const modulesDirectory = path.join(fixtureDirectory, "node_modules");
  const nestedPackage = path.join(
    modulesDirectory,
    "parent",
    "node_modules",
    "nested-package",
  );
  const scopedPackage = path.join(
    modulesDirectory,
    "parent",
    "node_modules",
    "@nested",
    "scoped-package",
  );
  const cycleLink = path.join(
    modulesDirectory,
    "parent",
    "node_modules",
    "nested-package",
    "node_modules",
    "cycle",
  );

  mkdirSync(path.join(modulesDirectory, "root-package"), { recursive: true });
  mkdirSync(nestedPackage, { recursive: true });
  mkdirSync(scopedPackage, { recursive: true });
  mkdirSync(path.dirname(cycleLink), { recursive: true });
  mkdirSync(path.join(modulesDirectory, ".cache"), { recursive: true });
  writeFileSync(
    path.join(modulesDirectory, "root-package", "package.json"),
    JSON.stringify({ name: "root-package", version: "1.0.0", license: "MIT" }),
  );
  writeFileSync(
    path.join(nestedPackage, "package.json"),
    JSON.stringify({
      name: "nested-package",
      version: "2.0.0",
      license: "Apache-2.0",
    }),
  );
  writeFileSync(
    path.join(scopedPackage, "package.json"),
    JSON.stringify({
      name: "@nested/scoped-package",
      version: "3.0.0",
      license: "BSD-3-Clause",
    }),
  );
  symlinkSync(modulesDirectory, cycleLink, "dir");

  try {
    const metadata = await collectInstalledPackageMetadata(modulesDirectory);
    assert.equal(metadata.get("root-package\0" + "1.0.0")?.license, "MIT");
    assert.equal(
      metadata.get("nested-package\0" + "2.0.0")?.license,
      "Apache-2.0",
    );
    assert.equal(
      metadata.get("@nested/scoped-package\0" + "3.0.0")?.license,
      "BSD-3-Clause",
    );
    assert.equal(metadata.has(".cache\0" + "0.0.0"), false);
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test("collectProductionPairs preserves required versus optional lockfile edges", () => {
  const pairs = collectProductionPairs({
    importers: {
      ".": {
        dependencies: { alpha: { version: "1.0.0" } },
        optionalDependencies: { optional: { version: "2.0.0" } },
      },
    },
    snapshots: {
      "alpha@1.0.0": {
        dependencies: { child: "3.0.0" },
        optionalDependencies: { "optional-child": "4.0.0" },
      },
      "child@3.0.0": {},
      "optional@2.0.0": {},
      "optional-child@4.0.0": {},
    },
  });

  assert.deepEqual(
    [...pairs],
    [
      ["alpha\u00001.0.0", true],
      ["optional\u00002.0.0", false],
      ["child\u00003.0.0", true],
      ["optional-child\u00004.0.0", false],
    ],
  );
});

test("parsePnpmLockfile extracts root production and snapshot dependency edges", () => {
  const lockfile = parsePnpmLockfile(`lockfileVersion: '9.0'

importers:
  .:
    dependencies:
      '@scope/alpha':
        specifier: ^1.0.0
        version: 1.2.0(peer@2.0.0)
    optionalDependencies:
      optional:
        specifier: ^3.0.0
        version: 3.1.0
    devDependencies:
      dev-only:
        specifier: ^9.0.0
        version: 9.1.0

packages:
  '@scope/alpha@1.2.0':
    resolution: {integrity: placeholder}

snapshots:
  '@scope/alpha@1.2.0(peer@2.0.0)':
    dependencies:
      child: 4.0.0
    optionalDependencies:
      optional-child: 5.0.0
  child@4.0.0: {}
  optional@3.1.0: {}
  optional-child@5.0.0: {}
`);

  assert.deepEqual(lockfile, {
    importers: {
      ".": {
        dependencies: {
          "@scope/alpha": { version: "1.2.0(peer@2.0.0)" },
        },
        optionalDependencies: {
          optional: { version: "3.1.0" },
        },
      },
    },
    snapshots: {
      "@scope/alpha@1.2.0(peer@2.0.0)": {
        dependencies: { child: "4.0.0" },
        optionalDependencies: { "optional-child": "5.0.0" },
      },
      "child@4.0.0": {},
      "optional@3.1.0": {},
      "optional-child@5.0.0": {},
    },
  });
});

test("public scratch contracts reference only exported browser specs", () => {
  const source = readFileSync(
    "tests/unit/e2e-scratch-path-contract.test.ts",
    "utf8",
  );
  for (const [, name] of source.matchAll(/readSpec\("([^"\n]+)"\)/gu)) {
    assert.equal(classifyPath(`tests/e2e/${name}`), "PUBLIC", name);
  }
});

test("application checkout contains no private sample files or specs", () => {
  for (const privatePath of [
    "mock-files",
    ...EXPECTED_PRIVATE_SAMPLE_TEST_PATHS,
  ]) {
    assert.equal(
      existsSync(privatePath),
      false,
      `Move ${privatePath} to the private companion before publishing`,
    );
  }
});
