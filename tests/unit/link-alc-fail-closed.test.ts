import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  fetchLinkAlcViewerSeeds,
  isAlcSeedEmpty,
  isLinkAlcActive,
} from "@/server/linkAlc";
import { fetchLinkAlcRules, isLinkAlcRulesActive } from "@/lib/linkAlcClient";

/**
 * Link-ALC group behavior remains fail-closed when the normal group module
 * cannot resolve a matching membership.
 */

type Row = Record<string, string | null>;

class FakeQuery implements PromiseLike<{
  data: Row[] | null;
  error: { message: string } | null;
}> {
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

  then<TResult1, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: Row[] | null;
          error: { message: string } | null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    if (this.failure) return { data: null, error: this.failure };
    let matched = this.rows.filter((row) =>
      this.predicates.every((predicate) => predicate(row)),
    );
    if (this.limitCount !== null) matched = matched.slice(0, this.limitCount);
    return {
      data: matched.map((row) =>
        Object.fromEntries(
          this.columns.map((column) => [column, row[column] ?? null]),
        ),
      ),
      error: null,
    };
  }
}

/**
 * These resolve group MEMBERSHIP, which is owned by the user-groups module.
 *
 * The link_alc_allowed_*_groups tables ship in core migrations and core counts
 * their rows to decide whether a link has access rules at all.
 */
const createFakeSupabase = (tables: Record<string, Row[]>) => ({
  from: (table: string) => new FakeQuery(tables[table] ?? [], undefined),
});

const asClient = <T>(client: ReturnType<typeof createFakeSupabase>): T =>
  client as unknown as T;

const LINK = "link-1";
const WS = "ws-1";
const VIEWER = "viewer@example.com";

test("group module: a link with NO rules at all is inactive", async () => {
  const client = createFakeSupabase({});
  assert.equal(
    await isLinkAlcActive(
      asClient<Parameters<typeof isLinkAlcActive>[0]>(client),
      LINK,
    ),
    false,
  );
});

test("group module: group-only rules still ACTIVATE the gate (fail closed)", async () => {
  // Existence of group rows is a core row count, deliberately not behind the
  // Core row existence keeps the gate active; no matching seed denies access.
  const client = createFakeSupabase({
    link_alc_allowed_groups: [{ id: "1", link_id: LINK, group_id: "g-1" }],
  });
  assert.equal(
    await isLinkAlcActive(
      asClient<Parameters<typeof isLinkAlcActive>[0]>(client),
      LINK,
    ),
    true,
  );
});

test("group module: folder- and document-scoped group rules also activate", async () => {
  for (const table of [
    "link_alc_allowed_folders_groups",
    "link_alc_allowed_documents_groups",
  ]) {
    const client = createFakeSupabase({
      [table]: [{ id: "1", link_id: LINK, group_id: "g-1" }],
    });
    assert.equal(
      await isLinkAlcActive(
        asClient<Parameters<typeof isLinkAlcActive>[0]>(client),
        LINK,
      ),
      true,
      `${table} must activate the gate`,
    );
  }
});

test("group module: email rules still activate ALC", async () => {
  const client = createFakeSupabase({
    link_alc_allowed_emails: [{ id: "1", link_id: LINK, email: VIEWER }],
  });
  assert.equal(
    await isLinkAlcActive(
      asClient<Parameters<typeof isLinkAlcActive>[0]>(client),
      LINK,
    ),
    true,
  );
});

test("group module: viewer seeds fail closed when groups do not match", async () => {
  const client = createFakeSupabase({
    link_alc_allowed_emails: [
      { id: "1", link_id: LINK, email: "someone-else@example.com" },
    ],
  });

  const seeds = await fetchLinkAlcViewerSeeds(
    asClient<Parameters<typeof fetchLinkAlcViewerSeeds>[0]>(client),
    { linkId: LINK, workspaceId: WS, viewerEmail: VIEWER },
  );

  assert.equal(seeds.roomAllowed, false);
  assert.deepEqual(seeds.viewerGroupIds, []);
  assert.deepEqual(Array.from(seeds.allowedFolderSeedIds), []);
  assert.deepEqual(Array.from(seeds.allowedDocumentSeedIds), []);
  assert.equal(isAlcSeedEmpty(seeds), true);
});

test("group module: email grants still work", async () => {
  const client = createFakeSupabase({
    link_alc_allowed_emails: [{ id: "1", link_id: LINK, email: VIEWER }],
    link_alc_allowed_folders_emails: [
      { id: "1", link_id: LINK, folder_id: "f1", email: VIEWER },
    ],
  });

  const seeds = await fetchLinkAlcViewerSeeds(
    asClient<Parameters<typeof fetchLinkAlcViewerSeeds>[0]>(client),
    { linkId: LINK, workspaceId: WS, viewerEmail: VIEWER },
  );

  assert.equal(seeds.roomAllowed, true);
  assert.deepEqual(Array.from(seeds.allowedFolderSeedIds), ["f1"]);
  assert.deepEqual(seeds.viewerGroupIds, []);
});

test("group module: client rules merge email rules", async () => {
  const client = createFakeSupabase({
    link_alc_allowed_emails: [{ link_id: LINK, email: VIEWER }],
  });

  const rules = await fetchLinkAlcRules(
    asClient<Parameters<typeof fetchLinkAlcRules>[0]>(client),
    LINK,
  );

  assert.deepEqual(rules, {
    room: { allowedEmails: [VIEWER], allowedGroupIds: [] },
    folders: [],
    documents: [],
  });
  assert.equal(isLinkAlcRulesActive(rules), true);
});

test("group module: data-room saves preserve ALC persistence", async () => {
  const managerSource = await readFile(
    new URL("../../src/components/links/LinksManagerCard.tsx", import.meta.url),
    "utf8",
  );

  const firstMutationIndex = managerSource.indexOf(
    "const updated = await updateLink",
  );
  assert.ok(firstMutationIndex >= 0);
  assert.doesNotMatch(managerSource, /isEeFeaturePresent|community build/);

  const settingsSource = await readFile(
    new URL(
      "../../src/components/documents/LinkSettingsPanel.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(settingsSource, /resourceType === "data_room"\s*\? \(/);
});
