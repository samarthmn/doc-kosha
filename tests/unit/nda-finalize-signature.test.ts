import assert from "node:assert/strict";
import test from "node:test";

import { finalizeNdaSignature } from "@/modules/nda/server/finalizeSignature";

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

type CandidatePhase =
  | "registered"
  | "uploading"
  | "published"
  | "cleanup_required"
  | "cleaned"
  | "cancelled";

type CandidateState = {
  candidateToken: string;
  producerToken: string;
  workspaceId: string;
  documentId: string;
  artifactKind: "nda";
  logicalBucket: "documents";
  path: string;
  sourceStoragePath: null;
  ndaSignatureId: string;
  phase: CandidatePhase;
  deletionClaimToken: string | null;
  cleanupError: string | null;
};

type HarnessOptions = {
  deletionTiming?: "before-begin" | "after-begin";
  cleanupFails?: boolean;
  initialCleanupRequired?: boolean;
  publicationRejected?: boolean;
  uploadThrows?: boolean;
};

const payload = {
  signatureId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  documentId: "33333333-3333-4333-8333-333333333333",
  resourceId: "33333333-3333-4333-8333-333333333333",
  resourceTitle: "Proposal.pdf",
  contextLabel: "document" as const,
  workspaceName: "Acme",
  fullName: "Viewer",
  email: "viewer@example.com",
  signatureDataUrl: ONE_PIXEL_PNG,
  templateHtml: "<p>Keep this confidential.</p>",
  signedAt: new Date("2026-07-11T00:00:00.000Z"),
  locale: "en" as const,
  candidateToken: "44444444-4444-4444-8444-444444444444",
  candidatePath:
    "workspaces/22222222-2222-4222-8222-222222222222/ndas/candidate.pdf",
};

const createHarness = (options: HarnessOptions = {}) => {
  const events: string[] = [];
  const uploaded = new Set<string>();
  let deletionActive = false;
  let candidate: CandidateState | null = null;

  if (options.initialCleanupRequired) {
    candidate = {
      candidateToken: "66666666-6666-4666-8666-666666666666",
      producerToken: "66666666-6666-4666-8666-666666666666",
      workspaceId: payload.workspaceId,
      documentId: payload.documentId,
      artifactKind: "nda",
      logicalBucket: "documents",
      path: `${payload.candidatePath}.previous`,
      sourceStoragePath: null,
      ndaSignatureId: payload.signatureId,
      phase: "cleanup_required",
      deletionClaimToken: "55555555-5555-4555-8555-555555555555",
      cleanupError: "previous R2 delete failed",
    };
    uploaded.add(candidate.path);
  }

  const deps = {
    uploadPdf: async () => {
      events.push("upload");
      uploaded.add(payload.candidatePath);
      if (options.deletionTiming === "after-begin") {
        deletionActive = true;
        assert.ok(candidate);
        candidate.deletionClaimToken = "55555555-5555-4555-8555-555555555555";
      }
      if (options.uploadThrows) {
        throw new Error("upload response failed after PUT may have committed");
      }
      return {
        path: payload.candidatePath,
        uploadResult: { ok: true },
      };
    },
    updateSignedPdfPath: async () => {
      events.push("legacy-publish");
    },
    sendViewerEmail: async () => {
      events.push("viewer-email");
    },
    getOwnerEmails: async () => [],
    sendOwnerEmail: async () => undefined,
    listOutstandingArtifactCandidates: async (): Promise<CandidateState[]> => {
      events.push("list-cleanup");
      return candidate?.phase === "cleanup_required" ? [{ ...candidate }] : [];
    },
    registerArtifactCandidate: async (): Promise<CandidateState> => {
      events.push("register");
      candidate = {
        candidateToken: payload.candidateToken,
        producerToken: payload.candidateToken,
        workspaceId: payload.workspaceId,
        documentId: payload.documentId,
        artifactKind: "nda",
        logicalBucket: "documents",
        path: payload.candidatePath,
        sourceStoragePath: null,
        ndaSignatureId: payload.signatureId,
        phase: "registered",
        deletionClaimToken: null,
        cleanupError: null,
      };
      return { ...candidate };
    },
    beginArtifactUpload: async (): Promise<CandidateState> => {
      events.push("begin");
      assert.ok(candidate);
      if (options.deletionTiming === "before-begin") {
        deletionActive = true;
        candidate.phase = "cancelled";
        candidate.deletionClaimToken = "55555555-5555-4555-8555-555555555555";
      } else {
        candidate.phase = "uploading";
      }
      return { ...candidate };
    },
    finishArtifactUpload: async (): Promise<CandidateState> => {
      events.push("finish");
      assert.ok(candidate);
      if (candidate.deletionClaimToken) candidate.phase = "cleanup_required";
      return { ...candidate };
    },
    publishNdaCandidate: async (): Promise<CandidateState> => {
      events.push("publish");
      assert.ok(candidate);
      if (!deletionActive && !options.publicationRejected) {
        candidate.phase = "published";
      }
      return { ...candidate };
    },
    deleteArtifactCandidate: async (): Promise<
      { ok: true } | { ok: false; message: string }
    > => {
      events.push("delete");
      if (options.cleanupFails) {
        return { ok: false, message: "R2 delete failed" };
      }
      assert.ok(candidate);
      uploaded.delete(candidate.path);
      return { ok: true };
    },
    acknowledgeArtifactCleanup: async (): Promise<CandidateState> => {
      events.push("ack");
      assert.ok(candidate);
      assert.equal(candidate.phase, "cleanup_required");
      candidate.phase = "cleaned";
      candidate.cleanupError = null;
      return { ...candidate };
    },
    markArtifactCleanupFailed: async ({
      message,
    }: {
      message: string;
    }): Promise<CandidateState> => {
      events.push("cleanup-failed");
      assert.ok(candidate);
      candidate.phase = "cleanup_required";
      candidate.cleanupError = message;
      return { ...candidate };
    },
    readArtifactCandidate: async (): Promise<CandidateState | null> =>
      candidate ? { ...candidate } : null,
  };

  return {
    deps,
    events,
    uploaded,
    getCandidate: () => (candidate ? { ...candidate } : null),
  };
};

test("registers and begins a document NDA candidate before external upload", async () => {
  const harness = createHarness();

  const result = await finalizeNdaSignature(harness.deps, payload);

  assert.equal(result.ok, true);
  assert.deepEqual(harness.events.slice(0, 5), [
    "list-cleanup",
    "register",
    "begin",
    "upload",
    "finish",
  ]);
  assert.equal(harness.events[5], "publish");
  assert.equal(harness.getCandidate()?.phase, "published");
});

test("a deletion claim before NDA PUT cancels without uploading", async () => {
  const harness = createHarness({ deletionTiming: "before-begin" });

  const result = await finalizeNdaSignature(harness.deps, payload);

  assert.deepEqual(harness.events, ["list-cleanup", "register", "begin"]);
  assert.equal(harness.uploaded.size, 0);
  assert.deepEqual(result, {
    ok: false,
    error: "Document deletion in progress",
    code: "DELETION_IN_PROGRESS",
    retryable: true,
  });
});

test("a deletion claim after NDA PUT exact-deletes and acknowledges", async () => {
  const harness = createHarness({ deletionTiming: "after-begin" });

  const result = await finalizeNdaSignature(harness.deps, payload);

  assert.deepEqual(harness.events, [
    "list-cleanup",
    "register",
    "begin",
    "upload",
    "finish",
    "delete",
    "ack",
  ]);
  assert.equal(harness.uploaded.size, 0);
  assert.equal(harness.getCandidate()?.phase, "cleaned");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "DELETION_IN_PROGRESS");
});

test("failed NDA cleanup stays retryable and unacknowledged", async () => {
  const harness = createHarness({
    deletionTiming: "after-begin",
    cleanupFails: true,
  });

  const result = await finalizeNdaSignature(harness.deps, payload);

  assert.deepEqual(harness.events, [
    "list-cleanup",
    "register",
    "begin",
    "upload",
    "finish",
    "delete",
    "cleanup-failed",
  ]);
  assert.equal(harness.uploaded.size, 1);
  assert.equal(harness.getCandidate()?.phase, "cleanup_required");
  assert.deepEqual(result, {
    ok: false,
    error: "Failed to clean signed NDA PDF",
    code: "CLEANUP_FAILED",
    retryable: true,
  });
});

test("a later NDA attempt reconciles cleanup-required work before registering", async () => {
  const harness = createHarness({ initialCleanupRequired: true });

  const result = await finalizeNdaSignature(harness.deps, payload);

  assert.equal(result.ok, true);
  assert.deepEqual(harness.events.slice(0, 4), [
    "list-cleanup",
    "delete",
    "ack",
    "register",
  ]);
  assert.equal(
    harness.uploaded.has(`${payload.candidatePath}.previous`),
    false,
  );
  assert.equal(harness.getCandidate()?.phase, "published");
});

test("a rejected NDA publication exact-cleans its unreferenced candidate", async () => {
  const harness = createHarness({ publicationRejected: true });

  const result = await finalizeNdaSignature(harness.deps, payload);

  assert.deepEqual(harness.events, [
    "list-cleanup",
    "register",
    "begin",
    "upload",
    "finish",
    "publish",
    "cleanup-failed",
    "delete",
    "ack",
  ]);
  assert.equal(harness.uploaded.size, 0);
  assert.equal(harness.getCandidate()?.phase, "cleaned");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "FINALIZE_FAILED");
});

test("a settled NDA upload exception exact-cleans its readable candidate", async () => {
  const harness = createHarness({ uploadThrows: true });

  const result = await finalizeNdaSignature(harness.deps, payload);

  assert.deepEqual(harness.events, [
    "list-cleanup",
    "register",
    "begin",
    "upload",
    "cleanup-failed",
    "delete",
    "ack",
  ]);
  assert.equal(harness.uploaded.size, 0);
  assert.equal(harness.getCandidate()?.phase, "cleaned");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "FINALIZE_FAILED");
});
