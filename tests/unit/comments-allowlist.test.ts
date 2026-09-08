import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isLinkAllowlistAccessDenied } from "@/server/linkAllowlist";

const commentsServiceSource = readFileSync(
  new URL("../../src/modules/comments/server/service.ts", import.meta.url),
  "utf8",
);

test("comment access denies blocklisted and non-allowlisted viewers", () => {
  assert.equal(
    isLinkAllowlistAccessDenied({
      isActive: true,
      emailBlocked: true,
      emailAllowed: true,
    }),
    true,
  );
  assert.equal(
    isLinkAllowlistAccessDenied({
      isActive: true,
      emailBlocked: false,
      emailAllowed: false,
    }),
    true,
  );
  assert.match(
    commentsServiceSource,
    /isLinkAllowlistAccessDenied\(allowlistStatus\)[\s\S]*EMAIL_NOT_ALLOWED/,
  );
});
