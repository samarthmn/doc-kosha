import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  executeDocumentStorageDeletion,
  parseDocumentDeletionPlan,
} from "@/modules/documents/server/deletion";
import { parseDeleteDocumentSelectionResponse } from "@/modules/documents/deleteSelectionClient";

const claimToken = "22222222-2222-4222-8222-222222222222";

const clientSource = readFileSync(
  new URL("../../src/components/pages/DocumentsClient.tsx", import.meta.url),
  "utf8",
);

test("DocumentsClient delegates destructive orchestration to one resource API", () => {
  assert.equal(clientSource.match(/\/api\/documents\/delete/g)?.length, 1);
  assert.doesNotMatch(clientSource, /\/api\/storage\/delete/);
  const deletionSection = clientSource.slice(
    clientSource.indexOf("// Delete dialog state && helpers"),
    clientSource.indexOf(
      "return (",
      clientSource.indexOf("// Delete dialog state && helpers"),
    ),
  );
  assert.doesNotMatch(deletionSection, /\.from\("links"\)\.delete/);
  assert.doesNotMatch(deletionSection, /\.from\("documents"\)\.delete/);
  assert.doesNotMatch(deletionSection, /\.from\("folders"\)\.delete/);
  assert.match(deletionSection, /parseDeleteDocumentSelectionResponse/);
});

test("propagates the current route's exact 409 deletion error", () => {
  assert.throws(
    () =>
      parseDeleteDocumentSelectionResponse({
        responseOk: false,
        payload: { error: "Deletion already in progress" },
      }),
    { message: "Deletion already in progress" },
  );
});

test("propagates a discriminated retryable deletion error", () => {
  assert.throws(
    () =>
      parseDeleteDocumentSelectionResponse({
        responseOk: false,
        payload: {
          ok: false,
          error: "Artifact cleanup still in progress",
          retryable: true,
        },
      }),
    { message: "Artifact cleanup still in progress" },
  );
});

test("returns only a validated successful deletion response", () => {
  const payload = {
    ok: true,
    deletedDocumentIds: ["11111111-1111-4111-8111-111111111111"],
    deletedFolderIds: ["22222222-2222-4222-8222-222222222222"],
    objectsDeleted: 3,
  };

  assert.deepEqual(
    parseDeleteDocumentSelectionResponse({ responseOk: true, payload }),
    payload,
  );
});

test("validates and deduplicates authoritative object and prefix entries", () => {
  const plan = parseDocumentDeletionPlan(
    {
      claimToken,
      documentIds: ["11111111-1111-4111-8111-111111111111"],
      folderIds: [],
      objects: [
        {
          logicalBucket: "documents",
          path: "workspaces/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.pdf",
        },
        {
          logicalBucket: "documents",
          path: "workspaces/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.pdf",
        },
        {
          logicalBucket: "documents",
          path: "workspaces/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/ndas/signed.pdf",
        },
      ],
      prefixes: [
        {
          logicalBucket: "converted-documents",
          pathPrefix:
            "workspaces/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/conversion-attempts/11111111-1111-4111-8111-111111111111/",
        },
      ],
    },
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  );
  assert.equal(plan.claimToken, claimToken);
  assert.equal(plan.objects.length, 2);
  assert.equal(plan.prefixes.length, 1);
});

test("rejects paths outside the requested workspace", () => {
  assert.throws(() =>
    parseDocumentDeletionPlan(
      {
        claimToken,
        documentIds: [],
        folderIds: [],
        objects: [{ logicalBucket: "documents", path: "workspaces/other/x" }],
        prefixes: [],
      },
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ),
  );
});

test("rejects ambiguous object paths and prefixes without trailing slashes", () => {
  const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const invalidPaths = [
    `workspaces/${workspaceId}/../other.pdf`,
    `workspaces/${workspaceId}/nested\\other.pdf`,
    `workspaces/${workspaceId}/nested\0other.pdf`,
    `workspaces/${workspaceId}//other.pdf`,
  ];

  for (const path of invalidPaths) {
    assert.throws(() =>
      parseDocumentDeletionPlan(
        {
          claimToken,
          documentIds: [],
          folderIds: [],
          objects: [{ logicalBucket: "documents", path }],
          prefixes: [],
        },
        workspaceId,
      ),
    );
  }

  assert.throws(() =>
    parseDocumentDeletionPlan(
      {
        claimToken,
        documentIds: [],
        folderIds: [],
        objects: [],
        prefixes: [
          {
            logicalBucket: "converted-documents",
            pathPrefix: `workspaces/${workspaceId}/conversion-attempts/doc`,
          },
        ],
      },
      workspaceId,
    ),
  );
});

test("canonicalizes uppercase workspace UUIDs before validating paths", () => {
  const plan = parseDocumentDeletionPlan(
    {
      claimToken,
      documentIds: [],
      folderIds: [],
      objects: [
        {
          logicalBucket: "documents",
          path: "workspaces/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.pdf",
        },
      ],
      prefixes: [],
    },
    "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
  );

  assert.equal(plan.objects.length, 1);
});

test("uses one exact-delete request for exactly 1000 objects", async () => {
  const objects = Array.from({ length: 1000 }, (_, index) => ({
    logicalBucket: "documents" as const,
    path: `workspaces/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${index}.pdf`,
  }));
  const chunkSizes: number[] = [];

  await executeDocumentStorageDeletion(
    { claimToken, documentIds: [], folderIds: [], objects, prefixes: [] },
    {
      deleteExact: async ({ keys }) => {
        chunkSizes.push(keys.length);
        return { ok: true, deletedCount: keys.length };
      },
      deletePrefix: async () => ({ ok: true, deletedCount: 0 }),
    },
  );

  assert.deepEqual(chunkSizes, [1000]);
});

test("chunks exact deletes at 1000 and fails closed on prefix errors", async () => {
  const objects = Array.from({ length: 1001 }, (_, index) => ({
    logicalBucket: "documents" as const,
    path: `workspaces/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${index}.pdf`,
  }));
  const chunkSizes: number[] = [];
  await executeDocumentStorageDeletion(
    { claimToken, documentIds: [], folderIds: [], objects, prefixes: [] },
    {
      deleteExact: async ({ keys }) => {
        chunkSizes.push(keys.length);
        return { ok: true, deletedCount: keys.length };
      },
      deletePrefix: async () => ({ ok: true, deletedCount: 0 }),
    },
  );
  assert.deepEqual(chunkSizes, [1000, 1]);

  await assert.rejects(() =>
    executeDocumentStorageDeletion(
      {
        claimToken,
        documentIds: [],
        folderIds: [],
        objects: [],
        prefixes: [
          {
            logicalBucket: "converted-documents",
            pathPrefix:
              "workspaces/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/conversion-attempts/doc/",
          },
        ],
      },
      {
        deleteExact: async () => ({ ok: true, deletedCount: 0 }),
        deletePrefix: async () => ({
          ok: false,
          status: 500,
          message: "prefix failed",
        }),
      },
    ),
  );
});

test("fails closed on exact-object errors before deleting prefixes", async () => {
  let prefixCalls = 0;

  await assert.rejects(() =>
    executeDocumentStorageDeletion(
      {
        claimToken,
        documentIds: [],
        folderIds: [],
        objects: [
          {
            logicalBucket: "documents",
            path: "workspaces/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.pdf",
          },
        ],
        prefixes: [
          {
            logicalBucket: "converted-documents",
            pathPrefix:
              "workspaces/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/conversion-attempts/doc/",
          },
        ],
      },
      {
        deleteExact: async () => ({
          ok: false,
          status: 500,
          message: "exact delete failed",
        }),
        deletePrefix: async () => {
          prefixCalls += 1;
          return { ok: true, deletedCount: 0 };
        },
      },
    ),
  );

  assert.equal(prefixCalls, 0);
});
