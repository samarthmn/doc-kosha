import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const DISCLOSURE_PATHS = [
  "src/components/analytics/InternalAuditLogSection.tsx",
  "src/components/analytics/MergedDocumentAnalyticsPanel.tsx",
] as const;

test("analytics disclosures keep their focus indicator inside clipped cards", async () => {
  for (const path of DISCLOSURE_PATHS) {
    const source = await readFile(
      new URL(`../../${path}`, import.meta.url),
      "utf8",
    );
    const clippedDetails = source.match(
      /<details[\s\S]*?overflow-hidden[\s\S]*?<summary className="([^"]+)"/,
    );

    assert.ok(clippedDetails, `${path} must keep its disclosure card contract`);
    assert.match(
      clippedDetails[1],
      /\bfocus-visible:outline-offset-\[-2px\](?:\s|$)/,
      `${path} must inset the summary outline so overflow-hidden cannot clip it`,
    );
    assert.doesNotMatch(
      clippedDetails[1],
      /\bfocus-visible:outline-offset-2\b/,
      `${path} must not place the only focus indicator outside the clipped card`,
    );
  }
});
