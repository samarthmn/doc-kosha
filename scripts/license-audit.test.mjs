import assert from "node:assert/strict";
import test from "node:test";

import {
  auditLicenses,
  classifyLicense,
  collectProductionPairs,
  parsePnpmLicenseReport,
  runPnpmLicenseCommand,
} from "./check-licenses.mjs";

test("license command is bounded and injectable", () => {
  assert.throws(
    () =>
      runPnpmLicenseCommand({
        executor: (_command, _args, options) => {
          assert.equal(options.timeout, 30_000);
          assert.equal(options.killSignal, "SIGKILL");
          assert.equal(options.maxBuffer, 64 * 1024 * 1024);
          return { error: new Error("spawn timed out") };
        },
      }),
    /spawn timed out/u,
  );
});

test("malformed and empty pnpm reports are rejected", () => {
  assert.throws(() => parsePnpmLicenseReport(null), /object/u);
  assert.throws(() => parsePnpmLicenseReport({}), /empty/u);
  assert.throws(
    () => parsePnpmLicenseReport({ MIT: [] }),
    /no package records/u,
  );
  assert.throws(
    () => parsePnpmLicenseReport({ MIT: [{ version: "1.0.0" }] }),
    /name/u,
  );
});

const requiredLockfile = `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      alpha:
        specifier: 1.0.0
        version: 1.0.0
      beta:
        specifier: 2.0.0
        version: 2.0.0
snapshots:
  alpha@1.0.0: {}
  beta@2.0.0: {}
`;

test("missing required primary evidence falls back to complete UNKNOWN coverage", async () => {
  const report = await auditLicenses({
    commandExecutor: () => ({
      status: 0,
      stdout: JSON.stringify({ MIT: [{ name: "alpha", versions: ["1.0.0"] }] }),
      stderr: "",
    }),
    lockfileText: requiredLockfile,
    installedPackages: new Map(),
  });
  assert.equal(
    report.method,
    "pnpm-lock.yaml + installed node_modules package.json fallback",
  );
  assert.equal(report.status, "review");
  assert.deepEqual(
    report.review.map(({ name, license }) => [name, license]),
    [
      ["alpha", "UNKNOWN"],
      ["beta", "UNKNOWN"],
    ],
  );
  assert.match(report.fallbackReason, /omitted required production packages/u);
});

test("unresolved required lockfile references are rejected", () => {
  assert.throws(
    () =>
      collectProductionPairs({
        importers: {
          ".": { dependencies: { broken: { specifier: "1.0.0" } } },
        },
        snapshots: {},
      }),
    /unresolved required dependency reference/u,
  );
});

test("fallback report remains review when required package metadata is missing", async () => {
  const report = await auditLicenses({
    commandExecutor: () => ({
      status: 1,
      stdout: "",
      stderr: "license command failed",
    }),
    lockfileText: `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      required-package:
        specifier: 1.0.0
        version: 1.0.0
snapshots:
  required-package@1.0.0: {}
`,
    installedPackages: new Map(),
  });
  assert.equal(report.status, "review");
  assert.equal(report.review[0].license, "UNKNOWN");
  assert.match(report.fallbackReason, /license command failed/u);
});

test("changed reviewed license expression reopens review", () => {
  const packages = parsePnpmLicenseReport({
    "AGPL-3.0-only": [{ name: "@samarthmn/doc-yantra", versions: ["0.0.25"] }],
  });
  assert.equal(packages[0].license, "AGPL-3.0-only");
  assert.equal(
    classifyLicense("AGPL-3.0-only AND OFL-1.1", "@samarthmn/doc-yantra")
      .classification,
    "REVIEW",
  );
});

test("fonts package allows only the reviewed AGPL-3.0-only AND OFL-1.1 expression", () => {
  assert.equal(
    classifyLicense("AGPL-3.0-only AND OFL-1.1", "@samarthmn/doc-yantra-fonts")
      .classification,
    "ALLOWED",
  );
  assert.equal(
    classifyLicense("AGPL-3.0-only", "@samarthmn/doc-yantra-fonts")
      .classification,
    "REVIEW",
  );
  assert.equal(
    classifyLicense("AGPL-3.0-only AND MIT", "@samarthmn/doc-yantra-fonts")
      .classification,
    "REVIEW",
  );
});
