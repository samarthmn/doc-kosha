import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchLinkAlcViewerSeeds,
  filterDataRoomContentByAlc,
  isAlcSeedEmpty,
  isLinkAlcActive,
} from "@/server/linkAlc";
import {
  fetchLinkAlcRules,
  isLinkAlcRulesActive,
  replaceLinkAlcRules,
} from "@/lib/linkAlcClient";

/**
 * Pins the COMBINED (email + group) link-ALC
 * evaluation semantics of src/server/linkAlc.ts and src/lib/linkAlcClient.ts.
 *
 * The normal user-groups module owns group evaluation. Access-control slips
 * must fail toward DENY, never be papered over by editing this file.
 */

// ---------------------------------------------------------------------------
// Fake Supabase client: an in-memory table store that supports the exact
// query surface linkAlc/linkAlcClient use (select/eq/in/limit awaited as a
// thenable, plus rpc). Keyed by table name so the assertions are robust to
// query ordering and parallelism changes during the split.
// ---------------------------------------------------------------------------

type Row = Record<string, string | null>;
type FakeTables = Record<string, Row[]>;
type FakeErrors = Record<string, { message: string }>;

type FakeResult = { data: Row[] | null; error: { message: string } | null };

class FakeQuery implements PromiseLike<FakeResult> {
  private predicates: Array<(row: Row) => boolean> = [];
  private columns: string[] = [];
  private limitCount: number | null = null;

  constructor(
    private readonly rows: Row[],
    private readonly failure: { message: string } | undefined,
  ) {}

  select(columns: string): this {
    this.columns = columns.split(",").map((column) => column.trim());
    return this;
  }

  eq(column: string, value: unknown): this {
    this.predicates.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]): this {
    const allowed = new Set(values);
    this.predicates.push((row) => allowed.has(row[column]));
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  order(): this {
    return this;
  }

  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?:
      ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<FakeResult> {
    if (this.failure) return { data: null, error: this.failure };
    let matched = this.rows.filter((row) =>
      this.predicates.every((predicate) => predicate(row)),
    );
    if (this.limitCount !== null) matched = matched.slice(0, this.limitCount);
    const data = matched.map((row) =>
      Object.fromEntries(
        this.columns.map((column) => [column, row[column] ?? null]),
      ),
    );
    return { data, error: null };
  }
}

const createFakeSupabase = (
  tables: FakeTables,
  errors: FakeErrors = {},
  rpcError: { message: string } | null = null,
) => {
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];
  return {
    rpcCalls,
    from: (table: string) => new FakeQuery(tables[table] ?? [], errors[table]),
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return { data: null, error: rpcError };
    },
  };
};

type FakeSupabase = ReturnType<typeof createFakeSupabase>;
type ServerClient = Parameters<typeof isLinkAlcActive>[0];
type BrowserClient = Parameters<typeof fetchLinkAlcRules>[0];

const asServer = (client: FakeSupabase): ServerClient =>
  client as unknown as ServerClient;
const asBrowser = (client: FakeSupabase): BrowserClient =>
  client as unknown as BrowserClient;

const sorted = (values: Iterable<string>): string[] =>
  Array.from(values).sort();

const LINK = "link-1";
const OTHER_LINK = "link-other";
const WS = "ws-1";
const OTHER_WS = "ws-other";
const VIEWER = "viewer@example.com";

const silenceConsoleError = (t: test.TestContext) => {
  t.mock.method(console, "error", () => {});
};

// ---------------------------------------------------------------------------
// isLinkAlcActive: any rule row of any of the six types makes ALC active;
// no rows means inactive; query failures fail closed (active).
// ---------------------------------------------------------------------------

test("isLinkAlcActive: no rules of any type -> inactive", async () => {
  const client = createFakeSupabase({});
  assert.equal(await isLinkAlcActive(asServer(client), LINK), false);
});

test("isLinkAlcActive: each rule type alone activates ALC, scoped to the link", async () => {
  const cases: Array<[string, Row]> = [
    ["link_alc_allowed_emails", { id: "1", link_id: LINK, email: VIEWER }],
    ["link_alc_allowed_groups", { id: "1", link_id: LINK, group_id: "g1" }],
    [
      "link_alc_allowed_folders_emails",
      { id: "1", link_id: LINK, folder_id: "f1", email: VIEWER },
    ],
    [
      "link_alc_allowed_folders_groups",
      { id: "1", link_id: LINK, folder_id: "f1", group_id: "g1" },
    ],
    [
      "link_alc_allowed_documents_emails",
      { id: "1", link_id: LINK, document_id: "d1", email: VIEWER },
    ],
    [
      "link_alc_allowed_documents_groups",
      { id: "1", link_id: LINK, document_id: "d1", group_id: "g1" },
    ],
  ];

  for (const [table, row] of cases) {
    const client = createFakeSupabase({ [table]: [row] });
    assert.equal(
      await isLinkAlcActive(asServer(client), LINK),
      true,
      `${table} row must activate ALC`,
    );
    // The same row on a different link must not activate this link.
    assert.equal(
      await isLinkAlcActive(asServer(client), OTHER_LINK),
      false,
      `${table} row must be link-scoped`,
    );
  }
});

test("isLinkAlcActive: email-side query failure fails closed (active)", async (t) => {
  silenceConsoleError(t);
  const client = createFakeSupabase(
    {},
    {
      link_alc_allowed_emails: { message: "boom" },
    },
  );
  assert.equal(await isLinkAlcActive(asServer(client), LINK), true);
});

test("isLinkAlcActive: group-side query failure fails closed (active)", async (t) => {
  silenceConsoleError(t);
  const client = createFakeSupabase(
    {},
    {
      link_alc_allowed_groups: { message: "boom" },
    },
  );
  assert.equal(await isLinkAlcActive(asServer(client), LINK), true);
});

// ---------------------------------------------------------------------------
// fetchLinkAlcViewerSeeds: room/folder/document scoping for email rules,
// group rules, and their union; workspace-scoped group membership; empty
// seeds mean DENY (isAlcSeedEmpty); failures throw so callers deny.
// ---------------------------------------------------------------------------

test("fetchLinkAlcViewerSeeds: rejects an empty viewer email", async () => {
  const client = createFakeSupabase({});
  await assert.rejects(
    fetchLinkAlcViewerSeeds(asServer(client), {
      linkId: LINK,
      workspaceId: WS,
      viewerEmail: "   ",
    }),
    /viewerEmail required/,
  );
});

test("fetchLinkAlcViewerSeeds: email-only room rule matches with normalization", async () => {
  const client = createFakeSupabase({
    link_alc_allowed_emails: [{ id: "1", link_id: LINK, email: VIEWER }],
  });

  const seeds = await fetchLinkAlcViewerSeeds(asServer(client), {
    linkId: LINK,
    workspaceId: WS,
    viewerEmail: "  Viewer@Example.COM  ",
  });

  assert.equal(seeds.roomAllowed, true);
  assert.deepEqual(sorted(seeds.allowedFolderSeedIds), []);
  assert.deepEqual(sorted(seeds.allowedDocumentSeedIds), []);
  assert.deepEqual(seeds.viewerGroupIds, []);
  assert.equal(isAlcSeedEmpty(seeds), false);
});

test("fetchLinkAlcViewerSeeds: non-matching viewer gets empty seeds (deny)", async () => {
  const client = createFakeSupabase({
    link_alc_allowed_emails: [
      { id: "1", link_id: LINK, email: "someone-else@example.com" },
    ],
    link_alc_allowed_folders_emails: [
      {
        id: "1",
        link_id: LINK,
        folder_id: "f1",
        email: "someone-else@example.com",
      },
    ],
  });

  const seeds = await fetchLinkAlcViewerSeeds(asServer(client), {
    linkId: LINK,
    workspaceId: WS,
    viewerEmail: VIEWER,
  });

  assert.equal(seeds.roomAllowed, false);
  assert.deepEqual(sorted(seeds.allowedFolderSeedIds), []);
  assert.deepEqual(sorted(seeds.allowedDocumentSeedIds), []);
  assert.deepEqual(seeds.viewerGroupIds, []);
  assert.equal(isAlcSeedEmpty(seeds), true);
});

test("fetchLinkAlcViewerSeeds: group-only room rule matches through membership", async () => {
  const client = createFakeSupabase({
    workspace_user_group_emails: [
      { workspace_id: WS, group_id: "g1", email: VIEWER },
    ],
    link_alc_allowed_groups: [
      { id: "1", link_id: LINK, group_id: "g1" },
      { id: "2", link_id: OTHER_LINK, group_id: "g1" },
    ],
  });

  const seeds = await fetchLinkAlcViewerSeeds(asServer(client), {
    linkId: LINK,
    workspaceId: WS,
    viewerEmail: " Viewer@example.com ",
  });

  assert.equal(seeds.roomAllowed, true);
  assert.deepEqual(seeds.viewerGroupIds, ["g1"]);
  assert.equal(isAlcSeedEmpty(seeds), false);
});

test("fetchLinkAlcViewerSeeds: group membership is workspace-scoped", async () => {
  const client = createFakeSupabase({
    workspace_user_group_emails: [
      // Same email, but the membership lives in another workspace.
      { workspace_id: OTHER_WS, group_id: "g1", email: VIEWER },
    ],
    link_alc_allowed_groups: [{ id: "1", link_id: LINK, group_id: "g1" }],
  });

  const seeds = await fetchLinkAlcViewerSeeds(asServer(client), {
    linkId: LINK,
    workspaceId: WS,
    viewerEmail: VIEWER,
  });

  assert.equal(seeds.roomAllowed, false);
  assert.deepEqual(seeds.viewerGroupIds, []);
  assert.equal(isAlcSeedEmpty(seeds), true);
});

test("fetchLinkAlcViewerSeeds: group rules for other groups never match", async () => {
  const client = createFakeSupabase({
    workspace_user_group_emails: [
      { workspace_id: WS, group_id: "g2", email: VIEWER },
    ],
    link_alc_allowed_groups: [{ id: "1", link_id: LINK, group_id: "g1" }],
    link_alc_allowed_folders_groups: [
      { id: "1", link_id: LINK, folder_id: "f1", group_id: "g1" },
    ],
  });

  const seeds = await fetchLinkAlcViewerSeeds(asServer(client), {
    linkId: LINK,
    workspaceId: WS,
    viewerEmail: VIEWER,
  });

  assert.equal(seeds.roomAllowed, false);
  assert.deepEqual(sorted(seeds.allowedFolderSeedIds), []);
  assert.deepEqual(seeds.viewerGroupIds, ["g2"]);
  assert.equal(isAlcSeedEmpty(seeds), true);
});

test("fetchLinkAlcViewerSeeds: folder/document seeds union email and group grants", async () => {
  const client = createFakeSupabase({
    workspace_user_group_emails: [
      { workspace_id: WS, group_id: "g1", email: VIEWER },
    ],
    link_alc_allowed_folders_emails: [
      { id: "1", link_id: LINK, folder_id: "f-email", email: VIEWER },
      {
        id: "2",
        link_id: LINK,
        folder_id: "f-noise",
        email: "other@example.com",
      },
      { id: "3", link_id: OTHER_LINK, folder_id: "f-otherlink", email: VIEWER },
    ],
    link_alc_allowed_folders_groups: [
      { id: "1", link_id: LINK, folder_id: "f-group", group_id: "g1" },
      { id: "2", link_id: LINK, folder_id: "f-noise2", group_id: "g9" },
    ],
    link_alc_allowed_documents_emails: [
      { id: "1", link_id: LINK, document_id: "d-email", email: VIEWER },
    ],
    link_alc_allowed_documents_groups: [
      { id: "1", link_id: LINK, document_id: "d-group", group_id: "g1" },
    ],
  });

  const seeds = await fetchLinkAlcViewerSeeds(asServer(client), {
    linkId: LINK,
    workspaceId: WS,
    viewerEmail: VIEWER,
  });

  assert.equal(seeds.roomAllowed, false);
  assert.deepEqual(sorted(seeds.allowedFolderSeedIds), ["f-email", "f-group"]);
  assert.deepEqual(sorted(seeds.allowedDocumentSeedIds), [
    "d-email",
    "d-group",
  ]);
  assert.deepEqual(seeds.viewerGroupIds, ["g1"]);
  assert.equal(isAlcSeedEmpty(seeds), false);
});

test("fetchLinkAlcViewerSeeds: the same folder granted by email and group dedupes", async () => {
  const client = createFakeSupabase({
    workspace_user_group_emails: [
      { workspace_id: WS, group_id: "g1", email: VIEWER },
    ],
    link_alc_allowed_folders_emails: [
      { id: "1", link_id: LINK, folder_id: "f-shared", email: VIEWER },
    ],
    link_alc_allowed_folders_groups: [
      { id: "1", link_id: LINK, folder_id: "f-shared", group_id: "g1" },
    ],
  });

  const seeds = await fetchLinkAlcViewerSeeds(asServer(client), {
    linkId: LINK,
    workspaceId: WS,
    viewerEmail: VIEWER,
  });

  assert.deepEqual(sorted(seeds.allowedFolderSeedIds), ["f-shared"]);
});

test("fetchLinkAlcViewerSeeds: room allow via email and group together stays allowed", async () => {
  const client = createFakeSupabase({
    workspace_user_group_emails: [
      { workspace_id: WS, group_id: "g1", email: VIEWER },
    ],
    link_alc_allowed_emails: [{ id: "1", link_id: LINK, email: VIEWER }],
    link_alc_allowed_groups: [{ id: "1", link_id: LINK, group_id: "g1" }],
  });

  const seeds = await fetchLinkAlcViewerSeeds(asServer(client), {
    linkId: LINK,
    workspaceId: WS,
    viewerEmail: VIEWER,
  });

  assert.equal(seeds.roomAllowed, true);
  assert.deepEqual(seeds.viewerGroupIds, ["g1"]);
});

test("fetchLinkAlcViewerSeeds: membership lookup failure throws (deny)", async (t) => {
  silenceConsoleError(t);
  const client = createFakeSupabase(
    {},
    {
      workspace_user_group_emails: { message: "membership down" },
    },
  );
  await assert.rejects(
    fetchLinkAlcViewerSeeds(asServer(client), {
      linkId: LINK,
      workspaceId: WS,
      viewerEmail: VIEWER,
    }),
    (error: { message?: string }) => error?.message === "membership down",
  );
});

test("fetchLinkAlcViewerSeeds: email-side seed query failure throws (deny)", async (t) => {
  silenceConsoleError(t);
  const client = createFakeSupabase(
    {},
    {
      link_alc_allowed_folders_emails: { message: "folders down" },
    },
  );
  await assert.rejects(
    fetchLinkAlcViewerSeeds(asServer(client), {
      linkId: LINK,
      workspaceId: WS,
      viewerEmail: VIEWER,
    }),
    (error: { message?: string }) => error?.message === "folders down",
  );
});

test("fetchLinkAlcViewerSeeds: group-side seed query failure throws (deny)", async (t) => {
  silenceConsoleError(t);
  const client = createFakeSupabase(
    {
      workspace_user_group_emails: [
        { workspace_id: WS, group_id: "g1", email: VIEWER },
      ],
    },
    { link_alc_allowed_documents_groups: { message: "doc groups down" } },
  );
  await assert.rejects(
    fetchLinkAlcViewerSeeds(asServer(client), {
      linkId: LINK,
      workspaceId: WS,
      viewerEmail: VIEWER,
    }),
    (error: { message?: string }) => error?.message === "doc groups down",
  );
});

// ---------------------------------------------------------------------------
// filterDataRoomContentByAlc: room allow overrides everything; folder seeds
// allow descendants and expose ancestors; document seeds expose their folder
// path; empty seeds allow nothing.
// ---------------------------------------------------------------------------

const FOLDERS = [
  { id: "A", parent_folder_id: null },
  { id: "A1", parent_folder_id: "A" },
  { id: "A1a", parent_folder_id: "A1" },
  { id: "A2", parent_folder_id: "A" },
  { id: "B", parent_folder_id: null },
];

const DOCUMENTS = [
  { id: "dRoot", folder_id: null },
  { id: "dA", folder_id: "A" },
  { id: "dA1", folder_id: "A1" },
  { id: "dA1a", folder_id: "A1a" },
  { id: "dB", folder_id: "B" },
];

test("filterDataRoomContentByAlc: room allow overrides folder/document restrictions", () => {
  const result = filterDataRoomContentByAlc({
    folders: FOLDERS,
    documents: DOCUMENTS,
    roomAllowed: true,
    allowedFolderSeedIds: new Set<string>(),
    allowedDocumentSeedIds: new Set<string>(),
  });

  assert.deepEqual(sorted(result.allowedFolderIds), [
    "A",
    "A1",
    "A1a",
    "A2",
    "B",
  ]);
  assert.deepEqual(sorted(result.allowedDocumentIds), [
    "dA",
    "dA1",
    "dA1a",
    "dB",
    "dRoot",
  ]);
  assert.equal(result.filteredFolders.length, FOLDERS.length);
  assert.equal(result.filteredDocuments.length, DOCUMENTS.length);
});

test("filterDataRoomContentByAlc: folder seed grants descendants, exposes ancestors", () => {
  const result = filterDataRoomContentByAlc({
    folders: FOLDERS,
    documents: DOCUMENTS,
    roomAllowed: false,
    allowedFolderSeedIds: new Set(["A1"]),
    allowedDocumentSeedIds: new Set<string>(),
  });

  assert.deepEqual(sorted(result.allowedFolderIds), ["A", "A1", "A1a"]);
  assert.deepEqual(sorted(result.allowedDocumentIds), ["dA1", "dA1a"]);
  assert.deepEqual(sorted(result.filteredFolders.map((f) => f.id)), [
    "A",
    "A1",
    "A1a",
  ]);
  assert.deepEqual(sorted(result.filteredDocuments.map((d) => d.id)), [
    "dA1",
    "dA1a",
  ]);
});

test("filterDataRoomContentByAlc: document seed exposes only its folder path", () => {
  const result = filterDataRoomContentByAlc({
    folders: FOLDERS,
    documents: DOCUMENTS,
    roomAllowed: false,
    allowedFolderSeedIds: new Set<string>(),
    allowedDocumentSeedIds: new Set(["dA1a"]),
  });

  assert.deepEqual(sorted(result.allowedFolderIds), ["A", "A1", "A1a"]);
  assert.deepEqual(sorted(result.allowedDocumentIds), ["dA1a"]);
});

test("filterDataRoomContentByAlc: root-level document seed grants no folders", () => {
  const result = filterDataRoomContentByAlc({
    folders: FOLDERS,
    documents: DOCUMENTS,
    roomAllowed: false,
    allowedFolderSeedIds: new Set<string>(),
    allowedDocumentSeedIds: new Set(["dRoot"]),
  });

  assert.deepEqual(sorted(result.allowedFolderIds), []);
  assert.deepEqual(sorted(result.allowedDocumentIds), ["dRoot"]);
});

test("filterDataRoomContentByAlc: empty seeds allow nothing (deny)", () => {
  const result = filterDataRoomContentByAlc({
    folders: FOLDERS,
    documents: DOCUMENTS,
    roomAllowed: false,
    allowedFolderSeedIds: new Set<string>(),
    allowedDocumentSeedIds: new Set<string>(),
  });

  assert.deepEqual(sorted(result.allowedFolderIds), []);
  assert.deepEqual(sorted(result.allowedDocumentIds), []);
  assert.deepEqual(result.filteredFolders, []);
  assert.deepEqual(result.filteredDocuments, []);
});

test("isAlcSeedEmpty: empty only when no room, folder, and document grants", () => {
  const empty = {
    roomAllowed: false,
    allowedFolderSeedIds: new Set<string>(),
    allowedDocumentSeedIds: new Set<string>(),
  };
  assert.equal(isAlcSeedEmpty(empty), true);
  assert.equal(isAlcSeedEmpty({ ...empty, roomAllowed: true }), false);
  assert.equal(
    isAlcSeedEmpty({ ...empty, allowedFolderSeedIds: new Set(["f1"]) }),
    false,
  );
  assert.equal(
    isAlcSeedEmpty({ ...empty, allowedDocumentSeedIds: new Set(["d1"]) }),
    false,
  );
});

// ---------------------------------------------------------------------------
// Client mirror: fetchLinkAlcRules merges email and group rows per scope,
// normalizes and dedupes, drops empty rules, sorts deterministically;
// isLinkAlcRulesActive treats any rule as active; replaceLinkAlcRules sends
// the normalized payload to the replace_link_alc_rules RPC.
// ---------------------------------------------------------------------------

test("fetchLinkAlcRules: email-only rules normalize, dedupe, sort, and drop empties", async () => {
  const client = createFakeSupabase({
    link_alc_allowed_emails: [
      { link_id: LINK, email: "Bob@Example.com" },
      { link_id: LINK, email: " bob@example.com " },
      { link_id: OTHER_LINK, email: "not-me@example.com" },
    ],
    link_alc_allowed_folders_emails: [
      { link_id: LINK, folder_id: "fB", email: "x@y.z" },
      { link_id: LINK, folder_id: "fA", email: "x@y.z" },
      // Blank email: the fA/fB rules survive, this one must not produce a rule.
      { link_id: LINK, folder_id: "fC", email: "   " },
    ],
    link_alc_allowed_documents_emails: [
      { link_id: LINK, document_id: "d2", email: "Doc@Viewer.com" },
      { link_id: LINK, document_id: "d1", email: "doc@viewer.com" },
    ],
  });

  const rules = await fetchLinkAlcRules(asBrowser(client), LINK);

  assert.deepEqual(rules.room, {
    allowedEmails: ["bob@example.com"],
    allowedGroupIds: [],
  });
  assert.deepEqual(rules.folders, [
    { folderId: "fA", allowedEmails: ["x@y.z"], allowedGroupIds: [] },
    { folderId: "fB", allowedEmails: ["x@y.z"], allowedGroupIds: [] },
  ]);
  assert.deepEqual(rules.documents, [
    {
      documentId: "d1",
      allowedEmails: ["doc@viewer.com"],
      allowedGroupIds: [],
    },
    {
      documentId: "d2",
      allowedEmails: ["doc@viewer.com"],
      allowedGroupIds: [],
    },
  ]);
  assert.equal(isLinkAlcRulesActive(rules), true);
});

test("fetchLinkAlcRules: group-only rules populate group ids with trim + dedupe", async () => {
  const client = createFakeSupabase({
    link_alc_allowed_groups: [
      { link_id: LINK, group_id: "g2" },
      { link_id: LINK, group_id: "g1" },
      { link_id: LINK, group_id: " g1 " },
    ],
    link_alc_allowed_folders_groups: [
      { link_id: LINK, folder_id: "f1", group_id: " gF " },
    ],
    link_alc_allowed_documents_groups: [
      { link_id: LINK, document_id: "d1", group_id: "gD" },
    ],
  });

  const rules = await fetchLinkAlcRules(asBrowser(client), LINK);

  assert.deepEqual(rules.room, {
    allowedEmails: [],
    allowedGroupIds: ["g2", "g1"],
  });
  assert.deepEqual(rules.folders, [
    { folderId: "f1", allowedEmails: [], allowedGroupIds: ["gF"] },
  ]);
  assert.deepEqual(rules.documents, [
    { documentId: "d1", allowedEmails: [], allowedGroupIds: ["gD"] },
  ]);
  assert.equal(isLinkAlcRulesActive(rules), true);
});

test("fetchLinkAlcRules: email and group rows merge into one rule per target", async () => {
  const client = createFakeSupabase({
    link_alc_allowed_emails: [{ link_id: LINK, email: VIEWER }],
    link_alc_allowed_groups: [{ link_id: LINK, group_id: "gRoom" }],
    link_alc_allowed_folders_emails: [
      { link_id: LINK, folder_id: "f1", email: "a@b.c" },
    ],
    link_alc_allowed_folders_groups: [
      { link_id: LINK, folder_id: "f1", group_id: "gF" },
    ],
    link_alc_allowed_documents_emails: [
      { link_id: LINK, document_id: "d1", email: "a@b.c" },
    ],
    link_alc_allowed_documents_groups: [
      { link_id: LINK, document_id: "d1", group_id: "gD" },
    ],
  });

  const rules = await fetchLinkAlcRules(asBrowser(client), LINK);

  assert.deepEqual(rules.room, {
    allowedEmails: [VIEWER],
    allowedGroupIds: ["gRoom"],
  });
  assert.deepEqual(rules.folders, [
    { folderId: "f1", allowedEmails: ["a@b.c"], allowedGroupIds: ["gF"] },
  ]);
  assert.deepEqual(rules.documents, [
    { documentId: "d1", allowedEmails: ["a@b.c"], allowedGroupIds: ["gD"] },
  ]);
});

test("fetchLinkAlcRules: no rows -> inactive empty rules", async () => {
  const client = createFakeSupabase({});
  const rules = await fetchLinkAlcRules(asBrowser(client), LINK);

  assert.deepEqual(rules, {
    room: { allowedEmails: [], allowedGroupIds: [] },
    folders: [],
    documents: [],
  });
  assert.equal(isLinkAlcRulesActive(rules), false);
});

test("fetchLinkAlcRules: email-side query failure throws", async (t) => {
  silenceConsoleError(t);
  const client = createFakeSupabase(
    {},
    {
      link_alc_allowed_emails: { message: "emails down" },
    },
  );
  await assert.rejects(
    fetchLinkAlcRules(asBrowser(client), LINK),
    (error: { message?: string }) => error?.message === "emails down",
  );
});

test("fetchLinkAlcRules: group-side query failure throws", async (t) => {
  silenceConsoleError(t);
  const client = createFakeSupabase(
    {},
    {
      link_alc_allowed_folders_groups: { message: "folder groups down" },
    },
  );
  await assert.rejects(
    fetchLinkAlcRules(asBrowser(client), LINK),
    (error: { message?: string }) => error?.message === "folder groups down",
  );
});

test("isLinkAlcRulesActive: any single rule type activates", () => {
  const empty = {
    room: { allowedEmails: [], allowedGroupIds: [] },
    folders: [],
    documents: [],
  };
  assert.equal(isLinkAlcRulesActive(empty), false);
  assert.equal(
    isLinkAlcRulesActive({
      ...empty,
      room: { allowedEmails: [VIEWER], allowedGroupIds: [] },
    }),
    true,
  );
  assert.equal(
    isLinkAlcRulesActive({
      ...empty,
      room: { allowedEmails: [], allowedGroupIds: ["g1"] },
    }),
    true,
  );
  assert.equal(
    isLinkAlcRulesActive({
      ...empty,
      folders: [{ folderId: "f1", allowedEmails: [], allowedGroupIds: ["g1"] }],
    }),
    true,
  );
  assert.equal(
    isLinkAlcRulesActive({
      ...empty,
      documents: [
        { documentId: "d1", allowedEmails: [VIEWER], allowedGroupIds: [] },
      ],
    }),
    true,
  );
});

test("replaceLinkAlcRules: sends the normalized payload to replace_link_alc_rules", async () => {
  const client = createFakeSupabase({});

  await replaceLinkAlcRules(asBrowser(client), {
    linkId: LINK,
    workspaceId: WS,
    rules: {
      room: {
        allowedEmails: [" Alice@Example.com", "alice@example.com"],
        allowedGroupIds: [" g1 ", "g1"],
      },
      folders: [
        { folderId: "f1", allowedEmails: ["B@b.com"], allowedGroupIds: [] },
      ],
      documents: [
        { documentId: "d1", allowedEmails: [], allowedGroupIds: ["g2"] },
      ],
    },
  });

  assert.equal(client.rpcCalls.length, 1);
  assert.equal(client.rpcCalls[0]?.fn, "replace_link_alc_rules");
  assert.deepEqual(client.rpcCalls[0]?.args, {
    p_workspace_id: WS,
    p_link_id: LINK,
    p_payload: {
      room: { allowedEmails: ["alice@example.com"], allowedGroupIds: ["g1"] },
      folders: [
        { folderId: "f1", allowedEmails: ["b@b.com"], allowedGroupIds: [] },
      ],
      documents: [
        { documentId: "d1", allowedEmails: [], allowedGroupIds: ["g2"] },
      ],
    },
  });
});

test("replaceLinkAlcRules: RPC failure throws", async () => {
  const client = createFakeSupabase({}, {}, { message: "rpc down" });
  await assert.rejects(
    replaceLinkAlcRules(asBrowser(client), {
      linkId: LINK,
      workspaceId: WS,
      rules: {
        room: { allowedEmails: [], allowedGroupIds: [] },
        folders: [],
        documents: [],
      },
    }),
    (error: { message?: string }) => error?.message === "rpc down",
  );
});
