import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const resolveMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260710031709_public_resolve_conversion_status.sql",
    import.meta.url,
  ),
  "utf8",
);
const claimMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260710035718_document_conversion_claim.sql",
    import.meta.url,
  ),
  "utf8",
);
const passwordBoundaryMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260710054546_resolve_public_link_password_boundary.sql",
    import.meta.url,
  ),
  "utf8",
);

test("public resolve exposes readiness only through the server role", () => {
  assert.match(resolveMigration, /conversion_status text/);
  assert.match(resolveMigration, /conversion_status := d\.conversion_status/);
  assert.match(
    resolveMigration,
    /revoke all on function public\.resolve_public_link[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    resolveMigration,
    /grant execute on function public\.resolve_public_link[\s\S]*to service_role/,
  );
});

test("conversion claims are added in their own forward-only migration", () => {
  assert.doesNotMatch(
    resolveMigration,
    /add column[\s\S]*conversion_claim_id/i,
  );
  assert.match(
    claimMigration,
    /alter table public\.documents[\s\S]*add column if not exists conversion_claim_id uuid/,
  );
});

test("public resolve leaves password and cookie validation at the API boundary", () => {
  for (const migration of [resolveMigration, passwordBoundaryMigration]) {
    assert.doesNotMatch(migration, /\bcrypt\s*\(/i);
    assert.doesNotMatch(migration, /BAD_PASSWORD/);
  }
  assert.match(
    passwordBoundaryMigration,
    /revoke all on function public\.resolve_public_link[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    passwordBoundaryMigration,
    /grant execute on function public\.resolve_public_link[\s\S]*to service_role/,
  );
});
