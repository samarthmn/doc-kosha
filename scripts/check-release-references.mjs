#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const MANAGED_COPY_FILES = [
  "src/app/features/redaction/page.tsx",
  "src/components/marketing/pages/LandingPage.tsx",
  "src/components/marketing/pages/SecurityQuestionnairePage.tsx",
  "src/components/marketing/pricing/PricingDetailedFeatures.tsx",
  "src/components/settings/SubscriptionUsage.tsx",
  "packages/provider-interface/README.md",
  "docs-site/content/docs/self-hosting/index.mdx",
  "docs/publishing-a-fresh-public-repository.md",
  "docs-site/content/docs/getting-started/what-is-dockosha.mdx",
  "docs-site/scripts/repo-docs-manifest.mjs",
];
const AVAILABILITY_COPY_FILES = [
  "docs-site/content/docs/getting-started/what-is-dockosha.mdx",
  "docs-site/scripts/repo-docs-manifest.mjs",
  "docs-site/content/docs/self-hosting/index.mdx",
  "docs/self-hosting.md",
  "src/content/faq.json",
];

export const findAvailabilityContradictions = (files) => {
  const contradictions = [];
  // DocYantra is open source and self-hosting is available but unsupported:
  // flag copy that regresses to the retired private/unavailable claims or
  // promises official self-hosting support.
  const patterns = [
    /self-hosting is not (?:currently|yet) available/iu,
    /self-hosting is (?:fully |officially )?supported/iu,
    /private (?:mandatory )?(?:direct )?DocYantra/iu,
    /DocYantra[^.]{0,80}\b(?:is|remains) (?:a )?private/iu,
    /mandatory private/iu,
  ];
  for (const relativePath of AVAILABILITY_COPY_FILES) {
    const content = files.get(relativePath);
    if (
      content !== undefined &&
      patterns.some((pattern) => pattern.test(content))
    )
      contradictions.push(relativePath);
  }
  return contradictions;
};

export const findReleaseReferenceMismatches = (files, currentVersion) => {
  const mismatches = [];
  const versionPattern = /DocYantra[\s\S]{0,120}?([0-9]+\.[0-9]+\.[0-9]+)/gu;
  for (const relativePath of MANAGED_COPY_FILES) {
    const content = files.get(relativePath);
    if (content === undefined) {
      mismatches.push(relativePath);
      continue;
    }
    for (const match of content.matchAll(versionPattern)) {
      if (match[1] !== currentVersion) {
        mismatches.push(relativePath);
        break;
      }
    }
  }
  return mismatches;
};

export const auditReleaseReferences = async (root = process.cwd()) => {
  const packageJson = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  const currentVersion =
    packageJson.dependencies?.["@samarthmn/dockosha-provider-docyantra"];
  if (!currentVersion || !/^\d+\.\d+\.\d+$/u.test(currentVersion)) {
    throw new Error("package.json must declare an exact DocYantra version");
  }
  const files = new Map();
  await Promise.all(
    [...new Set([...MANAGED_COPY_FILES, ...AVAILABILITY_COPY_FILES])].map(
      async (relativePath) => {
        try {
          files.set(
            relativePath,
            await readFile(path.join(root, relativePath), "utf8"),
          );
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      },
    ),
  );
  return {
    currentVersion,
    mismatches: findReleaseReferenceMismatches(files, currentVersion),
    availabilityContradictions: findAvailabilityContradictions(files),
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const { currentVersion, mismatches, availabilityContradictions } =
    await auditReleaseReferences();
  if (mismatches.length > 0 || availabilityContradictions.length > 0) {
    globalThis.console.error(
      `DocYantra ${currentVersion} release-reference mismatches: ${[...mismatches, ...availabilityContradictions].join(", ")}`,
    );
    process.exitCode = 1;
  } else {
    globalThis.console.log(
      `DocYantra ${currentVersion} release references: ${MANAGED_COPY_FILES.length} managed files checked`,
    );
  }
}
