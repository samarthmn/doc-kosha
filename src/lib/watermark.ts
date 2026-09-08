import {
  buildWatermarkLines,
  type WatermarkDefinition,
  type WatermarkDynamicValues,
  type WatermarkMode,
  type WatermarkPattern,
} from "@/lib/branding";

type WatermarkOverlayLineKind = "primary" | "meta";

export interface WatermarkOverlayLine {
  text: string;
  kind: WatermarkOverlayLineKind;
}

export interface WatermarkOverlayModel {
  lines: WatermarkOverlayLine[];
  style: {
    color: string;
    fontSizeRem: number;
    opacity: number;
  };
  layout: {
    pattern: WatermarkPattern;
    rotationDeg: number;
    xSpacingPt: number;
    ySpacingPt: number;
    mode: WatermarkMode;
    imageUrl?: string | null;
    imagePath?: string | null;
    imageWidthPt?: number;
    imageHeightPt?: number;
  };
}

const clamp = (value: number, min: number, max: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export const createWatermarkOverlayModel = (
  definition: WatermarkDefinition,
  dynamicValues?: WatermarkDynamicValues,
  options?: { imageUrl?: string | null },
): WatermarkOverlayModel => {
  const lines = buildWatermarkLines(definition, dynamicValues);
  const overlayLines: WatermarkOverlayLine[] = lines.map((text, index) => ({
    text,
    kind: index === 0 ? "primary" : "meta",
  }));

  const pattern = definition.pattern ?? "grid";
  const rotationDeg =
    typeof definition.rotationDeg === "number"
      ? definition.rotationDeg
      : pattern === "diagonal_grid"
        ? -40
        : 0;
  const xSpacingPt = clamp(definition.xSpacing ?? 320, 72, 1440, 320);
  const ySpacingPt = clamp(definition.ySpacing ?? 320, 72, 1440, 320);
  const mode: WatermarkMode = definition.mode ?? "text";
  const imagePath = definition.imagePath ?? null;
  const imageWidthPt =
    mode === "image" || mode === "hybrid"
      ? clamp(definition.imageWidthPt ?? 180, 24, 1440, 180)
      : undefined;
  const imageHeightPt =
    mode === "image" || mode === "hybrid"
      ? clamp(definition.imageHeightPt ?? 180, 24, 1440, 180)
      : undefined;
  const imageUrl =
    typeof options?.imageUrl === "string" && options.imageUrl.trim().length > 0
      ? options.imageUrl.trim()
      : null;

  return {
    lines: overlayLines,
    style: {
      color: definition.color,
      fontSizeRem: definition.fontSize,
      opacity: definition.opacity,
    },
    layout: {
      pattern,
      rotationDeg,
      xSpacingPt,
      ySpacingPt,
      mode,
      imageUrl,
      imagePath,
      imageWidthPt,
      imageHeightPt,
    },
  };
};
