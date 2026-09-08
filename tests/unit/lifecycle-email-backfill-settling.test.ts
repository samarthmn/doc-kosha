import assert from "node:assert/strict";
import test from "node:test";

import { settleLifecycleBackfills } from "@/modules/lifecycle-email/server/backfillSettling";

test("a failed lifecycle backfill does not prevent sibling work or reject the processor", async () => {
  let siblingCompleted = false;
  const reported: unknown[] = [];

  await settleLifecycleBackfills({
    tasks: [
      Promise.reject(new Error("candidate lookup unavailable")),
      Promise.resolve().then(() => {
        siblingCompleted = true;
      }),
    ],
    onRejected: (reason) => {
      reported.push(reason);
    },
  });

  assert.equal(siblingCompleted, true);
  assert.equal(reported.length, 1);
  assert.match(String(reported[0]), /candidate lookup unavailable/);
});
