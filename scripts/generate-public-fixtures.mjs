import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { parseGeneratorArguments } from "./public-fixture-args.mjs";

const { outputRoot } = parseGeneratorArguments(process.argv.slice(2));

const ensureParent = async (path) =>
  mkdir(join(path, ".."), { recursive: true });

const pdf = await PDFDocument.create();
pdf.setTitle("DocKosha document preview");
pdf.setAuthor("DocKosha project");
pdf.setSubject("Synthetic preview asset");
pdf.setKeywords(["DocKosha", "synthetic", "preview"]);
const fixedDate = new Date("2026-01-01T00:00:00.000Z");
pdf.setCreationDate(fixedDate);
pdf.setModificationDate(fixedDate);
const page = pdf.addPage([612, 792]);
const regular = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
page.drawRectangle({
  x: 0,
  y: 0,
  width: 612,
  height: 792,
  color: rgb(0.97, 0.98, 1),
});
page.drawRectangle({
  x: 42,
  y: 42,
  width: 528,
  height: 708,
  borderColor: rgb(0.78, 0.84, 0.93),
  borderWidth: 1,
});
page.drawText("DocKosha document preview", {
  x: 72,
  y: 682,
  size: 24,
  font: bold,
  color: rgb(0.08, 0.16, 0.29),
});
page.drawText(
  "A synthetic one-page sample for local development and UI previews.",
  { x: 72, y: 646, size: 11, font: regular, color: rgb(0.24, 0.31, 0.42) },
);
page.drawRectangle({
  x: 72,
  y: 588,
  width: 468,
  height: 1,
  color: rgb(0.35, 0.55, 0.82),
});
page.drawText("Preview notes", {
  x: 72,
  y: 548,
  size: 15,
  font: bold,
  color: rgb(0.08, 0.16, 0.29),
});
[
  "This file contains project-written placeholder prose,",
  "vector shapes, and no external images or embedded fonts.",
  "Preview watermark and branding settings using this sample.",
].forEach((line, index) =>
  page.drawText(line, {
    x: 72,
    y: 516 - index * 22,
    size: 12,
    font: regular,
    color: rgb(0.2, 0.25, 0.34),
  }),
);
page.drawRectangle({
  x: 72,
  y: 350,
  width: 468,
  height: 112,
  color: rgb(0.9, 0.94, 0.99),
  borderColor: rgb(0.72, 0.82, 0.95),
  borderWidth: 1,
});
page.drawText("SYNTHETIC FIXTURE", {
  x: 94,
  y: 414,
  size: 12,
  font: bold,
  color: rgb(0.12, 0.32, 0.58),
});
page.drawText("Use this sample to exercise document viewers", {
  x: 94,
  y: 386,
  size: 12,
  font: regular,
  color: rgb(0.16, 0.22, 0.31),
});
page.drawText("without relying on third-party source material.", {
  x: 94,
  y: 364,
  size: 12,
  font: regular,
  color: rgb(0.16, 0.22, 0.31),
});
page.drawText("DocKosha • public preview asset", {
  x: 72,
  y: 86,
  size: 10,
  font: regular,
  color: rgb(0.36, 0.43, 0.54),
});
const pdfBytes = await pdf.save({
  useObjectStreams: false,
  addDefaultPage: false,
});
const pdfPath = join(outputRoot, "public/dummy-pdf.pdf");
await ensureParent(pdfPath);
await writeFile(pdfPath, pdfBytes);

const pixels = Buffer.alloc(1024 * 1024 * 4);
for (let y = 0; y < 1024; y += 1)
  for (let x = 0; x < 1024; x += 1) {
    const i = (y * 1024 + x) * 4;
    const band = Math.floor((x + y) / 128) % 2;
    pixels[i] = band ? 31 : 18;
    pixels[i + 1] = band ? 77 : 48;
    pixels[i + 2] = band ? 121 : 92;
    pixels[i + 3] = 255;
  }
const pngPath = join(outputRoot, "public/assets/blog-placeholder.png");
await ensureParent(pngPath);
await sharp(pixels, { raw: { width: 1024, height: 1024, channels: 4 } })
  .png({ compressionLevel: 9, adaptiveFiltering: false })
  .toFile(pngPath);
