import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  degrees,
  PDFDocument,
  PDFHexString,
  PDFName,
  StandardFonts,
} from "pdf-lib";

const PAGE_SIZE: [number, number] = [612, 792];
const LARGE_PAGE_COUNT = 320;
const SEARCH_TARGET_PAGE = 275;

export type PdfMigrationFixtures = {
  directory: string;
  large320Path: string;
  outlinedPath: string;
  rotatedPath: string;
  cleanup: () => Promise<void>;
};

export type RotatedRedactionFixture = {
  directory: string;
  rotatedPath: string;
  cleanup: () => Promise<void>;
};

const createLargePdf = async (): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (let pageNumber = 1; pageNumber <= LARGE_PAGE_COUNT; pageNumber += 1) {
    const page = pdf.addPage(PAGE_SIZE);
    page.drawText(`DocKosha large fixture page ${pageNumber}`, {
      x: 60,
      y: 700,
      size: 24,
      font,
    });
    page.drawText(`unique-marker-${pageNumber}`, {
      x: 60,
      y: 650,
      size: 12,
      font,
    });
    if (pageNumber === SEARCH_TARGET_PAGE) {
      page.drawText("NEEDLEWORD", {
        x: 60,
        y: 600,
        size: 18,
        font,
      });
    }
  }

  return await pdf.save();
};

const createOutlinedPdf = async (): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const chapterTitles = [
    "Chapter One",
    "Chapter Two",
    "Chapter Three",
    "Chapter Four",
  ] as const;
  const pages = chapterTitles.map((title) => {
    const page = pdf.addPage(PAGE_SIZE);
    page.drawText(title, {
      x: 60,
      y: 700,
      size: 28,
      font,
    });
    return page;
  });

  pages[0].drawText("Jump to Chapter Four", {
    x: 60,
    y: 600,
    size: 16,
    font,
  });

  const { context } = pdf;
  const outlines = context.obj({
    Type: "Outlines",
    Count: chapterTitles.length,
  });
  const outlinesRef = context.register(outlines);
  const outlineItems = chapterTitles.map((title, index) => {
    const item = context.obj({
      Parent: outlinesRef,
      Dest: context.obj([pages[index].ref, PDFName.of("Fit")]),
      Title: PDFHexString.fromText(title),
    });
    return { item, ref: context.register(item) };
  });

  outlineItems.forEach(({ item }, index) => {
    const previous = outlineItems[index - 1];
    const next = outlineItems[index + 1];
    if (previous) item.set(PDFName.of("Prev"), previous.ref);
    if (next) item.set(PDFName.of("Next"), next.ref);
  });
  const firstOutline = outlineItems[0];
  const lastOutline = outlineItems.at(-1);
  if (!firstOutline || !lastOutline) {
    throw new Error("The outlined PDF requires at least one chapter");
  }
  outlines.set(PDFName.of("First"), firstOutline.ref);
  outlines.set(PDFName.of("Last"), lastOutline.ref);
  pdf.catalog.set(PDFName.of("Outlines"), outlinesRef);

  const goToChapterFour = context.obj({
    Type: "Action",
    S: "GoTo",
    D: context.obj([pages[3].ref, PDFName.of("Fit")]),
  });
  const linkAnnotation = context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: context.obj([58, 592, 260, 622]),
    Border: context.obj([0, 0, 0]),
    A: goToChapterFour,
  });
  pages[0].node.set(
    PDFName.of("Annots"),
    context.obj([context.register(linkAnnotation)]),
  );

  return await pdf.save();
};

const createRotatedPdf = async (): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const rotation of [0, 90, 180, 270]) {
    const page = pdf.addPage(PAGE_SIZE);
    page.setRotation(degrees(rotation));
    page.drawText(`rotate-${rotation} TARGETWORD`, {
      x: 60,
      y: 700,
      size: 20,
      font,
    });
  }

  return await pdf.save();
};

export const createRotatedRedactionFixture =
  async (): Promise<RotatedRedactionFixture> => {
    const scratchRoot = path.join(process.cwd(), "tmp");
    await mkdir(scratchRoot, { recursive: true });
    const directory = await mkdtemp(
      path.join(scratchRoot, "e2e-document-redaction-"),
    );
    const rotatedPath = path.join(directory, "rotated.pdf");

    try {
      await writeFile(rotatedPath, await createRotatedPdf());
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }

    return {
      directory,
      rotatedPath,
      cleanup: async (): Promise<void> => {
        await rm(directory, { recursive: true, force: true });
      },
    };
  };

export const createPdfMigrationFixtures =
  async (): Promise<PdfMigrationFixtures> => {
    const scratchRoot = path.join(process.cwd(), "tmp");
    await mkdir(scratchRoot, { recursive: true });
    const directory = await mkdtemp(
      path.join(scratchRoot, "e2e-pdf-migration-"),
    );
    const large320Path = path.join(directory, "large-320.pdf");
    const outlinedPath = path.join(directory, "outlined.pdf");
    const rotatedPath = path.join(directory, "rotated.pdf");

    try {
      const [largePdf, outlinedPdf, rotatedPdf] = await Promise.all([
        createLargePdf(),
        createOutlinedPdf(),
        createRotatedPdf(),
      ]);
      await Promise.all([
        writeFile(large320Path, largePdf),
        writeFile(outlinedPath, outlinedPdf),
        writeFile(rotatedPath, rotatedPdf),
      ]);
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }

    return {
      directory,
      large320Path,
      outlinedPath,
      rotatedPath,
      cleanup: async (): Promise<void> => {
        await rm(directory, { recursive: true, force: true });
      },
    };
  };
