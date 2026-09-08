import type { PageArea } from "@/components/documents/pdf/geometry/pageAreas";

export const mergeHighlightAreas = (areas: PageArea[]): PageArea[] => {
  const sorted = [...areas].sort((a, b) => {
    if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
    if (a.top !== b.top) return a.top - b.top;
    return a.left - b.left;
  });

  const merged: PageArea[] = [];

  for (const area of sorted) {
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push(area);
      continue;
    }

    if (area.pageIndex !== prev.pageIndex) {
      merged.push(area);
      continue;
    }

    const topDelta = Math.abs(area.top - prev.top);
    const heightDelta = Math.abs(area.height - prev.height);
    const lineThreshold = Math.max(
      0.35,
      Math.min(area.height, prev.height) * 0.6,
    );
    const heightThreshold = Math.max(
      0.35,
      Math.min(area.height, prev.height) * 0.8,
    );

    const prevRight = prev.left + prev.width;
    const gap = area.left - prevRight;
    const gapThreshold = Math.max(
      0.5,
      Math.min(area.height, prev.height) * 0.9,
    );

    const sameLine =
      topDelta <= lineThreshold && heightDelta <= heightThreshold;
    const adjacent = gap <= gapThreshold;

    if (sameLine && adjacent) {
      const left = Math.min(prev.left, area.left);
      const top = Math.min(prev.top, area.top);
      const right = Math.max(prevRight, area.left + area.width);
      const bottom = Math.max(prev.top + prev.height, area.top + area.height);

      merged[merged.length - 1] = {
        pageIndex: prev.pageIndex,
        left,
        top,
        width: right - left,
        height: bottom - top,
      };
      continue;
    }

    merged.push(area);
  }

  return merged;
};
