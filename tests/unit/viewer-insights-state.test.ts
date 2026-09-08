import assert from "node:assert/strict";
import test from "node:test";

import { resolveViewerInsightsRpcState } from "@/components/analytics/viewerInsightsState";

test("viewer RPC failures are isolated from overview analytics", () => {
  assert.equal(
    resolveViewerInsightsRpcState({
      enabled: true,
      viewerRowsError: { code: "RPC_FAILED" },
      viewerPagesError: null,
    }),
    "error",
  );
  assert.equal(
    resolveViewerInsightsRpcState({
      enabled: true,
      viewerRowsError: null,
      viewerPagesError: { code: "RPC_FAILED" },
    }),
    "error",
  );
  assert.equal(
    resolveViewerInsightsRpcState({
      enabled: true,
      viewerRowsError: null,
      viewerPagesError: null,
    }),
    "ready",
  );
  assert.equal(
    resolveViewerInsightsRpcState({
      enabled: false,
      viewerRowsError: { code: "ignored" },
      viewerPagesError: { code: "ignored" },
    }),
    "disabled",
  );
});
