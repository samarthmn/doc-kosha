import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  findReleaseReferenceMismatches,
  MANAGED_COPY_FILES,
  findAvailabilityContradictions,
} from "./check-release-references.mjs";

const completeFiles = (value) =>
  new Map(MANAGED_COPY_FILES.map((file) => [file, value]));

test("release reference audit flags a managed copy claim that lags metadata", () => {
  const mismatches = findReleaseReferenceMismatches(
    new Map([
      ...completeFiles("DocYantra 0.0.25").entries(),
      [
        "src/app/features/redaction/page.tsx",
        "DocYantra 0.0.22 permanently removes content.",
      ],
    ]),
    "0.0.25",
  );
  assert.deepEqual(mismatches, ["src/app/features/redaction/page.tsx"]);
});

test("release reference audit accepts historical versions outside managed copy", () => {
  const mismatches = findReleaseReferenceMismatches(
    completeFiles("No release claim in this maintained copy."),
    "0.0.25",
  );
  assert.deepEqual(mismatches, []);
});

test("release reference audit understands mandatory direct and backtick copy", () => {
  const files = completeFiles(
    "DocYantra is the mandatory direct `0.0.25` dependency.",
  );
  assert.deepEqual(findReleaseReferenceMismatches(files, "0.0.25"), []);
  files.set(
    "packages/provider-interface/README.md",
    "DocYantra is mandatory direct `0.0.22`.",
  );
  assert.deepEqual(findReleaseReferenceMismatches(files, "0.0.25"), [
    "packages/provider-interface/README.md",
  ]);
});

test("release reference audit flags a missing managed file", () => {
  const files = completeFiles("DocYantra 0.0.25");
  files.delete("docs/publishing-a-fresh-public-repository.md");
  assert.deepEqual(findReleaseReferenceMismatches(files, "0.0.25"), [
    "docs/publishing-a-fresh-public-repository.md",
  ]);
});

test("availability audit accepts the actual corrected docs and catches former promises", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const actual = new Map([
    [
      "docs-site/content/docs/getting-started/what-is-dockosha.mdx",
      await readFile(
        path.join(
          root,
          "docs-site/content/docs/getting-started/what-is-dockosha.mdx",
        ),
        "utf8",
      ),
    ],
    [
      "docs-site/scripts/repo-docs-manifest.mjs",
      await readFile(
        path.join(root, "docs-site/scripts/repo-docs-manifest.mjs"),
        "utf8",
      ),
    ],
  ]);
  assert.deepEqual(findAvailabilityContradictions(actual), []);
  actual.set(
    "docs-site/content/docs/getting-started/what-is-dockosha.mdx",
    `${actual.get("docs-site/content/docs/getting-started/what-is-dockosha.mdx")}\nRun the whole thing themselves.\n`,
  );
  assert.deepEqual(findAvailabilityContradictions(actual), [
    "docs-site/content/docs/getting-started/what-is-dockosha.mdx",
  ]);
  actual.set(
    "docs-site/scripts/repo-docs-manifest.mjs",
    `${actual.get("docs-site/scripts/repo-docs-manifest.mjs")}\nInstall and operate DocKosha on your own infrastructure.\n`,
  );
  assert.deepEqual(findAvailabilityContradictions(actual), [
    "docs-site/content/docs/getting-started/what-is-dockosha.mdx",
    "docs-site/scripts/repo-docs-manifest.mjs",
  ]);
  actual.set(
    "docs-site/content/docs/getting-started/what-is-dockosha.mdx",
    `${actual.get("docs-site/content/docs/getting-started/what-is-dockosha.mdx")}\n| **Use DocYantra** | Current route |\n`,
  );
  assert.deepEqual(findAvailabilityContradictions(actual), [
    "docs-site/content/docs/getting-started/what-is-dockosha.mdx",
    "docs-site/scripts/repo-docs-manifest.mjs",
  ]);
});
