import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(
  new URL("../../src/app/api/public/links/nda/sign/route.ts", import.meta.url),
  "utf8",
);

test("document NDA signing supplies a durable candidate before upload", () => {
  assert.match(routeSource, /randomUUID\(\)/);
  assert.match(routeSource, /candidateToken/);
  assert.match(routeSource, /candidatePath/);
  assert.match(routeSource, /register_document_artifact_candidate/);
  assert.match(routeSource, /begin_document_artifact_upload/);
  assert.match(routeSource, /finish_document_artifact_upload/);
});

test("document NDA publication and cleanup use service-only candidate RPCs", () => {
  assert.match(routeSource, /publish_document_nda_candidate/);
  assert.match(routeSource, /mark_document_artifact_cleanup_failed/);
  assert.match(routeSource, /acknowledge_document_artifact_cleanup/);
  assert.match(routeSource, /deleteObject/);
  assert.match(routeSource, /publishNdaCandidate/);
  assert.match(routeSource, /documentId: documentId \?\? null/);
});

test("NDA deletion and cleanup failures return precise non-success statuses", () => {
  assert.match(routeSource, /DELETION_IN_PROGRESS/);
  assert.match(routeSource, /CLEANUP_FAILED/);
  assert.match(routeSource, /UPLOAD_IN_PROGRESS"[\s\S]*\? 409/);
  assert.match(routeSource, /CLEANUP_FAILED"[\s\S]*\? 502/);
});

test("pending-signature refresh cannot clear a concurrently published PDF", () => {
  const updateExisting = routeSource.match(
    /updateExisting: async[\s\S]*?insertNew: async/,
  )?.[0];
  assert.ok(updateExisting);
  assert.doesNotMatch(updateExisting, /signed_pdf_path:\s*null/);
  assert.match(updateExisting, /\.is\("signed_pdf_path", null\)/);
  assert.match(routeSource, /alreadyPublished/);
});

test("each document NDA candidate owns a UUID-scoped storage path", () => {
  const pathBuilder = routeSource.match(
    /const buildNdaPdfPath[\s\S]*?^};/m,
  )?.[0];
  assert.ok(pathBuilder);
  assert.match(pathBuilder, /candidateToken/);
  assert.doesNotMatch(pathBuilder, /Date\.now/);
  assert.match(
    routeSource,
    /candidateToken[\s\S]*buildNdaPdfPath\([\s\S]*candidateToken/,
  );
});
