import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createVersionRetentionPlan } from "@/modules/document-versioning/server/retention";
import type { DocumentVersionRow } from "@/modules/document-versioning/server/repository";

const serviceSource = readFileSync(
  new URL(
    "../../src/modules/document-versioning/server/service.ts",
    import.meta.url,
  ),
  "utf8",
);

const version = (
  overrides: Partial<DocumentVersionRow>,
): DocumentVersionRow => ({
  id: "00000000-0000-4000-8000-000000000010",
  workspace_id: "00000000-0000-4000-8000-000000000001",
  document_id: "00000000-0000-4000-8000-000000000020",
  source_scope_data_room_id: null,
  source_folder_id: null,
  title: "old.pdf",
  file_type: "pdf",
  storage_path: "workspaces/ws/folders/root/old.pdf",
  converted_storage_path: null,
  conversion_status: "completed",
  size_bytes: 100,
  created_by: null,
  original_created_at: null,
  state: "available",
  is_free_included: true,
  counts_towards_storage: false,
  pruned_at: null,
  pruned_reason: null,
  replaced_at: "2026-08-01T00:00:00.000Z",
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

test("zero-retention replacement prunes every available row before blob cleanup", () => {
  const versions = [
    version({
      storage_path: "workspaces/ws/folders/root/shared.pdf",
    }),
    version({
      id: "00000000-0000-4000-8000-000000000011",
      storage_path: "workspaces/ws/folders/root/older.pdf",
      replaced_at: "2026-07-31T00:00:00.000Z",
    }),
  ];

  const plan = createVersionRetentionPlan({
    versions,
    maxPreviousVersions: 0,
    pruneReason: "limit_auto",
    currentDocument: {
      data_room_id: null,
      storage_path: "workspaces/ws/folders/root/new.pdf",
      converted_storage_path: null,
    },
  });

  assert.deepEqual(
    plan.toUpdate.map((row) => row.state),
    ["pruned", "pruned"],
  );
  assert.deepEqual(
    plan.pruned.map((row) => row.id),
    versions.map((row) => row.id),
  );
  assert.equal(
    plan.protectedStorageObjectKeys.has(
      "documents:workspaces/ws/folders/root/shared.pdf",
    ),
    false,
  );
});

test("restoring a version explicitly clears the stale page count", () => {
  const restoreStart = serviceSource.indexOf(
    "export const restoreVersionToCurrent",
  );
  assert.notEqual(restoreStart, -1);
  const restoreSource = serviceSource.slice(restoreStart);

  assert.match(
    restoreSource,
    /updateDocumentCurrentFromUpload\([\s\S]*numPages: null/,
  );
});
