/**
 * Builds the watermark payload consumed by the pdf-core WASM engine (server
 * and browser builds). Pure module (no env/server imports) so the browser
 * preview and the server download path share ONE payload definition and can
 * never drift apart.
 */
import type {
  WatermarkDefinition,
  WatermarkDynamicValues,
} from "@/lib/branding";
import { z } from "zod";

export const WatermarkPayloadSchema = z
  .object({
    pattern: z.enum(["single", "grid", "diagonal_grid"]),
    rotationDeg: z.number().finite().min(-360).max(360),
    xSpacingPt: z.number().finite().min(72).max(1440),
    ySpacingPt: z.number().finite().min(72).max(1440),
    contentType: z.enum(["text", "image", "hybrid"]),
    lines: z.array(z.string().min(1).max(2_048)).min(1).max(16),
    color: z.string().regex(/^#[0-9a-f]{6}$/iu),
    fontSizePt: z.number().finite().min(8).max(64),
    opacity: z.number().finite().min(0).max(1),
    image: z
      .object({
        widthPt: z.number().finite().positive().max(1_440).optional(),
        heightPt: z.number().finite().positive().max(1_440).optional(),
      })
      .optional(),
  })
  .strict();

type WatermarkPayload = z.infer<typeof WatermarkPayloadSchema>;

export const buildWatermarkPayload = (
  definition: WatermarkDefinition,
  dynamicValues?: WatermarkDynamicValues,
): WatermarkPayload => {
  const baseText = definition.text?.trim() ?? "";
  const lines: string[] = baseText ? [baseText] : [];

  const toDynamicLine = (raw: unknown): string | null => {
    if (raw == null) return null;
    if (raw instanceof Date) return raw.toISOString();
    const text = `${raw}`.trim();
    return text.length > 0 ? text : null;
  };

  const pushDynamic = (key: string) => {
    const raw =
      dynamicValues && typeof dynamicValues === "object"
        ? (dynamicValues as Record<string, unknown>)[key]
        : undefined;
    const line = toDynamicLine(raw);
    if (line) lines.push(line);
  };

  // Keep ordering stable for readability.
  pushDynamic("email");
  pushDynamic("ip");
  pushDynamic("datetime");

  // Convert rem → points (1rem ~ 16px, 72pt = 96px)
  const fontSizePt = Math.max(8, Math.min(64, definition.fontSize * 12));
  const pattern = definition.pattern ?? "grid";
  const rotationDeg =
    typeof definition.rotationDeg === "number"
      ? definition.rotationDeg
      : pattern === "diagonal_grid"
        ? -40
        : 0;
  const xSpacingPt = Math.max(72, Math.min(1440, definition.xSpacing ?? 320));
  const ySpacingPt = Math.max(72, Math.min(1440, definition.ySpacing ?? 320));
  const mode = definition.mode ?? "text";

  return {
    pattern,
    rotationDeg,
    xSpacingPt,
    ySpacingPt,
    contentType: mode,
    lines: lines.length > 0 ? lines : ["CONFIDENTIAL"],
    color: definition.color,
    fontSizePt,
    opacity: definition.opacity,
    image:
      mode === "image" || mode === "hybrid"
        ? {
            widthPt: definition.imageWidthPt ?? undefined,
            heightPt: definition.imageHeightPt ?? undefined,
          }
        : undefined,
  };
};

/**
 * The browser build has no runtime-registered fonts, so preview text remains
 * limited to PDF standard-14 WinAnsi/CP1252. Server processing delegates
 * coverage decisions to the registered-font engine; browser preview uses its
 * CSS overlay for text outside this repertoire.
 */
const WINANSI_EXTRAS = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

// CP1252 leaves these five byte positions undefined. As Unicode C1 controls
// (U+0081/008D/008F/0090/009D) they have NO glyph in the standard-14 fonts and
// render as the engine's fallback box \u2014 so they must route to a Unicode-capable
// path just like any other non-WinAnsi text, not slip through the cp <= 0xFF
// allowance below (W-4).
const CP1252_UNDEFINED = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);

const isWinAnsiText = (text: string): boolean => {
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0xfeff) continue; // BOM is invisible; don't reject on it
    if (CP1252_UNDEFINED.has(cp)) return false;
    if (cp > 0xff && !WINANSI_EXTRAS.has(ch)) return false;
  }
  return true;
};

/** True when every line of a watermark payload is WinAnsi-renderable. */
export const watermarkPayloadLinesAreWinAnsi = (
  payload: WatermarkPayload,
): boolean => payload.lines.every((line) => isWinAnsiText(line));
