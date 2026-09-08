import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(
  new URL("../../src/app/api/documents/delete/route.ts", import.meta.url),
  "utf8",
);

test("permission service errors are operational failures, not denials", () => {
  assert.match(
    routeSource,
    /if \(canEditError\) \{[\s\S]*permission check failed[\s\S]*jsonResponse\(\{ error: "Server error" \}, 500\)/,
  );
  assert.match(
    routeSource,
    /if \(!canEdit\) \{[\s\S]*jsonResponse\(\{ error: "Forbidden" \}, 403\)/,
  );
});

test("the verified actor initiates the claim and finalizes by claim token", () => {
  assert.match(
    routeSource,
    /"plan_document_selection_deletion"[\s\S]*p_actor_id: user\.id/,
  );
  assert.match(
    routeSource,
    /"delete_document_selection"[\s\S]*p_claim_token: plan\.claimToken[\s\S]*p_actor_id: user\.id/,
  );

  const finalizeCall = routeSource.match(
    /service\.rpc\(\s*"delete_document_selection",[\s\S]*?\n\s*\);/,
  )?.[0];
  assert.ok(finalizeCall);
  assert.doesNotMatch(finalizeCall, /p_document_ids|p_folder_ids/);
});

test("claim conflicts and mismatches map to conflict responses", () => {
  assert.match(routeSource, /planError\.code === "P0003"/);
  assert.match(routeSource, /deleteError\.code === "P0004"/);
  assert.match(routeSource, /Deletion already in progress/);
});

test("outstanding artifact cleanup maps to a precise retryable response", () => {
  assert.match(routeSource, /deleteError\.code === "P0007"/);
  assert.match(routeSource, /ARTIFACT_CLEANUP_PENDING/);
  assert.match(routeSource, /retryable: true/);
  assert.match(routeSource, /Artifact cleanup still in progress/);
});

test("deletion retries reconcile only cleanup-ready attached candidates", () => {
  assert.match(routeSource, /document_artifact_candidates/);
  assert.match(routeSource, /deletion_claim_token/);
  assert.match(routeSource, /\.eq\("phase", "cleanup_required"\)/);
  assert.match(routeSource, /cleanupDocumentArtifactCandidate/);
  assert.match(routeSource, /acknowledge_document_artifact_cleanup/);

  const reconciliation = routeSource.match(
    /document_artifact_candidates[\s\S]*?delete_document_selection/,
  )?.[0];
  assert.ok(reconciliation);
  assert.doesNotMatch(reconciliation, /\.eq\("phase", "uploading"\)/);
});
