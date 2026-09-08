import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { promisify } from "node:util";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import test from "node:test";
import { parseGeneratorArguments } from "../../scripts/public-fixture-args.mjs";

const execFileAsync = promisify(execFile);
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const assets = ["public/dummy-pdf.pdf", "public/assets/blog-placeholder.png"];
const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

export const parseProvenanceHashes = (provenance: string) => {
  const hashes = new Map<string, string>();
  for (const asset of assets) {
    const escaped = asset.replaceAll("/", "\\/");
    const pattern = "\\| `" + escaped + "`\\s+\\| `([0-9a-f]{64})`\\s+\\|";
    const matches = [...provenance.matchAll(new RegExp(pattern, "gu"))];
    assert.equal(
      matches.length,
      1,
      `${asset} must have exactly one valid provenance row`,
    );
    hashes.set(asset, matches[0][1]);
  }
  return hashes;
};

test("public synthetic fixtures regenerate deterministically with safe metadata", async () => {
  await mkdir(join(root, "tmp"), { recursive: true });
  const scratch = await mkdtemp(join(root, "tmp", "fixture-regeneration-"));
  try {
    await execFileAsync(
      "node",
      ["scripts/generate-public-fixtures.mjs", `--output-root=${scratch}`],
      { cwd: root },
    );
    const provenance = await readFile(
      join(root, "FIXTURE_PROVENANCE.md"),
      "utf8",
    );
    const provenanceHashes = parseProvenanceHashes(provenance);
    for (const relative of assets) {
      const committed = await readFile(join(root, relative));
      assert.equal(
        sha256(committed),
        provenanceHashes.get(relative),
        `${relative} provenance hash drifted`,
      );
      assert.equal(
        sha256(await readFile(join(scratch, relative))),
        sha256(committed),
        `${relative} is not deterministic`,
      );
    }
    const pdfBytes = await readFile(join(root, assets[0]));
    const pdf = await PDFDocument.load(pdfBytes);
    assert.equal(pdf.getPageCount(), 1);
    assert.deepEqual(
      [pdf.getPage(0).getWidth(), pdf.getPage(0).getHeight()],
      [612, 792],
    );
    assert.equal(pdf.getAuthor(), "DocKosha project");
    assert.doesNotMatch(
      pdfBytes.toString("latin1"),
      /\/FontFile|\/EmbeddedFiles/u,
    );
    const pngMetadata = await sharp(
      await readFile(join(root, assets[1])),
    ).metadata();
    assert.deepEqual(
      [pngMetadata.width, pngMetadata.height, pngMetadata.format],
      [1024, 1024, "png"],
    );
    assert.equal(pngMetadata.exif, undefined);
    assert.equal(pngMetadata.xmp, undefined);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("unused public/grid.svg is not generated or retained", async () => {
  await mkdir(join(root, "tmp"), { recursive: true });
  const scratch = await mkdtemp(join(root, "tmp", "fixture-no-grid-"));
  try {
    await execFileAsync(
      "node",
      ["scripts/generate-public-fixtures.mjs", `--output-root=${scratch}`],
      { cwd: root },
    );
    await assert.rejects(() => access(join(scratch, "public/grid.svg")));
    await assert.rejects(() => access(join(root, "public/grid.svg")));
    const provenance = await readFile(
      join(root, "FIXTURE_PROVENANCE.md"),
      "utf8",
    );
    assert.doesNotMatch(
      provenance,
      /\| `public\/grid\.svg`\s+\|\s+`[0-9a-f]{64}`/u,
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("fixture generator rejects typos and missing output values", () => {
  assert.throws(
    () => parseGeneratorArguments(["--outpt-root=tmp"]),
    /Unknown generator argument/u,
  );
  assert.throws(
    () => parseGeneratorArguments(["--output-root="]),
    /requires a value/u,
  );
});

test("provenance parser rejects a mutated asset hash", async () => {
  const provenance = await readFile(
    join(root, "FIXTURE_PROVENANCE.md"),
    "utf8",
  );
  const mutated = provenance.replace(
    /(\| `public\/assets\/blog-placeholder\.png`\s+\| `)[0-9a-f]{64}/u,
    "$1" + "0".repeat(64),
  );
  const hashes = parseProvenanceHashes(mutated);
  assert.notEqual(
    hashes.get("public/assets/blog-placeholder.png"),
    sha256(await readFile(join(root, "public/assets/blog-placeholder.png"))),
  );
});
