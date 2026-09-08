import assert from "node:assert/strict";
import test from "node:test";

import { REVIEW_SITES } from "@/modules/reviews/config";

test("review modal exposes only the four requested review destinations", () => {
  assert.deepEqual(
    REVIEW_SITES.map((site) => ({
      id: site.id,
      label: site.label,
      href: site.href,
    })),
    [
      {
        id: "capterra",
        label: "Capterra",
        href: "https://reviews.capterra.com/products/new/92a761b7-e488-42d3-bb55-974d78d04ec7/",
      },
      {
        id: "g2",
        label: "G2",
        href: "https://www.g2.com/products/dockosha-secure-document-sharing-virtual-data-rooms/reviews",
      },
      {
        id: "sourceforge",
        label: "SourceForge",
        href: "https://sourceforge.net/software/product/DocKosha/reviews/new",
      },
      {
        id: "trustpilot",
        label: "Trustpilot",
        href: "https://www.trustpilot.com/evaluate/dockosha.com",
      },
    ],
  );
});
