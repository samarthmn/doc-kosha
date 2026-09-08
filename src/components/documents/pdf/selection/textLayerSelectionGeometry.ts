import {
  clampPercent,
  transformArea,
  type PageArea,
} from "@/components/documents/pdf/geometry/pageAreas";
import { mergeHighlightAreas } from "@/components/documents/pdf/geometry/mergeAreas";

export type TextLayerSelection = {
  areas: PageArea[];
  selectedText: string;
  selectionRegion: PageArea;
};

export const buildTextLayerSelection = ({
  screenAreas,
  selectedText,
  pageRotations,
}: {
  screenAreas: PageArea[];
  selectedText: string;
  pageRotations: ReadonlyMap<number, number>;
}): TextLayerSelection | null => {
  if (!selectedText.trim() || screenAreas.length === 0) return null;

  const areas = mergeHighlightAreas(
    screenAreas.map((screenArea) => {
      const area = transformArea(
        screenArea,
        pageRotations.get(screenArea.pageIndex) ?? 0,
      );
      return {
        ...area,
        left: clampPercent(area.left),
        top: clampPercent(area.top),
        width: clampPercent(area.width),
        height: clampPercent(area.height),
      };
    }),
  );
  const selectionRegion = areas.at(-1);
  if (!selectionRegion) return null;

  return { areas, selectedText, selectionRegion };
};
