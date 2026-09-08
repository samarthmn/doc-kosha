import assert from "node:assert/strict";
import test from "node:test";

import { resolvePublicDirectAssetSelection } from "@/server/publicDirectAssetSelection";

const baseDocument = {
  id: "document-1",
  storage_path: "workspaces/workspace-1/documents/source.docx",
  converted_storage_path:
    "workspaces/workspace-1/conversion-attempts/document-1/old.pdf",
  conversion_status: "completed",
  workspace_id: "workspace-1",
  data_room_id: null,
  file_type: "docx",
  size_bytes: 1024,
};

test("serves a converted object only after storage confirms it exists", async () => {
  const checkedPaths: string[] = [];
  let repairs = 0;

  const result = await resolvePublicDirectAssetSelection({
    document: baseDocument,
    requestedVariant: "converted",
    checkConverted: async (_bucket, path) => {
      checkedPaths.push(path);
      return "available";
    },
    repairMissingConverted: async () => {
      repairs += 1;
      return null;
    },
  });

  assert.equal(result?.variant, "converted");
  assert.equal(result?.path, baseDocument.converted_storage_path);
  assert.equal(result?.logicalBucket, "converted-documents");
  assert.deepEqual(checkedPaths, [baseDocument.converted_storage_path]);
  assert.equal(repairs, 0);
});

test("repairs a missing converted object and validates the replacement", async () => {
  const repairedDocument = {
    ...baseDocument,
    converted_storage_path:
      "workspaces/workspace-1/conversion-attempts/document-1/repaired.pdf",
  };
  const checkedPaths: string[] = [];
  let repairs = 0;

  const result = await resolvePublicDirectAssetSelection({
    document: baseDocument,
    requestedVariant: "converted",
    checkConverted: async (_bucket, path) => {
      checkedPaths.push(path);
      return path === repairedDocument.converted_storage_path
        ? "available"
        : "missing";
    },
    repairMissingConverted: async () => {
      repairs += 1;
      return repairedDocument;
    },
  });

  assert.equal(result?.variant, "converted");
  assert.equal(result?.path, repairedDocument.converted_storage_path);
  assert.deepEqual(checkedPaths, [
    baseDocument.converted_storage_path,
    repairedDocument.converted_storage_path,
  ]);
  assert.equal(repairs, 1);
});

test("falls back to the latest original when converted repair is not usable", async () => {
  const currentDocument = {
    ...baseDocument,
    storage_path: "workspaces/workspace-1/documents/replacement.docx",
    converted_storage_path: null,
    conversion_status: "in_progress",
    size_bytes: 2048,
  };

  const result = await resolvePublicDirectAssetSelection({
    document: baseDocument,
    requestedVariant: "converted",
    checkConverted: async () => "missing",
    repairMissingConverted: async () => currentDocument,
  });

  assert.equal(result?.variant, "original");
  assert.equal(result?.path, currentDocument.storage_path);
  assert.equal(result?.logicalBucket, "documents");
  assert.equal(result?.document.size_bytes, 2048);
});

test("does not repair on a non-missing storage failure", async () => {
  let repairs = 0;

  const result = await resolvePublicDirectAssetSelection({
    document: baseDocument,
    requestedVariant: "converted",
    checkConverted: async () => "unavailable",
    repairMissingConverted: async () => {
      repairs += 1;
      return null;
    },
  });

  assert.equal(result?.variant, "original");
  assert.equal(result?.path, baseDocument.storage_path);
  assert.equal(repairs, 0);
});

test("preserves original delivery when converted assets are disallowed", async () => {
  let checks = 0;

  const result = await resolvePublicDirectAssetSelection({
    document: baseDocument,
    requestedVariant: "converted",
    allowConverted: false,
    checkConverted: async () => {
      checks += 1;
      return "available";
    },
    repairMissingConverted: async () => null,
  });

  assert.equal(result?.variant, "original");
  assert.equal(result?.path, baseDocument.storage_path);
  assert.equal(checks, 0);
});

test("returns no direct asset when neither repaired nor original bytes exist", async () => {
  const result = await resolvePublicDirectAssetSelection({
    document: { ...baseDocument, storage_path: null },
    requestedVariant: "converted",
    checkConverted: async () => "missing",
    repairMissingConverted: async () => null,
  });

  assert.equal(result, null);
});
