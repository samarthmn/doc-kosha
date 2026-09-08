import type { WatermarkDefinition } from "@/lib/branding";
import {
  isCompletedConversionEligibleExtension,
  isPdfExtension,
} from "@/lib/fileTypes";

type ByteSource = ArrayBuffer | Uint8Array;

const extensionFromStoragePath = (
  storagePath: string | null | undefined,
): string => {
  const withoutQuery = (storagePath ?? "").split(/[?#]/, 1)[0] ?? "";
  const fileName = withoutQuery.split("/").pop() ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1) : "";
};

export const isWatermarkEligibleDocument = (params: {
  fileType: string | null | undefined;
  storagePath: string | null | undefined;
}): boolean => {
  const declaredExtension = (params.fileType ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\./, "");
  const pathExtension = extensionFromStoragePath(params.storagePath);
  return [declaredExtension, pathExtension].some(
    (extension) =>
      isPdfExtension(extension) ||
      isCompletedConversionEligibleExtension(extension),
  );
};

export const requiredWatermarkImageError = (
  definition: WatermarkDefinition | null | undefined,
  imageBytes: ByteSource | null | undefined,
): string | null => {
  if (!definition) return null;
  const needsImage =
    definition.mode === "image" || definition.mode === "hybrid";
  if (!needsImage) return null;
  if (imageBytes && imageBytes.byteLength > 0) return null;
  return `Watermark mode "${definition.mode}" requires its image asset`;
};
