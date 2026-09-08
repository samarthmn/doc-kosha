import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const migrationsDirectory = fileURLToPath(
  new URL("../../supabase/migrations/", import.meta.url),
);
const claimMigrationNames = readdirSync(migrationsDirectory).filter((name) =>
  name.endsWith("_document_deletion_claim_fence.sql"),
);
const migrationSql =
  claimMigrationNames.length === 1
    ? readFileSync(`${migrationsDirectory}/${claimMigrationNames[0]}`, "utf8")
    : "";
const finalizerSql =
  migrationSql.match(
    /create or replace function public\.delete_document_selection\([\s\S]*?\n\$\$;/,
  )?.[0] ?? "";

test("adds a private durable claim with initiator, finalizer, and processing state", () => {
  assert.equal(claimMigrationNames.length, 1);
  assert.match(migrationSql, /create table public\.document_deletion_claims/);
  assert.match(migrationSql, /initiated_by uuid not null/);
  assert.match(migrationSql, /finalized_by uuid/);
  assert.match(migrationSql, /processing_candidates jsonb not null/);
  assert.match(
    migrationSql,
    /alter table public\.document_deletion_claims enable row level security/,
  );
  assert.match(
    migrationSql,
    /grant select, insert, update on table public\.document_deletion_claims to service_role/,
  );
  assert.doesNotMatch(
    migrationSql,
    /grant [^;]* on table public\.document_deletion_claims to (anon|authenticated)/,
  );
});

test("planning stabilizes recursive targets and rejects non-identical overlaps", () => {
  assert.match(migrationSql, /pg_advisory_xact_lock/);
  assert.match(migrationSql, /loop[\s\S]*with recursive descendants/);
  assert.match(migrationSql, /document_ids && v_target_document_ids/);
  assert.match(migrationSql, /folder_ids && v_target_folder_ids/);
  assert.match(
    migrationSql,
    /raise exception 'document deletion overlaps an active claim'[\s\S]*P0003/,
  );
  assert.match(migrationSql, /insert into public\.document_deletion_claims/);
  assert.match(migrationSql, /'claimToken'/);
});

test("identical claims are resumable without requiring the initiating actor", () => {
  assert.match(
    migrationSql,
    /explicit_document_ids = v_document_ids[\s\S]*explicit_folder_ids = v_folder_ids/,
  );
  assert.match(migrationSql, /status in \('active', 'completed'\)/);
  assert.doesNotMatch(migrationSql, /initiated_by = p_actor_id/);
});

test("claimed mutations and new children take the same resource locks and fail closed", () => {
  assert.match(
    migrationSql,
    /create or replace function public\.enforce_document_deletion_claim_fence/,
  );
  for (const table of [
    "documents",
    "folders",
    "document_versions",
    "nda_signatures",
  ]) {
    assert.match(
      migrationSql,
      new RegExp(
        `create trigger enforce_${table}_deletion_claim[\\s\\S]*on public\\.${table}`,
      ),
    );
  }
  assert.match(migrationSql, /new\.folder_id/);
  assert.match(migrationSql, /new\.parent_folder_id/);
  assert.match(migrationSql, /resource is claimed for deletion/);
});

test("active processing candidates remain discoverable for late cleanup", () => {
  assert.match(migrationSql, /conversion_claim_id/);
  assert.match(migrationSql, /processing_candidates/);
  assert.match(
    migrationSql,
    /create or replace function public\.get_document_deletion_claim_state/,
  );
  assert.match(
    migrationSql,
    /grant execute on function public\.get_document_deletion_claim_state[\s\S]*to service_role/,
  );
  assert.doesNotMatch(
    migrationSql,
    /grant execute on function public\.get_document_deletion_claim_state[\s\S]*to authenticated/,
  );
  assert.doesNotMatch(
    migrationSql,
    /raise exception 'document conversion is in progress'/,
  );
});

test("finalization validates the claim and returns completed claims idempotently", () => {
  assert.match(
    migrationSql,
    /create or replace function public\.delete_document_selection\([\s\S]*p_claim_token uuid/,
  );
  assert.match(
    migrationSql,
    /claim does not match deletion request[\s\S]*P0004/,
  );
  assert.match(
    migrationSql,
    /if v_claim\.status = 'completed' then[\s\S]*return jsonb_build_object/,
  );
  assert.match(migrationSql, /status = 'completed'/);
  assert.match(migrationSql, /finalized_by = p_actor_id/);
  assert.doesNotMatch(
    finalizerSql,
    /document selection not found|folder selection not found/,
  );
});

test("finalization attributes audit triggers to the verified actor", () => {
  assert.match(
    migrationSql,
    /set_config\('request\.jwt\.claim\.sub', p_actor_id::text, true\)/,
  );
  assert.match(
    migrationSql,
    /set_config\(\s*'app\.document_deletion_claim_token',\s*p_claim_token::text,\s*true\s*\)/,
  );
});

test("all claim APIs remain service-role only", () => {
  assert.match(
    migrationSql,
    /grant execute on function public\.plan_document_selection_deletion[\s\S]*to service_role/,
  );
  assert.match(
    migrationSql,
    /grant execute on function public\.delete_document_selection[\s\S]*to service_role/,
  );
  assert.doesNotMatch(
    migrationSql,
    /grant execute on function public\.(plan_document_selection_deletion|delete_document_selection)[\s\S]*to authenticated/,
  );
});
