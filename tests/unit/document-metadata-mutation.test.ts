import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  findSiblingTitleConflict,
  isDocumentMetadataMutationBlocked,
  normalizeDocumentTitle,
} from "@/server/documentMetadataMutation";

const routeSource = (operation: "move" | "rename"): string =>
  readFileSync(
    path.join(process.cwd(), "src/app/api/documents", operation, "route.ts"),
    "utf8",
  );

test("document metadata mutations wait for pending and active conversions", () => {
  assert.equal(isDocumentMetadataMutationBlocked("pending"), true);
  assert.equal(isDocumentMetadataMutationBlocked("in_progress"), true);
  assert.equal(isDocumentMetadataMutationBlocked("completed"), false);
  assert.equal(isDocumentMetadataMutationBlocked("failed"), false);
  assert.equal(isDocumentMetadataMutationBlocked("none"), false);
  assert.equal(isDocumentMetadataMutationBlocked(null), false);
});

test("document duplicate comparisons are case-insensitive and trim whitespace", () => {
  assert.equal(normalizeDocumentTitle("  Proposal.DOCX "), "proposal.docx");
  assert.equal(
    normalizeDocumentTitle("\tQuarterly Report.pdf\n"),
    "quarterly report.pdf",
  );
});

type StubQueryCall = [method: string, column: string, value: unknown];

const createStubClient = (
  result:
    | { data: Array<{ id: string; title: string | null }>; error: null }
    | { data: null; error: unknown },
) => {
  const calls: StubQueryCall[] = [];
  let observedLimit: number | null = null;
  type StubQuery = {
    eq: (column: string, value: string) => StubQuery;
    is: (column: string, value: null) => StubQuery;
    neq: (column: string, value: string) => StubQuery;
    ilike: (column: string, pattern: string) => StubQuery;
    limit: (count: number) => Promise<typeof result>;
  };
  const query: StubQuery = {
    eq(column, value) {
      calls.push(["eq", column, value]);
      return query;
    },
    is(column, value) {
      calls.push(["is", column, value]);
      return query;
    },
    neq(column, value) {
      calls.push(["neq", column, value]);
      return query;
    },
    ilike(column, pattern) {
      calls.push(["ilike", column, pattern]);
      return query;
    },
    limit(count) {
      observedLimit = count;
      return Promise.resolve(result);
    },
  };
  return {
    client: { from: () => ({ select: () => query }) },
    calls,
    getLimit: () => observedLimit,
  };
};

test("sibling title conflicts are detected via a bounded, normalized DB filter", async () => {
  const stub = createStubClient({
    data: [{ id: "other", title: "  Report.PDF " }],
    error: null,
  });

  const conflict = await findSiblingTitleConflict({
    client: stub.client as never,
    workspaceId: "workspace-1",
    dataRoomId: null,
    folderId: "folder-1",
    excludeDocumentId: "self",
    title: "report.pdf",
  });

  assert.deepEqual(conflict, { ok: true, hasConflict: true });
  // The database narrows candidates (no unbounded sibling scan that PostgREST
  // would silently truncate); the normalized comparison decides.
  assert.deepEqual(stub.calls, [
    ["eq", "workspace_id", "workspace-1"],
    ["neq", "id", "self"],
    ["ilike", "title", "report.pdf"],
    ["is", "data_room_id", null],
    ["eq", "folder_id", "folder-1"],
  ]);
  assert.equal(typeof stub.getLimit(), "number");
});

test("wildcard over-matches from ILIKE are rejected by the normalized comparison", async () => {
  const stub = createStubClient({
    data: [{ id: "other", title: "reportXpdf" }],
    error: null,
  });

  const conflict = await findSiblingTitleConflict({
    client: stub.client as never,
    workspaceId: "workspace-1",
    dataRoomId: "room-1",
    folderId: null,
    excludeDocumentId: "self",
    title: "report_pdf",
  });

  assert.deepEqual(conflict, { ok: true, hasConflict: false });
});

test("sibling title lookup failures are reported, not swallowed", async () => {
  const stub = createStubClient({ data: null, error: new Error("boom") });

  const conflict = await findSiblingTitleConflict({
    client: stub.client as never,
    workspaceId: "workspace-1",
    dataRoomId: null,
    folderId: null,
    excludeDocumentId: "self",
    title: "report.pdf",
  });

  assert.equal(conflict.ok, false);
});

test("document move and rename retain immutable object paths", () => {
  const move = routeSource("move");
  const rename = routeSource("rename");

  for (const source of [move, rename]) {
    assert.match(source, /isDocumentMetadataMutationBlocked/);
    assert.match(source, /\.eq\("workspace_id", row\.workspace_id\)/);
    assert.match(source, /\.eq\("storage_path", row\.storage_path\)/);
    assert.match(source, /\.eq\("conversion_status", row\.conversion_status\)/);

    assert.doesNotMatch(source, /\bcopyObject\b/);
    assert.doesNotMatch(source, /\bdeleteObject\b/);
    assert.doesNotMatch(source, /\bheadObject\b/);
    assert.doesNotMatch(source, /\bbuildStoragePath\b/);
    assert.doesNotMatch(source, /\btoPdfPath\b/);
  }

  assert.match(
    move,
    /\.update\(\{ folder_id: destinationFolderId \?\? null \}\)/,
  );
  assert.match(rename, /\.update\(\{ title: newFileName \}\)/);
});

test("unused physical copy adapter is removed with metadata-only mutations", () => {
  const r2 = readFileSync(
    path.join(process.cwd(), "src/server/storage/r2.ts"),
    "utf8",
  );
  const barrel = readFileSync(
    path.join(process.cwd(), "src/server/storage/index.ts"),
    "utf8",
  );

  assert.doesNotMatch(r2, /\bCopyObjectCommand\b/);
  assert.doesNotMatch(r2, /export const copyObject/);
  assert.doesNotMatch(barrel, /\bcopyObject\b/);
});
