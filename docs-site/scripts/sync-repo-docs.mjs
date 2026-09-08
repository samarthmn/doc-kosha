import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { repoDocsManifest } from "./repo-docs-manifest.mjs";

const markdownLinkPattern =
  /(!?\[[^\]]*]\()(<)?([^\s)>]+)(>)?(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?(\))/g;

function normalizeRepositoryPath(filePath) {
  return path.posix.normalize(filePath.replaceAll(path.sep, "/"));
}

function splitLinkTarget(target) {
  const suffixIndex = target.search(/[?#]/);

  if (suffixIndex === -1) {
    return { pathname: target, suffix: "" };
  }

  return {
    pathname: target.slice(0, suffixIndex),
    suffix: target.slice(suffixIndex),
  };
}

function rewriteRelativeLinks(markdown, entry, entries) {
  const entriesBySource = new Map(
    entries.map((candidate) => [
      normalizeRepositoryPath(candidate.source),
      candidate,
    ]),
  );

  return markdown.replace(
    markdownLinkPattern,
    (match, prefix, openAngle, target, closeAngle, title, suffix) => {
      if (
        target.startsWith("#") ||
        target.startsWith("/") ||
        target.startsWith("//") ||
        /^[a-z][a-z\d+.-]*:/i.test(target)
      ) {
        return match;
      }

      const link = splitLinkTarget(target);
      const sourceDirectory = path.posix.dirname(
        normalizeRepositoryPath(entry.source),
      );
      const resolvedSource = path.posix.normalize(
        path.posix.join(sourceDirectory, link.pathname),
      );
      const targetEntry = entriesBySource.get(resolvedSource);

      if (!targetEntry) {
        return match;
      }

      const rewrittenTarget = `/docs/${targetEntry.slug}${link.suffix}`;
      return `${prefix}${openAngle ?? ""}${rewrittenTarget}${closeAngle ?? ""}${title ?? ""}${suffix}`;
    },
  );
}

function addFrontmatter(entry, markdown) {
  const frontmatter = [
    "---",
    `title: ${JSON.stringify(entry.title)}`,
    `description: ${JSON.stringify(entry.description)}`,
    "---",
    "",
  ].join("\n");

  return `${frontmatter}${markdown.trimStart()}`;
}

function createMissingStub(entry) {
  return [
    "> **Synced document unavailable**",
    ">",
    "> This operator document arrives with the public repository split.",
    "",
    `The canonical source will be \`${entry.source}\`. This generated placeholder keeps the documentation build available until that file lands.`,
    "",
  ].join("\n");
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function syncRepoDocs({
  docsSiteRoot,
  logger = console,
  manifest = repoDocsManifest,
  repositoryRoot,
}) {
  const availability = await Promise.all(
    manifest.entries.map(async (entry) => ({
      entry,
      exists: await fileExists(path.join(repositoryRoot, entry.source)),
    })),
  );
  const missing = availability.filter(({ exists }) => !exists);

  if (manifest.requireAll && missing.length > 0) {
    throw new Error(
      `Required repository document is missing: ${missing[0].entry.source}`,
    );
  }

  const outputDirectories = new Set(
    manifest.entries.map((entry) =>
      path.dirname(path.join(docsSiteRoot, entry.output)),
    ),
  );

  await Promise.all(
    [...outputDirectories].map(async (outputDirectory) => {
      await rm(outputDirectory, { force: true, recursive: true });
      await mkdir(outputDirectory, { recursive: true });
    }),
  );

  let copiedCount = 0;
  let stubCount = 0;

  for (const { entry, exists } of availability) {
    let markdown;

    if (exists) {
      markdown = await readFile(
        path.join(repositoryRoot, entry.source),
        "utf8",
      );
      markdown = rewriteRelativeLinks(markdown, entry, [
        ...manifest.entries,
        ...(manifest.links ?? []),
      ]);
      copiedCount += 1;
    } else {
      logger.warn(
        `[sync-repo-docs] WARN: ${entry.source} is missing; writing a public-repository-split stub.`,
      );
      markdown = createMissingStub(entry);
      stubCount += 1;
    }

    await writeFile(
      path.join(docsSiteRoot, entry.output),
      addFrontmatter(entry, markdown),
      "utf8",
    );
  }

  return { copiedCount, stubCount };
}

const docsSiteRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = path.resolve(docsSiteRoot, "..");
const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const result = await syncRepoDocs({ docsSiteRoot, repositoryRoot });
  console.log(
    `[sync-repo-docs] Wrote ${result.copiedCount} source page(s) and ${result.stubCount} stub page(s).`,
  );
}
