import type { WatermarkDefinition } from "@/lib/branding";
import type { Tables } from "@/types/generated/supabase";

export type WatermarkPattern = "single" | "grid" | "diagonal_grid";
export type WatermarkContentMode = "text" | "image" | "hybrid";

export interface WatermarkTemplateDefinition {
  text?: string | null;
  color?: string | null;
  fontSize?: number | null; // rem units to align with existing UI
  opacity?: number | null;
  pattern?: WatermarkPattern | null;
  rotationDeg?: number | null;
  xSpacing?: number | null;
  ySpacing?: number | null;
  type?: WatermarkContentMode | null;
  imageWidthPt?: number | null;
  imageHeightPt?: number | null;
  imageDataUrl?: string | null;
}

export type WatermarkTemplateRow = Tables<"watermarks">;

interface MaterializedWatermark {
  id: string | null;
  name?: string | null;
  definition: WatermarkDefinition;
  pattern: WatermarkPattern;
  rotationDeg: number;
  xSpacing: number;
  ySpacing: number;
  mode: WatermarkContentMode;
  imageStoragePath?: string | null;
  imageWidthPt?: number | null;
  imageHeightPt?: number | null;
}

const clamp = (value: number, min: number, max: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export const materializeWatermark = (
  template: Pick<
    WatermarkTemplateRow,
    "id" | "name" | "definition" | "image_storage_path"
  >,
): MaterializedWatermark | null => {
  if (!template?.definition) return null;
  const definition =
    (template.definition as WatermarkTemplateDefinition | null) ?? null;
  const text = definition?.text?.trim() ?? "";
  const mode = definition?.type ?? "text";

  // Validate required content based on mode:
  // - "text" and "hybrid" modes require text
  // - "image" mode can work without text (image-only watermarks)
  const requiresText = mode === "text" || mode === "hybrid";
  if (requiresText && !text) return null;

  // Image and hybrid modes must never degrade to a text-only watermark.
  const hasImage = Boolean(template.image_storage_path);
  if ((mode === "image" || mode === "hybrid") && !hasImage) return null;

  const pattern = definition?.pattern ?? "grid";
  const fontSize = clamp(definition?.fontSize ?? 1.6, 0.6, 6, 1.6);
  const opacity = clamp(definition?.opacity ?? 0.65, 0.1, 1, 0.65);
  const colorBase =
    typeof definition?.color === "string" ? definition.color : "#4B5563";
  const color = colorBase.trim() || "#4B5563";
  const rotationDeg = Number.isFinite(definition?.rotationDeg)
    ? (definition?.rotationDeg as number)
    : pattern === "diagonal_grid"
      ? -40
      : 0;
  const xSpacing = clamp(definition?.xSpacing ?? 320, 72, 1440, 320);
  const ySpacing = clamp(definition?.ySpacing ?? 320, 72, 1440, 320);

  const normalized: MaterializedWatermark = {
    id: template.id ?? null,
    name: template.name,
    pattern,
    rotationDeg,
    xSpacing,
    ySpacing,
    mode,
    definition: {
      text: text || "", // Allow empty text for image-only mode
      color,
      fontSize,
      opacity,
    },
    imageStoragePath: template.image_storage_path ?? null,
    imageWidthPt: definition?.imageWidthPt ?? null,
    imageHeightPt: definition?.imageHeightPt ?? null,
  };

  return normalized;
};
