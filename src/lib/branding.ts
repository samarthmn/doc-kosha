import type { Tables } from "@/types/generated/supabase";

export const buildBrandingInitials = (
  name: string | null | undefined,
): string => {
  if (!name) return "--";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment.charAt(0)?.toUpperCase() ?? "")
    .join("")
    .padEnd(2, "·")
    .slice(0, 2);
};

export type BrandingRecord = Tables<"branding">;

const DEFAULT_WATERMARK_COLOR = "#4B5563";
const DEFAULT_WATERMARK_FONT_SIZE = 1.2; // rem
const DEFAULT_WATERMARK_OPACITY = 0.65;
const WATERMARK_FONT_SIZE_MIN = 1.0;
const WATERMARK_FONT_SIZE_MAX = 4;
const WATERMARK_OPACITY_MIN = 0.2;
const WATERMARK_OPACITY_MAX = 1;
const DEFAULT_WATERMARK_FALLBACK_TEXT = "CONFIDENTIAL";

const HEX_COLOR_PATTERN = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const normalizeColorHex = (value: string | null | undefined): string => {
  if (!value) return DEFAULT_WATERMARK_COLOR;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_WATERMARK_COLOR;
  const match = trimmed.match(HEX_COLOR_PATTERN);
  if (!match) return DEFAULT_WATERMARK_COLOR;
  const [, hexBody] = match;
  const expanded =
    hexBody.length === 3
      ? hexBody
          .split("")
          .map((segment) => segment + segment)
          .join("")
      : hexBody;
  return `#${expanded}`.toUpperCase();
};

const clampNumber = (
  value: number | null | undefined,
  options: { min: number; max: number; fallback: number },
): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return options.fallback;
  }
  if (value < options.min) return options.min;
  if (value > options.max) return options.max;
  return value;
};

export type WatermarkPattern = "single" | "grid" | "diagonal_grid";
export type WatermarkMode = "text" | "image" | "hybrid";

export interface WatermarkDefinition {
  text: string;
  color: string;
  fontSize: number;
  opacity: number;
  pattern?: WatermarkPattern;
  rotationDeg?: number;
  xSpacing?: number;
  ySpacing?: number;
  mode?: WatermarkMode;
  imageWidthPt?: number | null;
  imageHeightPt?: number | null;
  imagePath?: string | null;
}

export type WatermarkDynamicValues = Record<
  string,
  string | number | Date | null | undefined
>;

const buildDefaultWatermarkDefinition = (): WatermarkDefinition => ({
  text: DEFAULT_WATERMARK_FALLBACK_TEXT,
  color: DEFAULT_WATERMARK_COLOR,
  fontSize: DEFAULT_WATERMARK_FONT_SIZE,
  opacity: DEFAULT_WATERMARK_OPACITY,
});

const composeWatermarkLines = (
  watermarkText: string | null | undefined,
  dynamicUserData?: WatermarkDynamicValues,
): string[] => {
  const baseText = watermarkText?.trim() ?? "";
  const dynamicSegments = dynamicUserData
    ? Object.entries(dynamicUserData)
        .map(([_, raw]) => {
          if (raw == null) return null;
          if (raw instanceof Date) {
            return raw.toISOString();
          }
          const text = `${raw}`.trim();
          return text.length > 0 ? text : null;
        })
        .filter((segment): segment is string => Boolean(segment))
    : [];

  const composedSegments = [baseText, ...dynamicSegments].filter((segment) => {
    if (!segment) return false;
    return segment.trim().length > 0;
  });

  return composedSegments.length
    ? composedSegments
    : [DEFAULT_WATERMARK_FALLBACK_TEXT];
};

export const resolveWatermarkDefinition = (
  branding: BrandingRecord | null | undefined,
): WatermarkDefinition | null => {
  if (!branding) return null;

  const trimmedText = branding.watermark_title?.trim();
  if (!trimmedText) return null;

  return {
    text: trimmedText,
    color: normalizeColorHex(branding.watermark_color),
    fontSize: clampNumber(branding.watermark_font_size, {
      min: WATERMARK_FONT_SIZE_MIN,
      max: WATERMARK_FONT_SIZE_MAX,
      fallback: DEFAULT_WATERMARK_FONT_SIZE,
    }),
    opacity: clampNumber(branding.watermark_opacity, {
      min: WATERMARK_OPACITY_MIN,
      max: WATERMARK_OPACITY_MAX,
      fallback: DEFAULT_WATERMARK_OPACITY,
    }),
  };
};

/**
 * Resolve the watermark for a link that has already required protection.
 * `links.apply_watermark` historically defaults to true, so older workspaces
 * may have no branding row or selected template. Keep those links usable with
 * a deterministic safe mark instead of exposing raw bytes. UI availability
 * checks continue to use `resolveWatermarkDefinition` and remain unchanged.
 */
export const resolveRequiredWatermarkDefinition = (
  branding: BrandingRecord | null | undefined,
): WatermarkDefinition =>
  resolveWatermarkDefinition(branding) ?? buildDefaultWatermarkDefinition();

export const buildWatermarkLines = (
  definition: WatermarkDefinition,
  dynamicValues?: WatermarkDynamicValues,
): string[] => composeWatermarkLines(definition.text, dynamicValues);

export const isSafeLogoSource = (url: string | null | undefined): boolean => {
  if (!url) return false;
  if (url.startsWith("data:image/")) return true;
  if (url.startsWith("blob:")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};
