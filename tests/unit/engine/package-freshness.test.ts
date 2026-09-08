import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

import { getEngineProvider } from "./provider";

const ADAPTER = "@samarthmn/dockosha-provider-docyantra";
const FONTS = "@samarthmn/doc-yantra-fonts";
const ENGINES = ["@samarthmn/doc-yantra", "@samarthmn/doc-yantra-office"];
const VERSION = "0.0.25";
const requireCjs = createRequire(import.meta.url);
type WorkflowStep = {
  env?: Record<string, string>;
  run?: string;
  uses?: string;
  with?: Record<string, string | boolean>;
};
type WorkflowJob = {
  environment?: string;
  if?: string;
  needs?: string;
  steps: WorkflowStep[];
};
type ParsedWorkflow = {
  jobs: Record<string, WorkflowJob>;
  on: {
    workflow_dispatch: {
      inputs: { run_maintainer_engine: { type: string } };
    };
  };
};

const readPackage = (name: string) => {
  const manifestPath = requireCjs.resolve(`${name}/package.json`);
  return {
    directory: path.dirname(manifestPath),
    value: JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
      string,
      unknown
    >,
  };
};

test("the installed adapter and engine packages are the fixed production release", () => {
  const adapter = readPackage(ADAPTER);
  assert.equal(adapter.value.name, ADAPTER);
  assert.equal(adapter.value.version, VERSION);
  assert.equal(adapter.value.providerId, "docyantra");
  assert.equal(getEngineProvider().id, "docyantra");

  const dependencies = adapter.value.dependencies as Record<string, unknown>;
  assert.equal(dependencies[ENGINES[0]], VERSION);
  assert.equal(dependencies[ENGINES[1]], VERSION);
  assert.equal(readPackage(ENGINES[0]).value.version as string, VERSION);
  assert.equal(readPackage(ENGINES[1]).value.version as string, VERSION);
});

test("the mandatory font package is installed and manifest-backed", () => {
  const fonts = readPackage(FONTS);
  assert.equal(fonts.value.version, VERSION);
  const manifestPath = path.join(fonts.directory, "fonts", "manifest.json");
  assert.equal(existsSync(manifestPath), true);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    fonts?: Array<{ file?: string }>;
  };
  assert.ok(manifest.fonts?.length);
  assert.ok(
    existsSync(
      path.join(fonts.directory, "fonts", manifest.fonts[0].file ?? ""),
    ),
  );
});

test("DocKosha records exact registry-style engine dependencies", () => {
  const packageValue = JSON.parse(
    readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
  ) as { dependencies: Record<string, string> };
  assert.equal(packageValue.dependencies[ADAPTER], VERSION);
  assert.equal(packageValue.dependencies[FONTS], VERSION);

  const lockfile = readFileSync(
    path.join(process.cwd(), "pnpm-lock.yaml"),
    "utf8",
  );
  assert.equal(
    lockfile.includes(
      `'@samarthmn/dockosha-provider-docyantra':\n        specifier: ${VERSION}`,
    ),
    true,
  );
  assert.equal(
    lockfile.includes(
      `'@samarthmn/doc-yantra-fonts':\n        specifier: ${VERSION}`,
    ),
    true,
  );
  assert.doesNotMatch(
    lockfile,
    /(?:^|[\n ])(?:file:|link:|workspace:|localhost)(?:[^A-Za-z]|$)/u,
  );
  assert.match(lockfile, /https:\/\/npm\.pkg\.github\.com\//u);
  for (const name of [ADAPTER, FONTS, ...ENGINES]) {
    const marker = `  '${name}@${VERSION}':\n`;
    const entry = lockfile.split(marker)[1]?.split("\n\n")[0];
    assert.ok(entry, `Missing registry metadata for ${name}`);
    const tarball = entry.match(/tarball: ([^,}\s]+)/u)?.[1];
    assert.ok(tarball, `Missing immutable tarball for ${name}`);
    const url = new URL(tarball);
    assert.equal(url.origin, "https://npm.pkg.github.com");
    assert.equal(url.username, "");
    assert.equal(url.password, "");
    assert.ok(url.pathname.startsWith(`/download/${name}/${VERSION}/`));
    assert.match(entry, /integrity: sha512-[A-Za-z0-9+/]+={0,2}/u);
  }
});

test("maintainer engine CI is manual, default-branch-only, and environment-protected", () => {
  const workflow = JSON.parse(
    readFileSync(
      path.join(process.cwd(), ".github", "workflows", "ci.yml"),
      "utf8",
    ),
  ) as ParsedWorkflow;
  const publicSource = workflow.jobs["public-source"];
  const publicRuns = publicSource.steps
    .map((step: { run?: string }) => step.run ?? "")
    .join("\n");
  assert.equal(
    workflow.on.workflow_dispatch.inputs.run_maintainer_engine.type,
    "boolean",
  );
  assert.equal(publicSource.steps[2]!.env!.GITLEAKS_VERSION, "8.30.1");
  assert.match(publicRuns, /sha256sum --check --strict/u);
  assert.match(publicRuns, /node scripts\/run-gitleaks\.mjs/u);
  const privateChecks = workflow.jobs["private-engine-checks"];
  const privateE2e = workflow.jobs["private-engine-e2e"];
  assert.equal(privateChecks.environment, "maintainer-engine-ci");
  assert.match(privateChecks.if!, /workflow_dispatch.*default_branch/u);
  assert.equal(
    privateChecks.steps[2]!.with!["registry-url"],
    "https://npm.pkg.github.com",
  );
  assert.equal(
    privateChecks.steps[3]!.env!.NODE_AUTH_TOKEN,
    "${{ secrets.GH_PACKAGES_READ_TOKEN }}",
  );
  assert.equal(privateE2e.needs, "private-engine-checks");
});

test("CI actions use immutable upstream commit pins", () => {
  const workflow = JSON.parse(
    readFileSync(
      path.join(process.cwd(), ".github", "workflows", "ci.yml"),
      "utf8",
    ),
  ) as Pick<ParsedWorkflow, "jobs">;
  const actionReferences = Object.values(workflow.jobs).flatMap((job) =>
    job.steps
      .map((step) => step.uses)
      .filter(
        (reference): reference is string => typeof reference === "string",
      ),
  );
  assert.ok(actionReferences.length > 0);
  for (const reference of actionReferences) {
    assert.match(
      reference,
      /^[^@\s]+@[0-9a-f]{40}$/u,
      "CI action is not pinned to a full commit SHA: " + reference,
    );
  }
});
