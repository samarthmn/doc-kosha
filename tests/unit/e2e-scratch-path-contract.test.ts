import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { PDFDocument } from "pdf-lib";

type RotatedRedactionFixture = {
  directory: string;
  rotatedPath: string;
  cleanup: () => Promise<void>;
};

type RotatedRedactionFixtureFactory = () => Promise<RotatedRedactionFixture>;

type PdfMigrationFixture = {
  directory: string;
  large320Path: string;
  outlinedPath: string;
  rotatedPath: string;
  cleanup: () => Promise<void>;
};

type PdfMigrationFixtureFactory = () => Promise<PdfMigrationFixture>;

const isRotatedRedactionFixtureFactory = (
  value: unknown,
): value is RotatedRedactionFixtureFactory => typeof value === "function";

const isPdfMigrationFixtureFactory = (
  value: unknown,
): value is PdfMigrationFixtureFactory => typeof value === "function";

const readSpec = async (name: string): Promise<string> =>
  readFile(new URL(`../e2e/${name}`, import.meta.url), "utf8");

test("the redaction suite owns a deterministic rotated PDF fixture and cleanup", async () => {
  const fixtureModule: object = await import("../e2e/helpers/pdf-fixtures");
  const candidate: unknown = Reflect.get(
    fixtureModule,
    "createRotatedRedactionFixture",
  );
  if (!isRotatedRedactionFixtureFactory(candidate)) {
    assert.fail("pdf-fixtures must export createRotatedRedactionFixture");
  }
  const createFixture = candidate;

  const scratchRoot = path.join(process.cwd(), "tmp");
  const firstFixture = await createFixture();
  let secondFixture: RotatedRedactionFixture | null = null;

  try {
    secondFixture = await createFixture();
    assert.equal(path.dirname(firstFixture.directory), scratchRoot);
    assert.equal(path.dirname(secondFixture.directory), scratchRoot);
    assert.match(
      path.basename(firstFixture.directory),
      /^e2e-document-redaction-/,
    );
    assert.match(
      path.basename(secondFixture.directory),
      /^e2e-document-redaction-/,
    );
    assert.notEqual(firstFixture.directory, secondFixture.directory);
    assert.equal(
      firstFixture.rotatedPath,
      path.join(firstFixture.directory, "rotated.pdf"),
    );
    assert.equal(
      secondFixture.rotatedPath,
      path.join(secondFixture.directory, "rotated.pdf"),
    );

    const firstBytes = await readFile(firstFixture.rotatedPath);
    const secondBytes = await readFile(secondFixture.rotatedPath);
    assert.deepEqual(secondBytes, firstBytes);

    const document = await PDFDocument.load(firstBytes);
    assert.deepEqual(
      document.getPages().map((page) => page.getRotation().angle),
      [0, 90, 180, 270],
    );

    await firstFixture.cleanup();
    await assert.rejects(access(firstFixture.rotatedPath));
    await access(secondFixture.rotatedPath);
  } finally {
    await firstFixture.cleanup();
    await secondFixture?.cleanup();
  }
});

test("PDF migration fixtures stay inside repository tmp and clean their owned directory", async () => {
  const fixtureModule: object = await import("../e2e/helpers/pdf-fixtures");
  const candidate: unknown = Reflect.get(
    fixtureModule,
    "createPdfMigrationFixtures",
  );
  if (!isPdfMigrationFixtureFactory(candidate)) {
    assert.fail("pdf-fixtures must export createPdfMigrationFixtures");
  }

  const fixture = await candidate();
  const scratchRoot = path.join(process.cwd(), "tmp");

  try {
    assert.equal(path.dirname(fixture.directory), scratchRoot);
    assert.match(path.basename(fixture.directory), /^e2e-pdf-migration-/);
    assert.equal(
      fixture.large320Path,
      path.join(fixture.directory, "large-320.pdf"),
    );
    assert.equal(
      fixture.outlinedPath,
      path.join(fixture.directory, "outlined.pdf"),
    );
    assert.equal(
      fixture.rotatedPath,
      path.join(fixture.directory, "rotated.pdf"),
    );

    await Promise.all([
      access(fixture.large320Path),
      access(fixture.outlinedPath),
      access(fixture.rotatedPath),
    ]);
  } finally {
    await fixture.cleanup();
  }

  await assert.rejects(access(fixture.directory));
});

test("PDF migration fixture cleanup survives browser teardown failure", async () => {
  const source = await readSpec("pdf-migration-verification.spec.ts");

  assert.match(
    source,
    /try\s*\{\s*await context\?\.close\(\);\s*\}\s*finally\s*\{\s*await fixtures\?\.cleanup\(\);\s*\}/u,
  );
});
