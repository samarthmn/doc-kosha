import assert from "node:assert/strict";
import test from "node:test";

import type { LinkAlcRules } from "@/lib/linkAlcClient";
import {
  findRoomWideAlcOverlaps,
  resolveRoomWideAlcOverlaps,
} from "@/modules/public-links";

const createRules = (overrides: Partial<LinkAlcRules> = {}): LinkAlcRules => ({
  room: {
    allowedEmails: [],
    allowedGroupIds: [],
    ...overrides.room,
  },
  folders: overrides.folders ?? [],
  documents: overrides.documents ?? [],
});

test("findRoomWideAlcOverlaps normalizes emails, exactly matches groups, and sorts detailed targets", () => {
  const overlaps = findRoomWideAlcOverlaps(
    createRules({
      room: {
        allowedEmails: ["  Viewer@Example.com "],
        allowedGroupIds: [" team-A ", "TEAM-a"],
      },
      folders: [
        {
          folderId: "folder-z",
          allowedEmails: ["viewer@example.COM"],
          allowedGroupIds: [" team-A "],
        },
        {
          folderId: "folder-a",
          allowedEmails: ["other@example.com"],
          allowedGroupIds: ["TEAM-a"],
        },
      ],
      documents: [
        {
          documentId: "document-b",
          allowedEmails: [" VIEWER@example.com "],
          allowedGroupIds: ["team-A"],
        },
        {
          documentId: "document-a",
          allowedEmails: [],
          allowedGroupIds: ["team-A"],
        },
      ],
    }),
  );

  assert.deepEqual(overlaps, [
    {
      key: "email:viewer@example.com",
      kind: "email",
      displayValue: "viewer@example.com",
      targets: [
        { scope: "document", targetId: "document-b" },
        { scope: "folder", targetId: "folder-z" },
      ],
    },
    {
      key: "group: team-A ",
      kind: "group",
      displayValue: " team-A ",
      targets: [{ scope: "folder", targetId: "folder-z" }],
    },
    {
      key: "group:TEAM-a",
      kind: "group",
      displayValue: "TEAM-a",
      targets: [{ scope: "folder", targetId: "folder-a" }],
    },
  ]);
});

test("findRoomWideAlcOverlaps matches group IDs only when their strings are identical", () => {
  const overlaps = findRoomWideAlcOverlaps(
    createRules({
      room: {
        allowedEmails: [],
        allowedGroupIds: ["team-a"],
      },
      folders: [
        {
          folderId: "exact-group",
          allowedEmails: [],
          allowedGroupIds: ["team-a"],
        },
        {
          folderId: "whitespace-variant",
          allowedEmails: [],
          allowedGroupIds: [" team-a "],
        },
        {
          folderId: "case-variant",
          allowedEmails: [],
          allowedGroupIds: ["TEAM-A"],
        },
      ],
    }),
  );

  assert.deepEqual(overlaps, [
    {
      key: "group:team-a",
      kind: "group",
      displayValue: "team-a",
      targets: [{ scope: "folder", targetId: "exact-group" }],
    },
  ]);
});

test("resolveRoomWideAlcOverlaps keeps room-wide choices and removes empty detailed rules", () => {
  const rules = createRules({
    room: {
      allowedEmails: [" Viewer@Example.com ", "room-only@example.com"],
      allowedGroupIds: ["team-a", "room-group"],
    },
    folders: [
      {
        folderId: "folder-1",
        allowedEmails: ["viewer@example.com"],
        allowedGroupIds: ["team-a"],
      },
      {
        folderId: "folder-2",
        allowedEmails: ["other@example.com"],
        allowedGroupIds: ["team-a", "folder-group"],
      },
    ],
    documents: [
      {
        documentId: "document-1",
        allowedEmails: ["viewer@example.com", "document@example.com"],
        allowedGroupIds: ["document-group"],
      },
    ],
  });

  const resolved = resolveRoomWideAlcOverlaps(rules, {
    "email:viewer@example.com": "keep_room",
    "group:team-a": "keep_room",
  });

  assert.deepEqual(resolved, {
    room: rules.room,
    folders: [
      {
        folderId: "folder-2",
        allowedEmails: ["other@example.com"],
        allowedGroupIds: ["folder-group"],
      },
    ],
    documents: [
      {
        documentId: "document-1",
        allowedEmails: ["document@example.com"],
        allowedGroupIds: ["document-group"],
      },
    ],
  });
});

test("resolveRoomWideAlcOverlaps removes only the exact group ID selected by a resolution", () => {
  const rules = createRules({
    room: {
      allowedEmails: [],
      allowedGroupIds: ["team-a"],
    },
    folders: [
      {
        folderId: "folder-1",
        allowedEmails: [],
        allowedGroupIds: ["team-a", " team-a ", "TEAM-A"],
      },
    ],
  });

  assert.deepEqual(
    resolveRoomWideAlcOverlaps(rules, {
      "group:team-a": "keep_room",
    }),
    {
      room: rules.room,
      folders: [
        {
          folderId: "folder-1",
          allowedEmails: [],
          allowedGroupIds: [" team-a ", "TEAM-A"],
        },
      ],
      documents: [],
    },
  );
});

test("resolveRoomWideAlcOverlaps keeps detailed placements without inferring group membership", () => {
  const rules = createRules({
    room: {
      allowedEmails: ["viewer@example.com"],
      allowedGroupIds: ["viewer@example.com", "team-a"],
    },
    folders: [
      {
        folderId: "folder-1",
        allowedEmails: ["VIEWER@example.com", "other@example.com"],
        allowedGroupIds: ["team-a", "viewer@example.com"],
      },
    ],
    documents: [
      {
        documentId: "document-1",
        allowedEmails: [],
        allowedGroupIds: ["team-a"],
      },
    ],
  });

  const resolved = resolveRoomWideAlcOverlaps(rules, {
    "email:viewer@example.com": "keep_detailed",
    "group:team-a": "keep_detailed",
    "group:viewer@example.com": "keep_detailed",
  });

  assert.deepEqual(resolved, {
    room: {
      allowedEmails: [],
      allowedGroupIds: [],
    },
    folders: rules.folders,
    documents: rules.documents,
  });
  assert.deepEqual(findRoomWideAlcOverlaps(resolved), []);
  assert.deepEqual(
    resolveRoomWideAlcOverlaps(resolved, {}),
    resolved,
    "resolution is idempotent after all overlaps are removed",
  );
});

test("resolveRoomWideAlcOverlaps rejects incomplete, unknown, and invalid decisions", () => {
  const rules = createRules({
    room: {
      allowedEmails: ["viewer@example.com"],
      allowedGroupIds: ["team-a"],
    },
    folders: [
      {
        folderId: "folder-1",
        allowedEmails: ["viewer@example.com"],
        allowedGroupIds: ["team-a"],
      },
    ],
  });

  assert.throws(
    () =>
      resolveRoomWideAlcOverlaps(rules, {
        "email:viewer@example.com": "keep_room",
      }),
    /Missing resolution for overlap group:team-a/,
  );
  assert.throws(
    () =>
      resolveRoomWideAlcOverlaps(rules, {
        "email:viewer@example.com": "keep_room",
        "group:team-a": "keep_detailed",
        "email:unknown@example.com": "keep_room",
      }),
    /Unknown overlap resolution email:unknown@example.com/,
  );
  assert.throws(
    () =>
      resolveRoomWideAlcOverlaps(rules, {
        "email:viewer@example.com": "keep_room",
        "group:team-a": "other",
      }),
    /Invalid resolution for overlap group:team-a/,
  );
});

test("resolveRoomWideAlcOverlaps preserves pre-existing empty detailed rules", () => {
  const rules = createRules({
    folders: [
      {
        folderId: "empty-folder",
        allowedEmails: [],
        allowedGroupIds: [],
      },
    ],
    documents: [
      {
        documentId: "empty-document",
        allowedEmails: [],
        allowedGroupIds: [],
      },
    ],
  });

  assert.deepEqual(resolveRoomWideAlcOverlaps(rules, {}), rules);
});
