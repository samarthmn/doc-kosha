import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

const read = (relativePath: string) =>
  readFileSync(path.join(root, relativePath), "utf8");

test("DocKosha publishes the unmodified GNU AGPL version 3 license text", () => {
  const license = read("LICENSE");
  assert.match(
    license,
    /GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3, 19 November 2007/u,
  );
  assert.match(
    license,
    /Everyone is permitted to copy and distribute verbatim copies/u,
  );
  assert.match(license, /<https:\/\/www\.gnu\.org\/licenses\/>/u);
  assert.doesNotMatch(license, /PolyForm|Enterprise|commercial licen[cs]/iu);
});

test("DocKosha and its provider contract use exact AGPL-3.0-or-later metadata", () => {
  const application = JSON.parse(read("package.json"));
  const providerInterface = JSON.parse(
    read("packages/provider-interface/package.json"),
  );

  assert.equal(application.license, "AGPL-3.0-or-later");
  assert.equal(
    application.private,
    true,
    "the app remains protected from npm publish",
  );
  assert.equal(
    application.repository?.url,
    "git+https://github.com/samarthmn/doc-kosha.git",
  );
  assert.equal(providerInterface.license, "AGPL-3.0-or-later");
  assert.equal(
    providerInterface.repository?.url,
    "git+https://github.com/samarthmn/doc-kosha.git",
  );
  assert.ok(providerInterface.files.includes("LICENSE"));
  assert.ok(providerInterface.files.includes("COMMERCIAL-LICENSING.md"));
  assert.deepEqual(
    readFileSync(path.join(root, "packages/provider-interface/LICENSE")),
    readFileSync(path.join(root, "LICENSE")),
  );
  assert.deepEqual(
    readFileSync(
      path.join(root, "packages/provider-interface/COMMERCIAL-LICENSING.md"),
    ),
    readFileSync(path.join(root, "COMMERCIAL-LICENSING.md")),
  );
});

test("DocYantra AGPL packages have explicit reviewed dependency decisions", async () => {
  const { REVIEWED_LICENSE_DECISIONS } =
    await import("../../scripts/check-licenses.mjs");

  for (const packageName of [
    "@samarthmn/doc-yantra",
    "@samarthmn/doc-yantra-office",
    "@samarthmn/dockosha-provider-docyantra",
  ]) {
    assert.equal(
      REVIEWED_LICENSE_DECISIONS.get(packageName),
      "AGPL-3.0-only",
      packageName,
    );
  }
  assert.equal(
    REVIEWED_LICENSE_DECISIONS.get("@samarthmn/doc-yantra-fonts"),
    "AGPL-3.0-only AND OFL-1.1",
  );
});
