export function isCurrentPdfPageEvent<T extends object>(
  viewer: { getPageView: (index: number) => T | undefined } | null,
  event: { pageNumber: number; source: unknown; error?: unknown },
): event is { pageNumber: number; source: T; error?: unknown } {
  // Detail views share their parent's div but do not own page geometry or text.
  // Identity also excludes delayed events from a previous document.
  return (
    viewer !== null &&
    Number.isInteger(event.pageNumber) &&
    event.pageNumber > 0 &&
    event.source != null &&
    viewer.getPageView(event.pageNumber - 1) === event.source
  );
}
