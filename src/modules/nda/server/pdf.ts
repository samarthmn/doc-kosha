import { DOMParser } from "@xmldom/xmldom";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import { parseNdaSignatureImageDataUrl } from "@/modules/nda/server/signaturePayload";

type GenerateSignedNdaPdfInput = {
  workspaceName: string;
  documentTitle: string;
  receivingPartyName: string;
  receivingPartyEmail: string;
  effectiveDate: Date | string | number;
  signedDateTime: Date | string | number;
  signatureDataUrl: string;
  bodyHtml: string;
};

type TextStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

type RichTextRun = {
  text: string;
  style: TextStyle;
};

type ParagraphBlock = {
  type: "paragraph";
  runs: RichTextRun[];
};

type HeadingBlock = {
  type: "heading";
  level: 2 | 3 | 4;
  runs: RichTextRun[];
};

type ListBlock = {
  type: "list";
  ordered: boolean;
  items: RichTextRun[][];
};

type NdaPdfBlock = ParagraphBlock | HeadingBlock | ListBlock;

type Token = {
  text: string;
  style: TextStyle;
  kind: "word" | "space" | "newline";
};

type LineSegment = {
  text: string;
  style: TextStyle;
  width: number;
};

type LineLayout = {
  segments: LineSegment[];
  width: number;
};

type SignatureImage = {
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
};

type SignatureBox = {
  width: number;
  height: number;
};

type PdfFonts = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
};

type DrawTextOptions = {
  x: number;
  width: number;
  fontSize: number;
  lineHeight: number;
  color: ReturnType<typeof rgb>;
  paragraphSpacing: number;
  preserveTrailingGap?: boolean;
};

type RenderContext = {
  pdfDoc: PDFDocument;
  page: PDFPage;
  pageWidth: number;
  pageHeight: number;
  cursorY: number;
  topMargin: number;
  bottomMargin: number;
  leftMargin: number;
  rightMargin: number;
  fonts: PdfFonts;
};

const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const PAGE_TOP_MARGIN = 48;
const PAGE_BOTTOM_MARGIN = 48;
const PAGE_SIDE_MARGIN = 56;
const BODY_FONT_SIZE = 14;
const BODY_LINE_HEIGHT = 22;
const PARAGRAPH_SPACING = 10;
const TITLE_FONT_SIZE = 24;
const TITLE_LINE_HEIGHT = 32;
const META_FONT_SIZE = 13;
const META_LINE_HEIGHT = 18;
const HEADING_STYLES: Record<2 | 3 | 4, { size: number; lineHeight: number }> =
  {
    2: { size: 18, lineHeight: 24 },
    3: { size: 16, lineHeight: 22 },
    4: { size: 15, lineHeight: 20 },
  };

const COLORS = {
  text: rgb(15 / 255, 23 / 255, 42 / 255),
  muted: rgb(100 / 255, 116 / 255, 139 / 255),
  border: rgb(226 / 255, 232 / 255, 240 / 255),
  boxBackground: rgb(248 / 255, 250 / 255, 252 / 255),
};

const toDate = (value: Date | string | number): Date => {
  if (value instanceof Date) return new Date(value.getTime());
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`toDate received an invalid date value: ${String(value)}`);
  }
  return parsed;
};

const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);

const formatDateTime = (date: Date): string =>
  new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);

const normalizeInlineText = (value: string): string =>
  value.replace(/\u00a0/g, " ").replace(/\s+/g, " ");

const mergeRuns = (runs: RichTextRun[]): RichTextRun[] => {
  const merged: RichTextRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.style.bold === run.style.bold &&
      previous.style.italic === run.style.italic &&
      previous.style.underline === run.style.underline
    ) {
      previous.text += run.text;
      continue;
    }
    merged.push({ text: run.text, style: { ...run.style } });
  }
  return merged;
};

const parseRichTextRuns = (
  node: Node,
  activeStyle: TextStyle = {},
): RichTextRun[] => {
  if (node.nodeType === node.TEXT_NODE) {
    const text = normalizeInlineText(node.nodeValue ?? "");
    return text ? [{ text, style: { ...activeStyle } }] : [];
  }

  if (node.nodeType !== node.ELEMENT_NODE) {
    return [];
  }

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();

  if (tagName === "br") {
    return [{ text: "\n", style: { ...activeStyle } }];
  }

  const nextStyle: TextStyle = {
    ...activeStyle,
    bold: activeStyle.bold || tagName === "strong" || tagName === "b",
    italic: activeStyle.italic || tagName === "em" || tagName === "i",
    underline: activeStyle.underline || tagName === "u",
  };

  const childRuns = Array.from(element.childNodes).flatMap((child) =>
    parseRichTextRuns(child, nextStyle),
  );

  return mergeRuns(childRuns);
};

const collectListItemRuns = (listItem: Element): RichTextRun[] => {
  const parts: RichTextRun[] = [];

  for (const child of Array.from(listItem.childNodes)) {
    if (child.nodeType === child.TEXT_NODE) {
      parts.push(...parseRichTextRuns(child));
      continue;
    }

    if (child.nodeType !== child.ELEMENT_NODE) {
      continue;
    }

    const element = child as Element;
    const tagName = element.tagName.toLowerCase();

    if (tagName === "ul" || tagName === "ol") {
      continue;
    }

    parts.push(...parseRichTextRuns(element));
  }

  return mergeRuns(parts);
};

const NAMED_HTML_ENTITIES: Record<string, string> = {
  nbsp: "\u00a0",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  bull: "\u2022",
};

const decodeHtmlEntity = (entity: string): string => {
  const normalized = entity.trim().toLowerCase();

  if (normalized.startsWith("#x")) {
    const codePoint = Number.parseInt(normalized.slice(2), 16);
    return Number.isFinite(codePoint)
      ? String.fromCodePoint(codePoint)
      : `&${entity};`;
  }

  if (normalized.startsWith("#")) {
    const codePoint = Number.parseInt(normalized.slice(1), 10);
    return Number.isFinite(codePoint)
      ? String.fromCodePoint(codePoint)
      : `&${entity};`;
  }

  return NAMED_HTML_ENTITIES[normalized] ?? `&${entity};`;
};

const normalizeBodyHtmlForXml = (bodyHtml: string): string =>
  bodyHtml
    .replace(/&([a-zA-Z0-9#]+);/g, (_match, entity: string) =>
      decodeHtmlEntity(entity),
    )
    .replace(/<br\s*\/?>/gi, "<br />");

const parseHtmlRoot = (bodyHtml: string): Element => {
  const parser = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: () => undefined,
      fatalError: (message) => {
        throw new Error(message);
      },
    },
  });

  const normalized = normalizeBodyHtmlForXml(bodyHtml.trim());
  const xml = `<root>${normalized}</root>`;
  const document = parser.parseFromString(xml, "text/xml");
  const root = document.documentElement;
  const parserErrors = document.getElementsByTagName("parsererror");

  if (!root || root.tagName !== "root" || parserErrors.length > 0) {
    throw new Error("Unable to parse NDA body HTML");
  }

  return root;
};

const parseBlocksFromNode = (node: Node): NdaPdfBlock[] => {
  if (node.nodeType === node.TEXT_NODE) {
    const text = normalizeInlineText(node.nodeValue ?? "").trim();
    return text ? [{ type: "paragraph", runs: [{ text, style: {} }] }] : [];
  }

  if (node.nodeType !== node.ELEMENT_NODE) {
    return [];
  }

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();

  if (tagName === "p") {
    const runs = mergeRuns(parseRichTextRuns(element)).filter(
      (run) => run.text.trim().length > 0 || run.text.includes("\n"),
    );
    return runs.length > 0 ? [{ type: "paragraph", runs }] : [];
  }

  if (tagName === "h2" || tagName === "h3" || tagName === "h4") {
    const runs = mergeRuns(parseRichTextRuns(element)).filter(
      (run) => run.text.trim().length > 0,
    );
    return runs.length > 0
      ? [{ type: "heading", level: Number(tagName[1]) as 2 | 3 | 4, runs }]
      : [];
  }

  if (tagName === "ul" || tagName === "ol") {
    const items = Array.from(element.childNodes)
      .filter(
        (child): child is Element =>
          child.nodeType === child.ELEMENT_NODE &&
          (child as Element).tagName.toLowerCase() === "li",
      )
      .map((listItem) => mergeRuns(collectListItemRuns(listItem)))
      .filter((runs) => runs.some((run) => run.text.trim().length > 0));

    return items.length > 0
      ? [{ type: "list", ordered: tagName === "ol", items }]
      : [];
  }

  return Array.from(element.childNodes).flatMap((child) =>
    parseBlocksFromNode(child),
  );
};

const parseNdaBodyHtml = (bodyHtml: string): NdaPdfBlock[] => {
  const trimmed = bodyHtml.trim();
  if (!trimmed) {
    throw new Error("NDA template body is required");
  }

  const root = parseHtmlRoot(trimmed);
  return Array.from(root.childNodes).flatMap((child) =>
    parseBlocksFromNode(child),
  );
};

const resolveFont = (fonts: PdfFonts, style: TextStyle): PDFFont => {
  if (style.bold && style.italic) return fonts.boldItalic;
  if (style.bold) return fonts.bold;
  if (style.italic) return fonts.italic;
  return fonts.regular;
};

const tokenizeRuns = (runs: RichTextRun[]): Token[] => {
  const tokens: Token[] = [];

  for (const run of runs) {
    const parts = run.text.split(/(\n| +)/);
    for (const part of parts) {
      if (!part) continue;
      if (part === "\n") {
        tokens.push({ text: "\n", style: run.style, kind: "newline" });
        continue;
      }
      if (/^ +$/.test(part)) {
        tokens.push({ text: " ", style: run.style, kind: "space" });
        continue;
      }
      tokens.push({ text: part, style: run.style, kind: "word" });
    }
  }

  return tokens;
};

const measureText = (
  fonts: PdfFonts,
  text: string,
  style: TextStyle,
  fontSize: number,
): number => resolveFont(fonts, style).widthOfTextAtSize(text, fontSize);

const splitWordToFit = (
  fonts: PdfFonts,
  word: string,
  style: TextStyle,
  fontSize: number,
  maxWidth: number,
): [string, string] => {
  let index = 0;

  for (let i = 1; i <= word.length; i += 1) {
    const candidate = word.slice(0, i);
    if (measureText(fonts, candidate, style, fontSize) <= maxWidth) {
      index = i;
      continue;
    }
    break;
  }

  if (index <= 0) {
    index = 1;
  }

  return [word.slice(0, index), word.slice(index)];
};

const layoutRuns = (
  fonts: PdfFonts,
  runs: RichTextRun[],
  fontSize: number,
  maxWidth: number,
): LineLayout[] => {
  const tokens = tokenizeRuns(runs);
  const lines: LineLayout[] = [];
  let currentSegments: LineSegment[] = [];
  let currentWidth = 0;

  const pushLine = () => {
    if (currentSegments.length === 0) return;
    lines.push({ segments: currentSegments, width: currentWidth });
    currentSegments = [];
    currentWidth = 0;
  };

  const pushToken = (text: string, style: TextStyle) => {
    const width = measureText(fonts, text, style, fontSize);
    if (width <= 0) return;
    currentSegments.push({ text, style, width });
    currentWidth += width;
  };

  for (const token of tokens) {
    if (token.kind === "newline") {
      pushLine();
      continue;
    }

    if (token.kind === "space") {
      if (currentSegments.length === 0) continue;
      const width = measureText(fonts, token.text, token.style, fontSize);
      if (currentWidth + width > maxWidth) {
        pushLine();
        continue;
      }
      pushToken(token.text, token.style);
      continue;
    }

    let remainder = token.text;

    while (remainder.length > 0) {
      const width = measureText(fonts, remainder, token.style, fontSize);
      if (currentWidth + width <= maxWidth) {
        pushToken(remainder, token.style);
        remainder = "";
        continue;
      }

      if (currentSegments.length > 0) {
        pushLine();
        continue;
      }

      const [fit, rest] = splitWordToFit(
        fonts,
        remainder,
        token.style,
        fontSize,
        maxWidth,
      );
      pushToken(fit, token.style);
      pushLine();
      remainder = rest;
    }
  }

  pushLine();

  return lines.length > 0
    ? lines
    : [{ segments: [{ text: "", style: {}, width: 0 }], width: 0 }];
};

const createRenderContext = async (): Promise<RenderContext> => {
  const pdfDoc = await PDFDocument.create();
  const fonts: PdfFonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const page = pdfDoc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);

  return {
    pdfDoc,
    page,
    pageWidth: LETTER_WIDTH,
    pageHeight: LETTER_HEIGHT,
    cursorY: LETTER_HEIGHT - PAGE_TOP_MARGIN,
    topMargin: PAGE_TOP_MARGIN,
    bottomMargin: PAGE_BOTTOM_MARGIN,
    leftMargin: PAGE_SIDE_MARGIN,
    rightMargin: PAGE_SIDE_MARGIN,
    fonts,
  };
};

const addPage = (context: RenderContext): void => {
  context.page = context.pdfDoc.addPage([
    context.pageWidth,
    context.pageHeight,
  ]);
  context.cursorY = context.pageHeight - context.topMargin;
};

const ensureSpace = (context: RenderContext, requiredHeight: number): void => {
  if (context.cursorY - requiredHeight < context.bottomMargin) {
    addPage(context);
  }
};

const drawLaidOutLines = (
  context: RenderContext,
  lines: LineLayout[],
  options: DrawTextOptions,
): void => {
  for (const line of lines) {
    ensureSpace(context, options.lineHeight);

    let currentX = options.x;
    const textY = context.cursorY - options.fontSize;

    for (const segment of line.segments) {
      if (!segment.text) continue;
      const font = resolveFont(context.fonts, segment.style);
      context.page.drawText(segment.text, {
        x: currentX,
        y: textY,
        size: options.fontSize,
        font,
        color: options.color,
      });

      if (segment.style.underline) {
        context.page.drawLine({
          start: { x: currentX, y: textY - 1.5 },
          end: { x: currentX + segment.width, y: textY - 1.5 },
          thickness: 0.7,
          color: options.color,
        });
      }

      currentX += segment.width;
    }

    context.cursorY -= options.lineHeight;
  }

  if (options.preserveTrailingGap) {
    context.cursorY -= options.paragraphSpacing;
  }
};

const drawWrappedRuns = (
  context: RenderContext,
  runs: RichTextRun[],
  options: DrawTextOptions,
): void => {
  const lines = layoutRuns(
    context.fonts,
    runs,
    options.fontSize,
    options.width,
  );
  drawLaidOutLines(context, lines, {
    ...options,
    preserveTrailingGap: true,
  });
};

const measureWrappedRunsHeight = (
  fonts: PdfFonts,
  runs: RichTextRun[],
  fontSize: number,
  lineHeight: number,
  width: number,
): number => layoutRuns(fonts, runs, fontSize, width).length * lineHeight;

const drawCenteredTitle = (context: RenderContext): void => {
  const title = "Non-Disclosure Agreement";
  const width = context.fonts.bold.widthOfTextAtSize(title, TITLE_FONT_SIZE);
  const x = (context.pageWidth - width) / 2;

  ensureSpace(context, TITLE_LINE_HEIGHT + 16);
  context.page.drawText(title, {
    x,
    y: context.cursorY - TITLE_FONT_SIZE,
    size: TITLE_FONT_SIZE,
    font: context.fonts.bold,
    color: COLORS.text,
  });
  context.cursorY -= TITLE_LINE_HEIGHT + 12;
};

const drawMetaBox = (
  context: RenderContext,
  input: {
    workspaceName: string;
    receivingPartyName: string;
    receivingPartyEmail: string;
    documentTitle: string;
    effectiveDateFormatted: string;
  },
): void => {
  const innerWidth =
    context.pageWidth - context.leftMargin - context.rightMargin - 40;
  const rows: RichTextRun[][] = [
    [
      { text: "Disclosing Party: ", style: { bold: true } },
      { text: input.workspaceName, style: {} },
    ],
    [
      { text: "Receiving Party: ", style: { bold: true } },
      { text: input.receivingPartyName, style: {} },
    ],
    [
      { text: "Receiving Party Email: ", style: { bold: true } },
      { text: input.receivingPartyEmail, style: {} },
    ],
    [
      { text: "Covered Document: ", style: { bold: true } },
      { text: input.documentTitle, style: {} },
    ],
    [
      { text: "Effective Date: ", style: { bold: true } },
      { text: input.effectiveDateFormatted, style: {} },
    ],
  ];

  const contentHeight = rows.reduce((sum, row, index) => {
    const height = measureWrappedRunsHeight(
      context.fonts,
      row,
      META_FONT_SIZE,
      META_LINE_HEIGHT,
      innerWidth,
    );
    return sum + height + (index < rows.length - 1 ? 6 : 0);
  }, 0);
  const boxHeight = contentHeight + 32;

  ensureSpace(context, boxHeight + 20);

  const x = context.leftMargin;
  const y = context.cursorY - boxHeight;
  const width = context.pageWidth - context.leftMargin - context.rightMargin;

  context.page.drawRectangle({
    x,
    y,
    width,
    height: boxHeight,
    color: COLORS.boxBackground,
    borderColor: COLORS.border,
    borderWidth: 1,
  });

  context.cursorY -= 20;
  for (const row of rows) {
    drawWrappedRuns(context, row, {
      x: x + 20,
      width: innerWidth,
      fontSize: META_FONT_SIZE,
      lineHeight: META_LINE_HEIGHT,
      color: COLORS.text,
      paragraphSpacing: 6,
    });
  }
  context.cursorY -= 14;
};

const drawBodyBlocks = (
  context: RenderContext,
  blocks: NdaPdfBlock[],
): void => {
  for (const block of blocks) {
    if (block.type === "paragraph") {
      drawWrappedRuns(context, block.runs, {
        x: context.leftMargin,
        width: context.pageWidth - context.leftMargin - context.rightMargin,
        fontSize: BODY_FONT_SIZE,
        lineHeight: BODY_LINE_HEIGHT,
        color: COLORS.text,
        paragraphSpacing: PARAGRAPH_SPACING,
      });
      continue;
    }

    if (block.type === "heading") {
      const headingStyle = HEADING_STYLES[block.level];
      context.cursorY -= 4;
      drawWrappedRuns(
        context,
        block.runs.map((run) => ({
          ...run,
          style: { ...run.style, bold: true },
        })),
        {
          x: context.leftMargin,
          width: context.pageWidth - context.leftMargin - context.rightMargin,
          fontSize: headingStyle.size,
          lineHeight: headingStyle.lineHeight,
          color: COLORS.text,
          paragraphSpacing: 6,
        },
      );
      continue;
    }

    for (const [index, item] of block.items.entries()) {
      const prefix = block.ordered ? `${index + 1}.` : "\u2022";
      const prefixWidth = context.fonts.bold.widthOfTextAtSize(
        prefix,
        BODY_FONT_SIZE,
      );
      const indent = 18;
      const textX = context.leftMargin + indent;
      const lineWidth = context.pageWidth - textX - context.rightMargin;
      const lines = layoutRuns(context.fonts, item, BODY_FONT_SIZE, lineWidth);

      for (const [lineIndex, line] of lines.entries()) {
        ensureSpace(context, BODY_LINE_HEIGHT);
        const prefixX = context.leftMargin;
        const baselineY = context.cursorY - BODY_FONT_SIZE;

        if (lineIndex === 0) {
          context.page.drawText(prefix, {
            x: prefixX,
            y: baselineY,
            size: BODY_FONT_SIZE,
            font: context.fonts.bold,
            color: COLORS.text,
          });
        }

        let currentX = textX;
        for (const segment of line.segments) {
          const font = resolveFont(context.fonts, segment.style);
          context.page.drawText(segment.text, {
            x: currentX,
            y: baselineY,
            size: BODY_FONT_SIZE,
            font,
            color: COLORS.text,
          });
          if (segment.style.underline) {
            context.page.drawLine({
              start: { x: currentX, y: baselineY - 1.5 },
              end: { x: currentX + segment.width, y: baselineY - 1.5 },
              thickness: 0.7,
              color: COLORS.text,
            });
          }
          currentX += segment.width;
        }

        context.cursorY -= BODY_LINE_HEIGHT;
      }

      context.cursorY -= 4;
      if (prefixWidth > indent) {
        context.cursorY -= 0;
      }
    }

    context.cursorY -= 8;
  }
};

const parseSignatureDataUrl = (signatureDataUrl: string): SignatureImage => {
  return parseNdaSignatureImageDataUrl(signatureDataUrl);
};

const fitSignatureBox = (dimensions: {
  width: number;
  height: number;
}): SignatureBox => {
  const maxWidth = 180;
  const maxHeight = 82;
  const safeWidth = Math.max(1, dimensions.width);
  const safeHeight = Math.max(1, dimensions.height);
  const scale = Math.min(maxWidth / safeWidth, maxHeight / safeHeight, 1);
  return {
    width: safeWidth * scale,
    height: safeHeight * scale,
  };
};

const embedSignatureImage = async (
  context: RenderContext,
  signature: SignatureImage,
): Promise<{
  image: Awaited<ReturnType<PDFDocument["embedPng"]>>;
  box: SignatureBox;
}> => {
  const image =
    signature.mime === "image/png"
      ? await context.pdfDoc.embedPng(signature.bytes)
      : await context.pdfDoc.embedJpg(signature.bytes);
  return {
    image,
    box: fitSignatureBox({
      width: image.width,
      height: image.height,
    }),
  };
};

const drawSignatureSection = async (
  context: RenderContext,
  input: {
    receivingPartyName: string;
    receivingPartyEmail: string;
    signedDateTimeFormatted: string;
    signatureDataUrl: string;
  },
): Promise<void> => {
  const sectionEstimate = 220;
  ensureSpace(context, sectionEstimate);

  const topY = context.cursorY;
  context.page.drawLine({
    start: { x: context.leftMargin, y: topY },
    end: { x: context.pageWidth - context.rightMargin, y: topY },
    thickness: 1,
    color: COLORS.text,
  });
  context.cursorY -= 20;

  const header = "Receiving Party Acknowledgement";
  context.page.drawText(header, {
    x: context.leftMargin,
    y: context.cursorY - 14,
    size: 14,
    font: context.fonts.bold,
    color: COLORS.text,
  });
  context.cursorY -= 24;

  const details: RichTextRun[][] = [
    [
      { text: "Name: ", style: { bold: true } },
      { text: input.receivingPartyName, style: {} },
    ],
    [
      { text: "Email: ", style: { bold: true } },
      { text: input.receivingPartyEmail, style: {} },
    ],
    [
      { text: "Date Signed: ", style: { bold: true } },
      { text: input.signedDateTimeFormatted, style: {} },
    ],
  ];

  for (const row of details) {
    drawWrappedRuns(context, row, {
      x: context.leftMargin,
      width: context.pageWidth - context.leftMargin - context.rightMargin,
      fontSize: META_FONT_SIZE,
      lineHeight: META_LINE_HEIGHT,
      color: COLORS.text,
      paragraphSpacing: 4,
    });
  }

  const signature = parseSignatureDataUrl(input.signatureDataUrl);
  const { image, box } = await embedSignatureImage(context, signature);

  ensureSpace(context, box.height + 28);
  context.page.drawImage(image, {
    x: context.leftMargin,
    y: context.cursorY - box.height,
    width: box.width,
    height: box.height,
  });
  context.cursorY -= box.height + 18;

  const footnote = `Signed electronically on ${input.signedDateTimeFormatted}`;
  drawWrappedRuns(context, [{ text: footnote, style: {} }], {
    x: context.leftMargin,
    width: context.pageWidth - context.leftMargin - context.rightMargin,
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.muted,
    paragraphSpacing: 0,
  });
};

export const generateSignedNdaPdf = async (
  input: GenerateSignedNdaPdfInput,
): Promise<Uint8Array> => {
  const bodyBlocks = parseNdaBodyHtml(input.bodyHtml);
  const effectiveDate = toDate(input.effectiveDate);
  const signedDateTime = toDate(input.signedDateTime);
  const effectiveDateFormatted = formatDate(effectiveDate);
  const signedDateTimeFormatted = formatDateTime(signedDateTime);

  const context = await createRenderContext();
  drawCenteredTitle(context);
  drawMetaBox(context, {
    workspaceName: input.workspaceName || "The Workspace",
    receivingPartyName: input.receivingPartyName || "",
    receivingPartyEmail: input.receivingPartyEmail || "",
    documentTitle: input.documentTitle || "Document",
    effectiveDateFormatted,
  });
  drawBodyBlocks(context, bodyBlocks);
  await drawSignatureSection(context, {
    receivingPartyName: input.receivingPartyName || "",
    receivingPartyEmail: input.receivingPartyEmail || "",
    signedDateTimeFormatted,
    signatureDataUrl: input.signatureDataUrl,
  });

  return await context.pdfDoc.save();
};
