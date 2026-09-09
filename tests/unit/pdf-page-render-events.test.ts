import assert from "node:assert/strict";
import test from "node:test";
import { isCurrentPdfPageEvent } from "@/components/documents/pdf/engine/pdfPageEvents";

const pageView = { div: {}, viewport: { rotation: 90 }, scale: 1 };
const viewer = {
  getPageView: (index: number) => (index === 0 ? pageView : undefined),
};

test("accepts only the active viewer's canonical page, including intrinsic rotation", () => {
  assert.equal(
    isCurrentPdfPageEvent(viewer, { pageNumber: 1, source: pageView }),
    true,
  );
});

test("detail renders sharing the page div cannot detach text listeners or rebuild overlays", () => {
  const detail = { div: pageView.div };
  assert.equal(
    isCurrentPdfPageEvent(viewer, { pageNumber: 1, source: detail }),
    false,
  );
});

test("rejects stale and foreign page views even when they have viewport geometry", () => {
  assert.equal(
    isCurrentPdfPageEvent(viewer, { pageNumber: 1, source: { ...pageView } }),
    false,
  );
  assert.equal(
    isCurrentPdfPageEvent(null, { pageNumber: 1, source: pageView }),
    false,
  );
  const replacement = { getPageView: () => ({ ...pageView }) };
  assert.equal(
    isCurrentPdfPageEvent(replacement, { pageNumber: 1, source: pageView }),
    false,
  );
});

test("rejects missing sources and invalid page numbers", () => {
  for (const pageNumber of [0, -1, 1.5, NaN, Infinity, 2]) {
    assert.equal(
      isCurrentPdfPageEvent(viewer, { pageNumber, source: undefined }),
      false,
    );
  }
});
