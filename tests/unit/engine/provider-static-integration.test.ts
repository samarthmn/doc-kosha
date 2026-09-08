import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("the active document provider is the statically installed DocYantra adapter", async () => {
  const { documentProcessingProvider } =
    await import("@/server/documentProcessing/provider");

  assert.equal(documentProcessingProvider.id, "docyantra");
  assert.equal(
    documentProcessingProvider.capabilities.has("office_conversion"),
    true,
  );
  assert.equal(documentProcessingProvider.capabilities.has("redaction"), true);
});

test("provider integration does not resolve package names from environment", () => {
  const providerSource = readFileSync(
    path.join(
      process.cwd(),
      "src",
      "server",
      "documentProcessing",
      "provider.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(providerSource, /builtInProvider/u);
  assert.equal(
    providerSource.includes('from "@samarthmn/dockosha-provider-docyantra"'),
    true,
  );
});

test("runtime diagnostics use static package metadata imports", () => {
  const diagnosticsSource = readFileSync(
    path.join(process.cwd(), "src", "server", "engineRuntimeDiagnostics.ts"),
    "utf8",
  );

  assert.doesNotMatch(diagnosticsSource, /createRequire|runtimeRequire/u);
  assert.doesNotMatch(diagnosticsSource, /\.resolve\(/u);
  const packageScope = ["@", "samarthmn"].join("");
  const packageNames = [
    `${packageScope}/dockosha-provider-docyantra`,
    `${packageScope}/doc-yantra`,
    `${packageScope}/doc-yantra-office`,
    `${packageScope}/doc-yantra-fonts`,
  ];
  for (const packageName of packageNames) {
    assert.equal(
      diagnosticsSource.includes(`from "${packageName}/package.json"`),
      true,
      `missing static manifest import for ${packageName}`,
    );
  }
  assert.match(
    diagnosticsSource,
    new RegExp(`from "${packageNames[0]}/build-fingerprint\\.json"`, "u"),
  );
});

test("the production graph has no built-in provider fallback", () => {
  assert.equal(
    existsSync(
      path.join(
        process.cwd(),
        "src",
        "server",
        "documentProcessing",
        "builtInProvider",
      ),
    ),
    false,
  );
});
