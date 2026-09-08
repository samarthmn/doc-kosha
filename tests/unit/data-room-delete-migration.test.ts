import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSql = readFileSync(
  new URL(
    "../../supabase/migrations/0038_data_room_delete_and_create_permissions.sql",
    import.meta.url,
  ),
  "utf8",
);

test("data-room delete RPC cleans current and archived version blobs", () => {
  assert.match(
    migrationSql,
    /create or replace function public\.delete_data_room_cascade/,
  );
  assert.match(migrationSql, /from public\.document_versions dv/);
  assert.match(migrationSql, /dv\.storage_path/);
  assert.match(migrationSql, /dv\.converted_storage_path/);
  assert.match(migrationSql, /'data-room'::text/);
  assert.match(migrationSql, /'converted-data-room'::text/);
});

test("data-room delete RPC relies on one transactional room delete", () => {
  assert.match(
    migrationSql,
    /deleted_room as \([\s\S]*delete from public\.data_rooms/,
  );
  assert.doesNotMatch(migrationSql, /delete from public\.documents/);
  assert.doesNotMatch(migrationSql, /delete from public\.folders/);
  assert.doesNotMatch(migrationSql, /delete from public\.links/);
});

test("data-room insert policy uses per-surface editor access", () => {
  assert.match(
    migrationSql,
    /create or replace function public\.can_create_data_room/,
  );
  assert.match(
    migrationSql,
    /wm\.data_rooms_access_all = 'editor'::public\.access_level/,
  );
  assert.match(
    migrationSql,
    /create policy data_rooms_insert_editor[\s\S]+public\.can_create_data_room\(workspace_id\)/,
  );
});
