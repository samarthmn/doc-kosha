import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidShareSlug,
  normalizeShareSlug,
  sanitizeShareSlugDraft,
  selectWorkspaceScopedLink,
} from "@/lib/publicLinkPaths";

test("preserves a trailing separator while typing", () => {
  assert.equal(sanitizeShareSlugDraft("Investor-"), "investor-");
  assert.equal(sanitizeShareSlugDraft("Investor_"), "investor_");
  assert.equal(sanitizeShareSlugDraft("Investor-Update"), "investor-update");
});

test("canonical normalization still stores only a valid slug", () => {
  assert.equal(normalizeShareSlug("Investor-Update"), "investor-update");
  assert.equal(normalizeShareSlug("Investor-"), "investor");
  assert.equal(normalizeShareSlug("Investor_"), "investor");
  assert.equal(isValidShareSlug("investor-update"), true);
  assert.equal(isValidShareSlug("investor-"), false);
  assert.equal(isValidShareSlug("investor_"), false);
});

test("selects duplicate custom slugs only within the requested workspace", () => {
  const links = [
    { id: "link-a", workspace_id: "workspace-a" },
    { id: "link-b", workspace_id: "workspace-b" },
  ];
  const workspaces = [
    { id: "workspace-a", name: "Alpha Team" },
    { id: "workspace-b", name: "Beta Team" },
  ];

  assert.deepEqual(
    selectWorkspaceScopedLink({
      links,
      workspaces,
      workspaceSlug: "beta-team",
    }),
    {
      status: "resolved",
      link: links[1],
      workspaceName: "Beta Team",
    },
  );
  assert.deepEqual(
    selectWorkspaceScopedLink({
      links,
      workspaces: [
        { id: "workspace-a", name: "Same Team" },
        { id: "workspace-b", name: "Same Team" },
      ],
      workspaceSlug: "same-team",
    }),
    { status: "ambiguous" },
  );
});

test("preserves canonical redirects only for a globally unique link slug", () => {
  const link = { id: "link-a", workspace_id: "workspace-a" };

  assert.deepEqual(
    selectWorkspaceScopedLink({
      links: [link],
      workspaces: [{ id: "workspace-a", name: "Renamed Team" }],
      workspaceSlug: "old-team",
    }),
    {
      status: "resolved",
      link,
      workspaceName: "Renamed Team",
    },
  );
  assert.deepEqual(
    selectWorkspaceScopedLink({
      links: [link, { id: "link-b", workspace_id: "workspace-b" }],
      workspaces: [
        { id: "workspace-a", name: "Alpha Team" },
        { id: "workspace-b", name: "Beta Team" },
      ],
      workspaceSlug: "missing-team",
    }),
    { status: "absent" },
  );
});
