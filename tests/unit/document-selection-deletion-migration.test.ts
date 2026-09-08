import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSql = readFileSync(
  new URL(
    "../../supabase/migrations/20260711090000_document_selection_deletion.sql",
    import.meta.url,
  ),
  "utf8",
);

test("plans recursive document deletion with every stored artifact", () => {
  assert.match(
    migrationSql,
    /create or replace function public\.plan_document_selection_deletion/,
  );
  assert.match(migrationSql, /with recursive/);
  assert.match(migrationSql, /from public\.document_versions/);
  assert.match(migrationSql, /from public\.nda_signatures/);
  assert.match(migrationSql, /signed_pdf_path/);
  assert.match(migrationSql, /converted-documents/);
  assert.match(migrationSql, /converted-data-room/);
  assert.match(migrationSql, /conversion-attempts/);
});

test("finalizes database deletion transactionally and service-role only", () => {
  assert.match(
    migrationSql,
    /create or replace function public\.delete_document_selection/,
  );
  assert.match(
    migrationSql,
    /delete from public\.documents[\s\S]*returning id/,
  );
  assert.match(migrationSql, /delete from public\.folders[\s\S]*returning id/);
  assert.match(
    migrationSql,
    /grant execute on function public\.delete_document_selection[\s\S]*to service_role/,
  );
  assert.doesNotMatch(
    migrationSql,
    /grant execute on function public\.delete_document_selection[\s\S]*to authenticated/,
  );
});

test("keeps both deletion RPCs service-role only and scope exact", () => {
  assert.match(migrationSql, /is not distinct from p_data_room_id/);
  assert.match(
    migrationSql,
    /revoke all on function public\.plan_document_selection_deletion[\s\S]*from public/,
  );
  assert.match(
    migrationSql,
    /grant execute on function public\.plan_document_selection_deletion[\s\S]*to service_role/,
  );
  assert.doesNotMatch(
    migrationSql,
    /grant execute on function public\.plan_document_selection_deletion[\s\S]*to authenticated/,
  );
});

test("defaults nullable scope arguments for generated RPC types", () => {
  assert.equal(
    [...migrationSql.matchAll(/p_data_room_id uuid default null/g)].length,
    2,
  );
});
