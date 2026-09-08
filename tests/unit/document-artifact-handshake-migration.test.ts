import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260711132555_document_artifact_handshake.sql",
  import.meta.url,
);
const ownershipMigrationUrl = new URL(
  "../../supabase/migrations/20260711135821_document_artifact_candidate_path_ownership.sql",
  import.meta.url,
);

const readMigration = (): string => {
  assert.equal(
    existsSync(migrationUrl),
    true,
    "forward artifact-handshake migration must exist",
  );
  return readFileSync(migrationUrl, "utf8");
};

test("adds a private durable external-artifact candidate state machine", () => {
  const sql = readMigration();
  assert.match(sql, /create table public\.document_artifact_candidates/);
  for (const phase of [
    "registered",
    "uploading",
    "published",
    "cleanup_required",
    "cleaned",
    "cancelled",
  ]) {
    assert.match(sql, new RegExp(`'${phase}'`));
  }
  assert.match(sql, /logical_bucket text not null/);
  assert.match(sql, /storage_path text not null/);
  assert.match(sql, /deletion_claim_token uuid null/);
  assert.match(
    sql,
    /create index document_artifact_candidates_outstanding_claim_idx[\s\S]*where phase in \('uploading', 'cleanup_required'\)/,
  );
  assert.match(
    sql,
    /alter table public\.document_artifact_candidates enable row level security/,
  );
});

test("registers and begins candidates under the document resource fence", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /create or replace function public\.register_document_artifact_candidate/,
  );
  assert.match(
    sql,
    /create or replace function public\.begin_document_artifact_upload/,
  );
  assert.match(
    sql,
    /register_document_artifact_candidate[\s\S]*lock_document_deletion_resources/,
  );
  assert.match(
    sql,
    /begin_document_artifact_upload[\s\S]*lock_document_deletion_resources/,
  );
  assert.match(
    sql,
    /v_phase := case[\s\S]*when v_deletion_claim_token is null then 'registered'[\s\S]*else 'cancelled'/,
  );
  assert.match(
    sql,
    /begin_document_artifact_upload[\s\S]*v_candidate\.phase = 'registered'[\s\S]*phase = 'uploading'/,
  );
});

test("only the producer records PUT completion", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /create or replace function public\.finish_document_artifact_upload/,
  );
  assert.match(
    sql,
    /finish_document_artifact_upload[\s\S]*v_candidate\.phase = 'uploading'[\s\S]*deletion_claim_token is not null[\s\S]*phase = 'cleanup_required'/,
  );
  assert.doesNotMatch(
    sql,
    /attach_document_artifact_candidates_to_deletion_claim[\s\S]*when candidate\.phase = 'uploading' then 'cleanup_required'/,
  );
});

test("planning cancels pre-upload work and attaches uncertain PUTs", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /create or replace function public\.attach_document_artifact_candidates_to_deletion_claim[\s\S]*update public\.document_artifact_candidates[\s\S]*deletion_claim_token = new\.claim_token/,
  );
  assert.match(
    sql,
    /phase = case[\s\S]*when candidate\.phase = 'registered' then 'cancelled'[\s\S]*else candidate\.phase/,
  );
  assert.match(
    sql,
    /candidate\.phase in \('registered', 'uploading', 'cleanup_required'\)/,
  );
  assert.match(
    sql,
    /before insert on public\.document_deletion_claims[\s\S]*attach_document_artifact_candidates_to_deletion_claim/,
  );
});

test("publishes conversion and NDA metadata atomically with candidate state", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /create or replace function public\.publish_document_conversion_candidate[\s\S]*update public\.documents[\s\S]*converted_storage_path = v_candidate\.storage_path[\s\S]*update public\.document_artifact_candidates[\s\S]*phase = 'published'/,
  );
  assert.match(
    sql,
    /create or replace function public\.publish_document_nda_candidate[\s\S]*update public\.nda_signatures[\s\S]*signed_pdf_path = v_candidate\.storage_path[\s\S]*update public\.document_artifact_candidates[\s\S]*phase = 'published'/,
  );
});

test("finalization refuses outstanding candidates until exact cleanup is acknowledged", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /create or replace function public\.acknowledge_document_artifact_cleanup/,
  );
  assert.match(
    sql,
    /acknowledge_document_artifact_cleanup[\s\S]*phase not in \('cleanup_required', 'cleaned'\)[\s\S]*P0008/,
  );
  assert.match(
    sql,
    /delete_document_selection[\s\S]*deletion_claim_token = p_claim_token[\s\S]*phase in \('uploading', 'cleanup_required'\)[\s\S]*P0007/,
  );
});

test("uses trusted auth rows for visible audit attribution", () => {
  const sql = readMigration();
  assert.match(
    sql,
    /delete_document_selection[\s\S]*from auth\.users actor[\s\S]*left join public\.profiles profile/,
  );
  assert.match(sql, /set_config\('request\.jwt\.claim\.sub'/);
  assert.match(sql, /set_config\([\s\S]*'request\.jwt\.claims'/);
  assert.match(sql, /'email', v_actor_email/);
  assert.match(sql, /'full_name', v_actor_name/);
});

test("keeps every candidate API service-role only", () => {
  const sql = readMigration();
  const functions = [
    "register_document_artifact_candidate",
    "begin_document_artifact_upload",
    "finish_document_artifact_upload",
    "get_document_artifact_candidate",
    "mark_document_artifact_cleanup_failed",
    "acknowledge_document_artifact_cleanup",
    "publish_document_conversion_candidate",
    "publish_document_nda_candidate",
  ];
  for (const functionName of functions) {
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.${functionName}[\\s\\S]*from public, anon, authenticated`,
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `grant execute on function public\\.${functionName}[\\s\\S]*to service_role`,
      ),
    );
  }
  assert.doesNotMatch(
    sql,
    /grant (select|insert|update|delete|all)[\s\S]*document_artifact_candidates[\s\S]*to (anon|authenticated)/,
  );
});

test("gives every external candidate path unique database ownership", () => {
  assert.equal(
    existsSync(ownershipMigrationUrl),
    true,
    "forward candidate-path ownership migration must exist",
  );
  const sql = readFileSync(ownershipMigrationUrl, "utf8");
  assert.match(
    sql,
    /create unique index[\s\S]*document_artifact_candidates[\s\S]*logical_bucket[\s\S]*storage_path/,
  );
});
