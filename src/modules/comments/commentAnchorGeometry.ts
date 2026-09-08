import type { PageArea } from "@/components/documents/pdf/geometry/pageAreas";
import { mergeHighlightAreas } from "@/components/documents/pdf/geometry/mergeAreas";

const COMMENT_ANCHOR_RECTS_MAX_STORED = 128;
const COMMENT_ANCHOR_QUOTE_MAX_CHARS = 1_000;

type StoredCommentAnchor = {
  rects: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
  }>;
  quote?: string;
};

export const storedCommentAnchorToPageAreas = ({
  anchor,
  pageNumber,
}: {
  anchor: StoredCommentAnchor;
  pageNumber: number;
}): PageArea[] =>
  anchor.rects.map((rect) => ({
    pageIndex: Math.max(0, pageNumber - 1),
    left: rect.x * 100,
    top: rect.y * 100,
    width: rect.w * 100,
    height: rect.h * 100,
  }));

export const pageAreasToStoredCommentAnchor = (
  areas: PageArea[],
  selectedText: string,
): StoredCommentAnchor => {
  const rects = mergeHighlightAreas(areas)
    .map((area) => ({
      x: Number((area.left / 100).toFixed(6)),
      y: Number((area.top / 100).toFixed(6)),
      w: Number((area.width / 100).toFixed(6)),
      h: Number((area.height / 100).toFixed(6)),
    }))
    .filter((rect) => rect.w > 0 && rect.h > 0)
    .slice(0, COMMENT_ANCHOR_RECTS_MAX_STORED);
  const quote = selectedText.trim().slice(0, COMMENT_ANCHOR_QUOTE_MAX_CHARS);

  return {
    rects,
    ...(quote ? { quote } : {}),
  };
};

export const groupCommentSelectionByPage = (
  areas: PageArea[],
): { pageIndex: number; areas: PageArea[] } | null => {
  const sanitized = areas.filter(
    (area) =>
      Number.isFinite(area.left) &&
      Number.isFinite(area.top) &&
      Number.isFinite(area.width) &&
      Number.isFinite(area.height) &&
      area.width > 0 &&
      area.height > 0,
  );
  if (sanitized.length === 0) return null;

  const pageIndex = sanitized[0].pageIndex;
  if (!sanitized.every((area) => area.pageIndex === pageIndex)) return null;
  return { pageIndex, areas: sanitized };
};
