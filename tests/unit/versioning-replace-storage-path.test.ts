import assert from "node:assert/strict";
import test from "node:test";

import { validateVersioningReplaceStoragePaths } from "@/modules/document-versioning/server/replaceStoragePaths";
import { validatePathBelongsToWorkspace } from "@/server/storage/storagePaths";

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";

test("version replacement rejects storage paths outside the workspace prefix", () => {
  assert.deepEqual(
    validateVersioningReplaceStoragePaths({
      workspaceId: WORKSPACE_ID,
      storagePath:
        "workspaces/00000000-0000-4000-8000-000000000002/folders/root/file.pdf",
      convertedStoragePath: null,
    }),
    { ok: false },
  );
});

test("workspace storage validation normalizes a safe owned path", () => {
  assert.deepEqual(
    validatePathBelongsToWorkspace(
      `/workspaces/${WORKSPACE_ID}/folders/root/file.pdf`,
      WORKSPACE_ID,
    ),
    {
      ok: true,
      normalizedPath: `workspaces/${WORKSPACE_ID}/folders/root/file.pdf`,
    },
  );
});
