import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { syncRepoDocs } from "./sync-repo-docs.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const taskTempRoot = path.join(repositoryRoot, "tmp");

async function createFixture() {
  await mkdir(taskTempRoot, { recursive: true });
  const fixtureRoot = await mkdtemp(path.join(taskTempRoot, "docs-sync-"));
  const fixtureRepositoryRoot = path.join(fixtureRoot, "repository");
  const docsSiteRoot = path.join(fixtureRepositoryRoot, "docs-site");

  await mkdir(path.join(fixtureRepositoryRoot, "docs"), { recursive: true });
  await mkdir(docsSiteRoot, { recursive: true });

  return { docsSiteRoot, fixtureRepositoryRoot, fixtureRoot };
}

test("copies operator docs with frontmatter and site-relative manifest links", async () => {
  const { docsSiteRoot, fixtureRepositoryRoot, fixtureRoot } =
    await createFixture();

  try {
    await writeFile(
      path.join(fixtureRepositoryRoot, "docs", "self-hosting.md"),
      [
        "# Self-hosting",
        "",
        "See the [capability matrix](./capability-matrix.md#tiers).",
        "Read the [conversion envelope](../docs-site/content/docs/how-it-works/conversion-envelope.mdx?view=full#bounds).",
        "Keep [external links](https://example.com) and [anchors](#install).",
        "",
      ].join("\n"),
    );
    await writeFile(
      path.join(fixtureRepositoryRoot, "docs", "capability-matrix.md"),
      "# Capability matrix\n",
    );

    const manifest = {
      requireAll: false,
      links: [
        {
          source: "docs-site/content/docs/how-it-works/conversion-envelope.mdx",
          slug: "how-it-works/conversion-envelope",
        },
      ],
      entries: [
        {
          source: "docs/self-hosting.md",
          output: "content/docs/self-hosting/(synced-content)/self-hosting.md",
          slug: "self-hosting/self-hosting",
          title: "Self-hosting",
          description: "Operate DocKosha on your own infrastructure.",
        },
        {
          source: "docs/capability-matrix.md",
          output:
            "content/docs/reference/(synced-content)/capability-matrix.md",
          slug: "reference/capability-matrix",
          title: "Capability matrix",
          description: "Compare the capabilities in each DocKosha tier.",
        },
      ],
    };

    await syncRepoDocs({
      docsSiteRoot,
      logger: { warn() {} },
      manifest,
      repositoryRoot: fixtureRepositoryRoot,
    });

    const output = await readFile(
      path.join(
        docsSiteRoot,
        "content/docs/self-hosting/(synced-content)/self-hosting.md",
      ),
      "utf8",
    );

    assert.match(output, /^---\ntitle: "Self-hosting"\ndescription: /);
    assert.match(
      output,
      /\[capability matrix\]\(\/docs\/reference\/capability-matrix#tiers\)/,
    );
    assert.match(output, /\[external links\]\(https:\/\/example\.com\)/);
    assert.match(
      output,
      /\[conversion envelope\]\(\/docs\/how-it-works\/conversion-envelope\?view=full#bounds\)/,
    );
    assert.match(output, /\[anchors\]\(#install\)/);
  } finally {
    await rm(fixtureRoot, { force: true, recursive: true });
  }
});

test("warns and writes a labelled stub when an operator document is missing", async () => {
  const { docsSiteRoot, fixtureRepositoryRoot, fixtureRoot } =
    await createFixture();
  const warnings = [];

  try {
    await syncRepoDocs({
      docsSiteRoot,
      logger: {
        warn(message) {
          warnings.push(message);
        },
      },
      manifest: {
        requireAll: false,
        entries: [
          {
            source: "docs/configuration.md",
            output:
              "content/docs/self-hosting/(synced-content)/configuration.md",
            slug: "self-hosting/configuration",
            title: "Configuration",
            description: "Configure a self-hosted DocKosha deployment.",
          },
        ],
      },
      repositoryRoot: fixtureRepositoryRoot,
    });

    const output = await readFile(
      path.join(
        docsSiteRoot,
        "content/docs/self-hosting/(synced-content)/configuration.md",
      ),
      "utf8",
    );

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /docs\/configuration\.md/);
    assert.match(output, /> \*\*Synced document unavailable\*\*/);
    assert.match(output, /arrives with the public repository split/);
  } finally {
    await rm(fixtureRoot, { force: true, recursive: true });
  }
});

test("fails loudly for missing operator documents when requireAll is enabled", async () => {
  const { docsSiteRoot, fixtureRepositoryRoot, fixtureRoot } =
    await createFixture();

  try {
    await assert.rejects(
      syncRepoDocs({
        docsSiteRoot,
        logger: { warn() {} },
        manifest: {
          requireAll: true,
          entries: [
            {
              source: "docs/providers.md",
              output: "content/docs/self-hosting/(synced-content)/providers.md",
              slug: "self-hosting/providers",
              title: "Providers",
              description: "Configure document-processing providers.",
            },
          ],
        },
        repositoryRoot: fixtureRepositoryRoot,
      }),
      /Required repository document is missing: docs\/providers\.md/,
    );
  } finally {
    await rm(fixtureRoot, { force: true, recursive: true });
  }
});
