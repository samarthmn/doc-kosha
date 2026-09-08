import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClaimScopedPdfPath,
  buildConversionAttemptsPrefix,
  confirmProcessingClaim,
  conversionAttemptsPrefixOfPath,
  createDocumentProcessingScheduler,
  decideUploadedOutputDisposition,
  isProcessingClaimStale,
  processingAttemptOwnsClaim,
} from "@/server/documentProcessingCoordination";
import {
  createEngineFailure,
  type EngineErrorCode,
} from "@/server/engineErrors";

test("running typed failures invoke the universal failure hook", async () => {
  const observed: Array<{ documentId: string; code: EngineErrorCode }> = [];
  const scheduler = createDocumentProcessingScheduler(
    async (scheduledJob) => {
      const code =
        scheduledJob.documentId === "deadline"
          ? "deadline_exceeded"
          : "unsupported_feature";
      throw createEngineFailure({
        code,
        message: "Typed runner failure.",
        operation: "conversion",
      });
    },
    1,
    {
      onTaskFailure: async (scheduledJob, failure) => {
        observed.push({
          documentId: scheduledJob.documentId,
          code: failure.code,
        });
      },
    },
  );

  for (const documentId of ["deadline", "unsupported"] as const) {
    await assert.rejects(
      scheduler.schedule({ workspaceId: "workspace", documentId }),
      (error: unknown) => {
        assert.equal(typeof error, "object");
        assert.ok(error);
        assert.equal(
          Reflect.get(error, "code"),
          documentId === "deadline"
            ? "deadline_exceeded"
            : "unsupported_feature",
        );
        return true;
      },
    );
  }

  assert.deepEqual(observed, [
    { documentId: "deadline", code: "deadline_exceeded" },
    { documentId: "unsupported", code: "unsupported_feature" },
  ]);
});

test("scheduler saturation rejects with queue_busy and records the typed failure", async () => {
  let releaseRunning!: () => void;
  const running = new Promise<void>((resolve) => {
    releaseRunning = resolve;
  });
  const failures: string[] = [];
  const scheduler = createDocumentProcessingScheduler(
    async (scheduledJob) => {
      if (scheduledJob.documentId === "running") await running;
    },
    1,
    {
      maxPendingTasks: 1,
      onTaskFailure: async (_job, failure) => {
        failures.push(failure.code);
      },
    },
  );

  const first = scheduler.schedule({
    workspaceId: "workspace",
    documentId: "running",
  });
  const queued = scheduler.schedule({
    workspaceId: "workspace",
    documentId: "queued",
  });
  const saturatedAdmission = scheduler.admit({
    workspaceId: "workspace",
    documentId: "saturated",
  });
  assert.equal(saturatedAdmission.accepted, false);

  await assert.rejects(saturatedAdmission.completion, (error: unknown) => {
    assert.equal(typeof error, "object");
    assert.ok(error);
    assert.equal(Reflect.get(error, "code"), "queue_busy");
    assert.equal(Reflect.get(error, "operation"), "conversion");
    return true;
  });
  assert.deepEqual(failures, ["queue_busy"]);

  releaseRunning();
  await Promise.all([first, queued]);
});

test("a queued task expires, is removed, and records deadline_exceeded", async () => {
  let releaseRunning!: () => void;
  const running = new Promise<void>((resolve) => {
    releaseRunning = resolve;
  });
  const calls: string[] = [];
  const failures: string[] = [];
  const scheduler = createDocumentProcessingScheduler(
    async (scheduledJob) => {
      calls.push(scheduledJob.documentId);
      if (scheduledJob.documentId === "running") await running;
    },
    1,
    {
      maxPendingTasks: 2,
      onTaskFailure: async (_job, failure) => {
        failures.push(failure.code);
      },
    },
  );

  const first = scheduler.schedule({
    workspaceId: "workspace",
    documentId: "running",
  });
  const expired = scheduler.schedule(
    { workspaceId: "workspace", documentId: "expired" },
    { deadlineAt: Date.now() + 10 },
  );

  await assert.rejects(expired, (error: unknown) => {
    assert.equal(typeof error, "object");
    assert.ok(error);
    assert.equal(Reflect.get(error, "code"), "deadline_exceeded");
    return true;
  });
  assert.deepEqual(calls, ["running"]);
  assert.deepEqual(failures, ["deadline_exceeded"]);

  releaseRunning();
  await first;
});

test("an in-flight duplicate schedules one trailing run instead of being dropped", async () => {
  let releaseFirst!: () => void;
  const firstRun = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let calls = 0;
  const scheduler = createDocumentProcessingScheduler(async () => {
    calls += 1;
    if (calls === 1) await firstRun;
  }, 1);
  const job = { workspaceId: "workspace", documentId: "document" };

  const first = scheduler.schedule(job);
  const second = scheduler.schedule(job);
  assert.equal(first, second);
  releaseFirst();
  await second;

  assert.equal(calls, 2);
});

test("a force request cannot mutate the options of an in-flight run", async () => {
  let releaseFirst!: () => void;
  const firstRun = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let markFirstStarted!: () => void;
  const firstStarted = new Promise<void>((resolve) => {
    markFirstStarted = resolve;
  });
  const observedForce: boolean[] = [];
  const scheduler = createDocumentProcessingScheduler(async (_job, options) => {
    if (observedForce.length === 0) {
      markFirstStarted();
      await firstRun;
    }
    observedForce.push(Boolean(options.force));
  }, 1);
  const job = { workspaceId: "workspace", documentId: "document" };

  const first = scheduler.schedule(job);
  await firstStarted;
  const forced = scheduler.schedule(job, { force: true });
  releaseFirst();
  await Promise.all([first, forced]);

  assert.deepEqual(observedForce, [false, true]);
});

test("duplicate forced repairs share the current leased run", async () => {
  let releaseFirst!: () => void;
  const firstRun = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let markFirstStarted!: () => void;
  const firstStarted = new Promise<void>((resolve) => {
    markFirstStarted = resolve;
  });
  let calls = 0;
  const scheduler = createDocumentProcessingScheduler(async () => {
    calls += 1;
    if (calls === 1) {
      markFirstStarted();
      await firstRun;
    }
  }, 1);
  const job = { workspaceId: "workspace", documentId: "document" };

  const first = scheduler.schedule(job, { force: true });
  await firstStarted;
  const duplicate = scheduler.schedule(job, { force: true });
  releaseFirst();
  await Promise.all([first, duplicate]);

  assert.equal(calls, 1);
});

test("only stale processing claims can be repaired by force", () => {
  const now = Date.parse("2026-07-10T12:00:00.000Z");
  const leaseMs = 210_000;

  assert.equal(
    isProcessingClaimStale("2026-07-10T11:56:30.001Z", now, leaseMs),
    false,
  );
  assert.equal(
    isProcessingClaimStale("2026-07-10T11:56:30.000Z", now, leaseMs),
    true,
  );
  assert.equal(isProcessingClaimStale("not-a-date", now, leaseMs), false);
});

test("a lost claim response is recoverable only for the exact current claim", () => {
  const base = {
    sourceStoragePath: "documents/source.docx",
    claimId: "claim-a",
  };

  assert.equal(
    processingAttemptOwnsClaim({
      ...base,
      state: {
        storagePath: base.sourceStoragePath,
        convertedStoragePath: null,
        conversionStatus: "in_progress",
        claimId: base.claimId,
      },
    }),
    true,
  );
  assert.equal(
    processingAttemptOwnsClaim({
      ...base,
      state: {
        storagePath: base.sourceStoragePath,
        convertedStoragePath: null,
        conversionStatus: "in_progress",
        claimId: "claim-b",
      },
    }),
    false,
  );
  assert.equal(
    processingAttemptOwnsClaim({
      ...base,
      state: {
        storagePath: "documents/replacement.docx",
        convertedStoragePath: null,
        conversionStatus: "in_progress",
        claimId: base.claimId,
      },
    }),
    false,
  );
});

test("claim recovery re-reads after a write commits and its response is lost", async () => {
  const sourceStoragePath = "documents/source.docx";
  const claimId = "claim-a";
  let state: Parameters<typeof processingAttemptOwnsClaim>[0]["state"] = null;
  let ambiguousError: unknown;

  const confirmed = await confirmProcessingClaim({
    sourceStoragePath,
    claimId,
    write: async () => {
      state = {
        storagePath: sourceStoragePath,
        convertedStoragePath: null,
        conversionStatus: "in_progress",
        claimId,
      };
      throw new Error("response connection reset after commit");
    },
    read: async () => state,
    onAmbiguousWrite: (error) => {
      ambiguousError = error;
    },
  });

  assert.equal(confirmed, true);
  assert.match(String(ambiguousError), /connection reset/);
});

test("each conversion claim writes to an isolated PDF object", () => {
  assert.equal(
    buildConversionAttemptsPrefix("workspace", "document"),
    "workspaces/workspace/conversion-attempts/document/",
  );
  assert.equal(
    buildClaimScopedPdfPath("workspace", "document", "claim-a"),
    "workspaces/workspace/conversion-attempts/document/claim-a.pdf",
  );
  assert.notEqual(
    buildClaimScopedPdfPath("workspace", "document", "claim-a"),
    buildClaimScopedPdfPath("workspace", "document", "claim-b"),
  );
});

test("a claim-scoped output path resolves back to its owning attempts prefix", () => {
  assert.equal(
    conversionAttemptsPrefixOfPath(
      "workspace",
      buildClaimScopedPdfPath("workspace", "document", "claim-a"),
    ),
    "workspaces/workspace/conversion-attempts/document/",
  );

  // Non-attempt, foreign-workspace, and non-leaf paths never yield a prefix,
  // so a purge can only ever target one document's attempt objects.
  assert.equal(
    conversionAttemptsPrefixOfPath("workspace", "workspaces/workspace/doc.pdf"),
    null,
  );
  assert.equal(
    conversionAttemptsPrefixOfPath(
      "other-workspace",
      buildClaimScopedPdfPath("workspace", "document", "claim-a"),
    ),
    null,
  );
  assert.equal(
    conversionAttemptsPrefixOfPath(
      "workspace",
      "workspaces/workspace/conversion-attempts/document/",
    ),
    null,
  );
  assert.equal(
    conversionAttemptsPrefixOfPath(
      "workspace",
      "workspaces/workspace/conversion-attempts/document/nested/claim.pdf",
    ),
    null,
  );
});

test("ambiguous completion cleanup never deletes an immutable blob", () => {
  const base = {
    sourceStoragePath: "documents/old.docx",
    uploadedStoragePath: "converted/old_docx.pdf",
    claimId: "claim-a",
  };

  assert.equal(
    decideUploadedOutputDisposition({
      ...base,
      state: {
        storagePath: base.sourceStoragePath,
        convertedStoragePath: base.uploadedStoragePath,
        conversionStatus: "completed",
        claimId: null,
      },
    }),
    "accept-completed",
  );
  assert.equal(
    decideUploadedOutputDisposition({
      ...base,
      state: {
        storagePath: base.sourceStoragePath,
        convertedStoragePath: null,
        conversionStatus: "in_progress",
        claimId: "claim-b",
      },
    }),
    "retain",
  );
  assert.equal(
    decideUploadedOutputDisposition({ ...base, state: "unreadable" }),
    "retain",
  );
  assert.equal(
    decideUploadedOutputDisposition({
      ...base,
      state: {
        storagePath: "documents/replacement.docx",
        convertedStoragePath: null,
        conversionStatus: "pending",
        claimId: null,
      },
    }),
    "retain",
  );
});
