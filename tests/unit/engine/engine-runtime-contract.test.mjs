import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import {
  inspectInstalledEngineRuntimeGraph,
  validateEnginePackageVersions,
} from "../../../scripts/verify-engine-runtime-graph.mjs";
import { verifyEngineTraceFiles } from "../../../scripts/verify-engine-build-artifact.mjs";
import {
  extractTapSkipReason,
  isAllowedTapSkipLine,
  discoverEngineUnitTestFiles,
} from "../../../scripts/run-engine-unit-tests.mjs";

test("public engine discovery excludes private sample suites", () => {
  const discovered = discoverEngineUnitTestFiles().map((filePath) =>
    path.basename(filePath),
  );
  assert.deepEqual(discovered, [
    "engine-runtime-contract.test.mjs",
    "package-freshness.test.ts",
    "parity-red.test.ts",
    "provider-static-integration.test.ts",
  ]);
  assert.equal(discovered.includes("provider.ts"), false);
});

test("engine runtime graph rejects mixed adapter, engine, and font versions", () => {
  assert.throws(
    () =>
      validateEnginePackageVersions({
        providerName: "@samarthmn/dockosha-provider-docyantra",
        providerVersion: "1.2.3",
        dependencies: {
          "@samarthmn/doc-yantra": "1.2.3",
          "@samarthmn/doc-yantra-office": "1.2.3",
        },
        peerDependencies: { "@samarthmn/doc-yantra-fonts": "1.2.3" },
        installedVersions: {
          "@samarthmn/doc-yantra": "1.2.3",
          "@samarthmn/doc-yantra-office": "1.2.2",
          "@samarthmn/doc-yantra-fonts": "1.2.3",
        },
      }),
    /doc-yantra-office/u,
  );
});

test("engine runtime graph requires the mandatory font package", () => {
  assert.throws(
    () =>
      validateEnginePackageVersions({
        providerName: "@samarthmn/dockosha-provider-docyantra",
        providerVersion: "1.2.3",
        dependencies: {
          "@samarthmn/doc-yantra": "1.2.3",
          "@samarthmn/doc-yantra-office": "1.2.3",
        },
        peerDependencies: {},
        installedVersions: {
          "@samarthmn/doc-yantra": "1.2.3",
          "@samarthmn/doc-yantra-office": "1.2.3",
        },
      }),
    /doc-yantra-fonts/u,
  );
});

test("installed DocYantra graph always includes the mandatory font assets", () => {
  const graph = inspectInstalledEngineRuntimeGraph();
  assert.match(graph.providerVersion, /^\d+\.\d+\.\d+$/u);
  assert.match(graph.buildFingerprint, /^[a-f0-9]{64}$/u);
  for (const suffix of [
    "worker-entry.cjs",
    "pdf_core_wasm_bg.wasm",
    "font-manifest.json",
    "office_core_wasm_bg.wasm",
  ]) {
    assert.ok(graph.assetPaths.some((assetPath) => assetPath.endsWith(suffix)));
  }
  assert.ok(
    graph.assetPaths.some((assetPath) =>
      assetPath.endsWith("doc-yantra-fonts/fonts/manifest.json"),
    ),
  );
});

test("post-build trace verification rejects an incomplete public file worker bundle", () => {
  const completeTrace = [
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
    "node_modules/@samarthmn/doc-yantra-fonts/package.json",
    "node_modules/@samarthmn/doc-yantra-fonts/fonts/manifest.json",
    "node_modules/@samarthmn/doc-yantra-fonts/fonts/example.ttf",
    "node_modules/zod/package.json",
    "node_modules/zod/index.cjs",
  ];
  assert.doesNotThrow(() =>
    verifyEngineTraceFiles(completeTrace, ["example.ttf"]),
  );
  assert.throws(
    () =>
      verifyEngineTraceFiles(
        completeTrace.filter(
          (filePath) => !filePath.endsWith("pdf_core_wasm_bg.wasm"),
        ),
        ["example.ttf"],
      ),
    /pdf_core_wasm_bg\.wasm/u,
  );
});

test("engine unit runner enforces documented skip reasons", () => {
  const documentedSkipLines = [
    "ok 1 - fixture # SKIP font CDN degraded (font_unresolved) — 1.docx corpus conversion requires CDN font resolution",
    "ok 2 - fixture # SKIP font CDN degraded (font_unresolved) — docx routing requires CDN font resolution",
    "ok 3 - fixture # SKIP font CDN degraded (font_unresolved) — explicit Arabic bidi paragraph semantic-text conversion requires CDN font resolution",
    "ok 4 - fixture # SKIP font CDN degraded (font_unresolved) — Office worker smoke conversion requires CDN font resolution",
    "ok 5 - fixture # SKIP unexpected external font fetch (2 failed fetches) — conversion unavailable",
  ];
  for (const line of documentedSkipLines) {
    assert.equal(isAllowedTapSkipLine(line), true, line);
    assert.equal(
      extractTapSkipReason(line),
      line.slice(line.indexOf("# SKIP") + "# SKIP".length).trim(),
    );
  }

  const rejectedSkipLines = [
    "ok 1 - fixture # SKIP prefix font CDN degraded (font_unresolved) — 1.docx corpus conversion requires CDN font resolution",
    "ok 2 - fixture # SKIP font CDN degraded (font_unresolved) — 1.docx corpus conversion requires CDN font resolution suffix",
    "ok 3 - fixture # SKIP font CDN degraded (font_unresolved) — provider loading is unavailable",
    "ok 4 - fixture # SKIP unexpected external font fetch (2 failed fetches) — provider loading is unavailable",
    "runner output # SKIP font CDN degraded (font_unresolved) — 1.docx corpus conversion requires CDN font resolution",
  ];
  for (const line of rejectedSkipLines) {
    assert.equal(isAllowedTapSkipLine(line), false, line);
  }
});
