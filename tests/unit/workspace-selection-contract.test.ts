import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const readSource = (filePath: string): string =>
  readFileSync(path.join(process.cwd(), filePath), "utf8");

test("server gates and client hydration select the same canonical workspace", () => {
  const sources = [
    "src/server/initialFetch.ts",
    "src/app/(authenticated)/layout.tsx",
    "src/app/(authenticated)/dashboard/page.tsx",
    "src/app/(authenticated)/documents/layout.tsx",
    "src/app/onboarding/page.tsx",
    "src/modules/auth/server/entryRedirect.ts",
    "src/modules/testimonials/server.ts",
  ].map(readSource);

  for (const source of sources) {
    const createdAtOrder = source.indexOf(
      '.order("created_at", { ascending: true })',
    );
    const workspaceIdOrder = source.indexOf(
      '.order("workspace_id", { ascending: true })',
    );

    assert.notEqual(createdAtOrder, -1);
    assert.ok(workspaceIdOrder > createdAtOrder);
  }
});
