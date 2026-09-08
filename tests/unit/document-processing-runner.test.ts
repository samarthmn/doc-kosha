import assert from "node:assert/strict";
import test from "node:test";

import {
  DOCUMENT_CONVERSION_MAX_INPUT_BYTES,
  PDF_PROCESSING_MAX_INPUT_BYTES,
} from "@/lib/constants";
import { createDocumentProcessingScheduler } from "@/server/documentProcessingCoordination";
import {
  createEngineFailure,
  engineErrorHttpStatus,
  type EngineFailure,
  toFailureResult,
  type EngineErrorCode,
} from "@/server/engineErrors";
import {
  createDocumentProcessingRunner,
  type DocumentProcessingDependencies,
  type DocumentProcessingDocument,
} from "@/server/documentProcessingRunner";

const job = { documentId: "document-1", workspaceId: "workspace-1" };

type HarnessOptions = {
  pauseConversion?: () => Promise<void>;
  loseClaimResponse?: boolean;
  loseCompletionResponse?: boolean;
  rejectBoundedDownload?: boolean;
  freePlan?: boolean;
  initialConversionStatus?: string;
  deletionTiming?: "before-begin" | "after-begin";
  cleanupFails?: boolean;
  initialCleanupRequired?: boolean;
  documentMissing?: boolean;
  uploadThrows?: boolean;
  conversionFailureCode?: EngineErrorCode;
  publicationFailureCode?: EngineErrorCode;
  advanceClockAfterDownloadMs?: number;
  advanceClockAfterCleanupListMs?: number;
  advanceClockAfterReadDocumentMs?: number;
  advanceClockDuringClaimVerificationMs?: number;
  initialCleanupDeletionOwned?: boolean;
  readDocumentError?: Error | EngineFailure;
  writeTelemetryRejects?: boolean;
  fileType?: string;
  pageCountFailureCode?: EngineErrorCode;
};

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
  artifactKind: "conversion";
  logicalBucket: "converted-documents" | "converted-data-room";
  path: string;
  sourceStoragePath: string;
  ndaSignatureId: null;
  phase: CandidatePhase;
  deletionClaimToken: string | null;
  cleanupError: string | null;
};

const createHarness = (options: HarnessOptions = {}) => {
  let current: DocumentProcessingDocument = {
    id: job.documentId,
    workspaceId: job.workspaceId,
    storagePath: `workspaces/workspace-1/source.${options.fileType ?? "docx"}`,
    convertedStoragePath: "workspaces/workspace-1/previous.pdf",
    conversionStatus: options.initialConversionStatus ?? "pending",
    fileType: options.fileType ?? "docx",
    dataRoomId: null,
    claimId: null,
    updatedAt: "2026-07-10T00:00:00.000Z",
  };
  const uploadedObjects = new Map<string, Buffer>();
  const source = Buffer.from("source document");
  let clock = Date.parse("2026-07-10T00:00:00.000Z");
  let failureAttempts = 0;
  let failuresApplied = 0;
  let conversionCalls = 0;
  let observedDownloadLimit: number | null = null;
  let deletionActive = false;
  let candidate: CandidateState | null = null;
  const candidateEvents: string[] = [];
  const loggedErrors: unknown[] = [];
  let persistedFailureCode: EngineErrorCode | null = null;
  let publishedPageCount: number | undefined;
  let completedPageCount: number | null | undefined;
  let conversionFailureCode = options.conversionFailureCode ?? null;

  if (options.initialCleanupRequired) {
    const path =
      "workspaces/workspace-1/conversion-attempts/document-1/claim-old.pdf";
    candidate = {
      candidateToken: "candidate-old",
      producerToken: "claim-old",
      workspaceId: job.workspaceId,
      documentId: job.documentId,
      artifactKind: "conversion",
      logicalBucket: "converted-documents",
      path,
      sourceStoragePath: "workspaces/workspace-1/source.docx",
      ndaSignatureId: null,
      phase: "cleanup_required",
      deletionClaimToken:
        options.initialCleanupDeletionOwned === false ? null : "deletion-claim",
      cleanupError: "previous R2 delete failed",
    };
    uploadedObjects.set(path, Buffer.from("%PDF-1.7"));
  }

  const matchesOriginalAttempt = (
    document: DocumentProcessingDocument,
    claimId: string,
  ): boolean =>
    current.id === document.id &&
    current.workspaceId === document.workspaceId &&
    current.storagePath === document.storagePath &&
    current.conversionStatus === "in_progress" &&
    current.claimId === claimId;

  const dependencies = {
    readDocument: async (requestedJob) => {
      clock += options.advanceClockAfterReadDocumentMs ?? 0;
      if (options.readDocumentError) throw options.readDocumentError;
      return !options.documentMissing &&
        requestedJob.documentId === current.id &&
        requestedJob.workspaceId === current.workspaceId
        ? { ...current }
        : null;
    },
    claimDocument: async ({ document, claimId, updatedAt }) => {
      const claimMatches =
        current.id === document.id &&
        current.workspaceId === document.workspaceId &&
        current.storagePath === document.storagePath &&
        current.conversionStatus === document.conversionStatus &&
        current.claimId === document.claimId &&
        current.updatedAt === document.updatedAt;
      if (!claimMatches) return false;

      current = {
        ...current,
        conversionStatus: "in_progress",
        claimId,
        updatedAt,
      };
      if (options.loseClaimResponse) {
        throw new Error("claim response lost after commit");
      }
      return true;
    },
    readAttemptState: async () => {
      clock += options.advanceClockDuringClaimVerificationMs ?? 0;
      return {
        storagePath: current.storagePath,
        convertedStoragePath: current.convertedStoragePath,
        conversionStatus: current.conversionStatus,
        claimId: current.claimId,
      };
    },
    markFailed: async ({ document, claimId, failureCode, updatedAt }) => {
      failureAttempts += 1;
      if (deletionActive) return false;
      if (!matchesOriginalAttempt(document, claimId)) return false;
      current = {
        ...current,
        conversionStatus: "failed",
        claimId: null,
        updatedAt,
      };
      failuresApplied += 1;
      persistedFailureCode = failureCode;
      return true;
    },
    clearFailureTelemetry: async () => {
      persistedFailureCode = null;
    },
    completeWithoutConversion: async (write) => {
      const { document, claimId, updatedAt } = write;
      const pageCount = Reflect.get(write, "pageCount");
      completedPageCount =
        typeof pageCount === "number" || pageCount === null
          ? pageCount
          : undefined;
      const failureCode = Reflect.get(write, "failureCode");
      persistedFailureCode =
        typeof failureCode === "string"
          ? (failureCode as EngineErrorCode)
          : null;
      if (!matchesOriginalAttempt(document, claimId)) return;
      current = {
        ...current,
        conversionStatus: "completed",
        claimId: null,
        updatedAt,
      };
    },
    writeTelemetry: async () => {
      if (options.writeTelemetryRejects) {
        throw new Error("telemetry column unavailable");
      }
    },
    isFreePlan: async () => options.freePlan ?? false,
    downloadSourceBounded: async ({ maxBytes }) => {
      observedDownloadLimit = maxBytes;
      if (options.rejectBoundedDownload) {
        return {
          ok: false,
          status: 409,
          message: "Object changed while it was being downloaded",
        };
      }
      clock += options.advanceClockAfterDownloadMs ?? 0;
      return { ok: true, buffer: source };
    },
    convertToPdf: async () => {
      conversionCalls += 1;
      await options.pauseConversion?.();
      if (conversionFailureCode) {
        const failure = createEngineFailure({
          code: conversionFailureCode,
          message: "Typed conversion failure.",
          operation: "conversion",
          format: "docx",
        });
        return {
          ...toFailureResult(failure),
          status: engineErrorHttpStatus(failure.code),
        };
      }
      const pdfBytes = new ArrayBuffer(8);
      new Uint8Array(pdfBytes).set(Buffer.from("%PDF-1.7"));
      return {
        ok: true,
        pdfBytes,
        pageCount: 3,
        engine: "office-core-wasm",
        conversionMs: 12,
      };
    },
    countPdfPages: async () => {
      if (options.pageCountFailureCode) {
        return toFailureResult(
          createEngineFailure({
            code: options.pageCountFailureCode,
            message: "Typed page-count failure.",
            operation: "page_count",
            format: "pdf",
          }),
        );
      }
      return { ok: true, pageCount: 3 };
    },
    uploadPdf: async ({ path, body }) => {
      uploadedObjects.set(path, Buffer.from(body));
      if (options.deletionTiming === "after-begin") {
        deletionActive = true;
        assert.ok(candidate);
        candidate.deletionClaimToken = "deletion-claim";
      }
      if (options.uploadThrows) {
        throw new Error("upload response failed after PUT may have committed");
      }
      return { ok: true };
    },
    createClaimId: () => "claim-old",
    nowIso: () => new Date(++clock).toISOString(),
    nowMs: () => clock,
    logger: {
      error: (_message, context) => {
        loggedErrors.push(context);
      },
      warn: () => undefined,
    },
    listCleanupRequiredArtifactCandidates: async () => {
      candidateEvents.push("list-cleanup");
      clock += options.advanceClockAfterCleanupListMs ?? 0;
      return candidate?.phase === "cleanup_required" ? [{ ...candidate }] : [];
    },
    registerArtifactCandidate: async ({
      candidateToken,
      producerToken,
      document,
      logicalBucket,
      path,
    }) => {
      candidateEvents.push("register");
      candidate = {
        candidateToken,
        producerToken,
        workspaceId: document.workspaceId,
        documentId: document.id,
        artifactKind: "conversion",
        logicalBucket,
        path,
        sourceStoragePath: document.storagePath,
        ndaSignatureId: null,
        phase: "registered",
        deletionClaimToken: null,
        cleanupError: null,
      };
      return { ...candidate };
    },
    beginArtifactUpload: async () => {
      candidateEvents.push("begin");
      assert.ok(candidate);
      if (options.deletionTiming === "before-begin") {
        deletionActive = true;
        candidate.phase = "cancelled";
        candidate.deletionClaimToken = "deletion-claim";
      } else {
        candidate.phase = "uploading";
      }
      return { ...candidate };
    },
    finishArtifactUpload: async () => {
      candidateEvents.push("finish");
      assert.ok(candidate);
      assert.equal(
        uploadedObjects.has(candidate.path),
        true,
        JSON.stringify({
          candidatePath: candidate.path,
          uploadedPaths: [...uploadedObjects.keys()],
        }),
      );
      if (candidate.deletionClaimToken) {
        candidate.phase = "cleanup_required";
      }
      return { ...candidate };
    },
    readArtifactCandidate: async () => (candidate ? { ...candidate } : null),
    publishDocumentCandidate: async (write) => {
      const { candidateToken, document, claimId, updatedAt } = write;
      const pageCount = Reflect.get(write, "pageCount");
      publishedPageCount =
        typeof pageCount === "number" ? pageCount : undefined;
      candidateEvents.push("publish");
      assert.ok(candidate);
      assert.equal(candidate.candidateToken, candidateToken);
      if (options.publicationFailureCode) {
        throw createEngineFailure({
          code: options.publicationFailureCode,
          message: "Typed publication failure.",
          operation: "conversion",
          format: "docx",
        });
      }
      if (candidate.deletionClaimToken) return { ...candidate };
      if (!matchesOriginalAttempt(document, claimId)) return { ...candidate };
      current = {
        ...current,
        convertedStoragePath: candidate.path,
        conversionStatus: "completed",
        claimId: null,
        updatedAt,
      };
      candidate.phase = "published";
      if (options.loseCompletionResponse) {
        throw new Error("completion response lost after commit");
      }
      return { ...candidate };
    },
    deleteArtifactCandidate: async ({ path }) => {
      candidateEvents.push("delete");
      assert.equal(uploadedObjects.has(path), true);
      if (options.cleanupFails) {
        return { ok: false, message: "R2 delete failed" };
      }
      uploadedObjects.delete(path);
      return { ok: true };
    },
    acknowledgeArtifactCleanup: async () => {
      candidateEvents.push("ack");
      assert.ok(candidate);
      assert.equal(candidate.phase, "cleanup_required");
      candidate.phase = "cleaned";
      candidate.cleanupError = null;
      return { ...candidate };
    },
    markArtifactCleanupFailed: async ({ message }) => {
      candidateEvents.push("cleanup-failed");
      assert.ok(candidate);
      candidate.phase = "cleanup_required";
      candidate.cleanupError = message;
      return { ...candidate };
    },
    createCandidateToken: () => "candidate-old",
  } satisfies DocumentProcessingDependencies;

  return {
    dependencies,
    getCurrent: () => ({ ...current }),
    getFailureAttempts: () => failureAttempts,
    getFailuresApplied: () => failuresApplied,
    getConversionCalls: () => conversionCalls,
    getObservedDownloadLimit: () => observedDownloadLimit,
    getCandidate: () => (candidate ? { ...candidate } : null),
    getCandidateEvents: () => [...candidateEvents],
    getLoggedErrors: () => [...loggedErrors],
    getPersistedFailureCode: () => persistedFailureCode,
    getPublishedPageCount: () => publishedPageCount,
    getCompletedPageCount: () => completedPageCount,
    setConversionFailureCode: (code: EngineErrorCode | null) => {
      conversionFailureCode = code;
    },
    persistUnclaimedFailure: (code: EngineErrorCode) => {
      if (current.claimId !== null) return;
      if (!["pending", "failed"].includes(current.conversionStatus)) return;
      current = {
        ...current,
        conversionStatus: "failed",
        updatedAt: new Date(++clock).toISOString(),
      };
      persistedFailureCode = code;
    },
    uploadedObjects,
    replaceGeneration: () => {
      current = {
        ...current,
        storagePath: "workspaces/workspace-1/replacement.docx",
        convertedStoragePath: "workspaces/workspace-1/replacement.pdf",
        conversionStatus: "completed",
        claimId: null,
        updatedAt: "2026-07-10T00:01:00.000Z",
      };
    },
  };
};

const runAdmittedHarness = async (
  harness: ReturnType<typeof createHarness>,
  deadlineAt = Date.parse("2026-07-10T00:02:00.000Z"),
): Promise<void> => {
  const runner = createDocumentProcessingRunner(harness.dependencies);
  const scheduler = createDocumentProcessingScheduler(
    (scheduledJob) => runner(scheduledJob, { deadlineAt }),
    1,
    {
      onTaskFailure: async (_scheduledJob, failure) => {
        harness.persistUnclaimedFailure(failure.code);
      },
    },
  );
  await scheduler.schedule(job);
};

test("non-deadline read failures become typed terminal failures", async () => {
  const harness = createHarness({
    readDocumentError: new Error("database connection reset"),
  });

  await assert.rejects(runAdmittedHarness(harness), (error: unknown) => {
    assert.equal(typeof error, "object");
    assert.ok(error);
    assert.equal(Reflect.get(error, "code"), "internal_error");
    return true;
  });
  assert.equal(harness.getCurrent().conversionStatus, "failed");
  assert.equal(harness.getPersistedFailureCode(), "internal_error");
});

test("typed pre-claim runner failures retain their stable code", async () => {
  const failure = createEngineFailure({
    code: "unsupported_feature",
    message: "Unsupported document feature.",
    operation: "conversion",
  });
  const harness = createHarness({ readDocumentError: failure });

  await assert.rejects(runAdmittedHarness(harness), (error: unknown) => {
    assert.equal(typeof error, "object");
    assert.ok(error);
    assert.equal(Reflect.get(error, "code"), "unsupported_feature");
    return true;
  });
  assert.equal(harness.getCurrent().conversionStatus, "failed");
  assert.equal(harness.getPersistedFailureCode(), "unsupported_feature");
});

test("failed cleanup without a deletion owner cannot strand pending work", async () => {
  const harness = createHarness({
    initialCleanupRequired: true,
    initialCleanupDeletionOwned: false,
    cleanupFails: true,
  });

  await assert.rejects(runAdmittedHarness(harness), (error: unknown) => {
    assert.equal(typeof error, "object");
    assert.ok(error);
    assert.equal(Reflect.get(error, "code"), "internal_error");
    return true;
  });
  assert.equal(harness.getCurrent().conversionStatus, "failed");
  assert.equal(harness.getPersistedFailureCode(), "internal_error");
});

test("deadline during cleanup reconciliation persists deadline_exceeded", async () => {
  const harness = createHarness({ advanceClockAfterCleanupListMs: 12_000 });

  await assert.rejects(
    runAdmittedHarness(harness, Date.parse("2026-07-10T00:00:11.000Z")),
    (error: unknown) => {
      assert.equal(typeof error, "object");
      assert.ok(error);
      assert.equal(Reflect.get(error, "code"), "deadline_exceeded");
      return true;
    },
  );
  assert.equal(harness.getCurrent().conversionStatus, "failed");
  assert.equal(harness.getPersistedFailureCode(), "deadline_exceeded");
});

test("deadline during document read persists deadline_exceeded", async () => {
  const harness = createHarness({ advanceClockAfterReadDocumentMs: 12_000 });

  await assert.rejects(
    runAdmittedHarness(harness, Date.parse("2026-07-10T00:00:11.000Z")),
    (error: unknown) => {
      assert.equal(typeof error, "object");
      assert.ok(error);
      assert.equal(Reflect.get(error, "code"), "deadline_exceeded");
      return true;
    },
  );
  assert.equal(harness.getCurrent().conversionStatus, "failed");
  assert.equal(harness.getPersistedFailureCode(), "deadline_exceeded");
});

test("deadline during ambiguous claim verification fails the owned claim", async () => {
  const harness = createHarness({
    loseClaimResponse: true,
    advanceClockDuringClaimVerificationMs: 12_000,
  });

  await runAdmittedHarness(harness, Date.parse("2026-07-10T00:00:11.000Z"));
  assert.equal(harness.getCurrent().conversionStatus, "failed");
  assert.equal(harness.getPersistedFailureCode(), "deadline_exceeded");
});

test("failure reason remains atomic when best-effort telemetry rejects", async () => {
  const harness = createHarness({
    publicationFailureCode: "unsupported_feature",
    writeTelemetryRejects: true,
  });
  const runner = createDocumentProcessingRunner(harness.dependencies);

  await runner(job, {});

  assert.equal(harness.getCurrent().conversionStatus, "failed");
  assert.equal(harness.getPersistedFailureCode(), "unsupported_feature");
});

test("cleanup and re-enqueue preserve a typed failure until a new attempt replaces it", async () => {
  const harness = createHarness({
    conversionFailureCode: "unsupported_feature",
  });
  const runner = createDocumentProcessingRunner(harness.dependencies);

  await runner(job, { deadlineAt: Date.parse("2026-07-10T00:02:00.000Z") });
  assert.equal(harness.getCurrent().conversionStatus, "failed");
  assert.equal(harness.getPersistedFailureCode(), "unsupported_feature");

  await assert.rejects(
    runner(job, { deadlineAt: Date.parse("2026-07-09T23:59:00.000Z") }),
    (error: unknown) => {
      assert.equal(typeof error, "object");
      assert.ok(error);
      assert.equal(Reflect.get(error, "code"), "deadline_exceeded");
      return true;
    },
  );
  assert.equal(harness.getPersistedFailureCode(), "unsupported_feature");

  harness.setConversionFailureCode(null);
  await runner(job, { deadlineAt: Date.parse("2026-07-10T00:03:00.000Z") });
  assert.equal(harness.getCurrent().conversionStatus, "completed");
  assert.equal(harness.getPersistedFailureCode(), null);
});

test("deadline exhaustion after source IO persists a deterministic typed failure", async () => {
  const harness = createHarness({ advanceClockAfterDownloadMs: 12_000 });
  const runner = createDocumentProcessingRunner(harness.dependencies);

  await runner(job, { deadlineAt: Date.parse("2026-07-10T00:00:11.000Z") });

  assert.equal(harness.getCurrent().conversionStatus, "failed");
  assert.equal(harness.getPersistedFailureCode(), "deadline_exceeded");
  assert.equal(harness.getConversionCalls(), 0);
});

test("an old paused claim exact-cleans its unpublishable immutable candidate", async () => {
  let signalConversionStarted!: () => void;
  const conversionStarted = new Promise<void>((resolve) => {
    signalConversionStarted = resolve;
  });
  let resumeConversion!: () => void;
  const conversionPaused = new Promise<void>((resolve) => {
    resumeConversion = resolve;
  });
  const harness = createHarness({
    pauseConversion: async () => {
      signalConversionStarted();
      await conversionPaused;
    },
  });
  const runner = createDocumentProcessingRunner(harness.dependencies);

  const running = runner(job, {});
  await conversionStarted;
  harness.replaceGeneration();
  resumeConversion();
  await running;

  assert.deepEqual(harness.getCurrent(), {
    id: job.documentId,
    workspaceId: job.workspaceId,
    storagePath: "workspaces/workspace-1/replacement.docx",
    convertedStoragePath: "workspaces/workspace-1/replacement.pdf",
    conversionStatus: "completed",
    fileType: "docx",
    dataRoomId: null,
    claimId: null,
    updatedAt: "2026-07-10T00:01:00.000Z",
  });
  assert.equal(harness.getFailureAttempts(), 1);
  assert.equal(harness.getFailuresApplied(), 0);
  assert.deepEqual([...harness.uploadedObjects.keys()], []);
  assert.equal(harness.getCandidate()?.phase, "cleaned");
  assert.deepEqual(harness.getCandidateEvents(), [
    "list-cleanup",
    "register",
    "begin",
    "finish",
    "publish",
    "cleanup-failed",
    "delete",
    "ack",
  ]);
});

test("the runner recovers when a claim commits before its response is lost", async () => {
  const harness = createHarness({ loseClaimResponse: true });
  const runner = createDocumentProcessingRunner(harness.dependencies);

  await runner(job, {});

  assert.equal(harness.getCurrent().conversionStatus, "completed");
  assert.equal(
    harness.getCurrent().convertedStoragePath,
    "workspaces/workspace-1/conversion-attempts/document-1/claim-old.pdf",
  );
  assert.equal(harness.getFailureAttempts(), 0);
  assert.equal(harness.getConversionCalls(), 1);
});

test("a successful conversion publishes its validated page count", async () => {
  const harness = createHarness();
  const runner = createDocumentProcessingRunner(harness.dependencies);

  await runner(job, {});

  assert.equal(harness.getPublishedPageCount(), 3);
});

test("a native PDF completes with its validated page count without conversion", async () => {
  const harness = createHarness({ fileType: "pdf" });
  const runner = createDocumentProcessingRunner(harness.dependencies);

  await runner(job, {});

  assert.equal(harness.getCompletedPageCount(), 3);
  assert.equal(harness.getConversionCalls(), 0);
});

test("a native PDF page-count failure preserves viewable completion state", async () => {
  const harness = createHarness({
    fileType: "pdf",
    pageCountFailureCode: "invalid_input",
  });
  const runner = createDocumentProcessingRunner(harness.dependencies);

  await runner(job, {});

  assert.equal(harness.getCurrent().conversionStatus, "completed");
  assert.equal(harness.getCompletedPageCount(), null);
  assert.equal(harness.getPersistedFailureCode(), "invalid_input");
  assert.equal(harness.getFailuresApplied(), 0);
});

test("a native PDF metadata download uses the 100 MiB cap and does not fail viewing", async () => {
  const harness = createHarness({
    fileType: "pdf",
    rejectBoundedDownload: true,
  });
  const runner = createDocumentProcessingRunner(harness.dependencies);

  await runner(job, {});

  assert.equal(
    harness.getObservedDownloadLimit(),
    PDF_PROCESSING_MAX_INPUT_BYTES,
  );
  assert.equal(harness.getCurrent().conversionStatus, "completed");
  assert.equal(harness.getCompletedPageCount(), null);
  assert.equal(harness.getPersistedFailureCode(), "internal_error");
  assert.equal(harness.getFailuresApplied(), 0);
});

test("the runner accepts a completion that committed before its response was lost", async () => {
  const harness = createHarness({ loseCompletionResponse: true });
  const runner = createDocumentProcessingRunner(harness.dependencies);

  await runner(job, {});

  assert.equal(harness.getCurrent().conversionStatus, "completed");
  assert.equal(
    harness.getCurrent().convertedStoragePath,
    "workspaces/workspace-1/conversion-attempts/document-1/claim-old.pdf",
  );
  assert.equal(harness.getFailureAttempts(), 0);
  assert.equal(harness.getFailuresApplied(), 0);
});

test("a force-repair of a completed document is not failed by the free-plan gate", async () => {
  const harness = createHarness({
    freePlan: true,
    initialConversionStatus: "completed",
  });
  const runner = createDocumentProcessingRunner(harness.dependencies);

  await runner(job, { force: true });

  assert.equal(harness.getCurrent().conversionStatus, "completed");
  assert.equal(
    harness.getCurrent().convertedStoragePath,
    "workspaces/workspace-1/conversion-attempts/document-1/claim-old.pdf",
  );
  assert.equal(harness.getFailuresApplied(), 0);
  assert.equal(harness.getConversionCalls(), 1);
});

test("a free-plan document that never completed still fails the conversion gate", async () => {
  const harness = createHarness({ freePlan: true });
  const runner = createDocumentProcessingRunner(harness.dependencies);

  await runner(job, {});

  assert.equal(harness.getCurrent().conversionStatus, "failed");
  assert.equal(harness.getFailuresApplied(), 1);
  assert.equal(harness.getConversionCalls(), 0);
});

test("the runner always requests a bounded 50 MiB source read", async () => {
  const harness = createHarness({ rejectBoundedDownload: true });
  const runner = createDocumentProcessingRunner(harness.dependencies);

  await runner(job, {});

  assert.equal(
    harness.getObservedDownloadLimit(),
    DOCUMENT_CONVERSION_MAX_INPUT_BYTES,
  );
  assert.equal(harness.getConversionCalls(), 0);
  assert.equal(harness.getCurrent().conversionStatus, "failed");
  assert.equal(harness.getFailuresApplied(), 1);
});

test("a deletion claim before PUT cancels the candidate without uploading", async () => {
  const harness = createHarness({ deletionTiming: "before-begin" });
  const runner = createDocumentProcessingRunner(harness.dependencies);

  await runner(job, {});

  assert.deepEqual(harness.getLoggedErrors(), []);
  assert.deepEqual(harness.getCandidateEvents(), [
    "list-cleanup",
    "register",
    "begin",
  ]);
  assert.equal(harness.uploadedObjects.size, 0);
  assert.equal(harness.getCandidate()?.phase, "cancelled");
  assert.equal(harness.getFailuresApplied(), 0);
});

test("a deletion claim after PUT begins forces exact cleanup and acknowledgment", async () => {
  const harness = createHarness({ deletionTiming: "after-begin" });
  const runner = createDocumentProcessingRunner(harness.dependencies);

  await runner(job, {});

  assert.deepEqual(harness.getCandidateEvents(), [
    "list-cleanup",
    "register",
    "begin",
    "finish",
    "delete",
    "ack",
  ]);
  assert.equal(harness.uploadedObjects.size, 0);
  assert.equal(harness.getCandidate()?.phase, "cleaned");
  assert.equal(harness.getFailuresApplied(), 0);
});

test("failed exact cleanup remains durably blocking and unacknowledged", async () => {
  const harness = createHarness({
    deletionTiming: "after-begin",
    cleanupFails: true,
  });
  const runner = createDocumentProcessingRunner(harness.dependencies);

  await runner(job, {});

  assert.deepEqual(harness.getLoggedErrors(), []);
  assert.deepEqual(harness.getCandidateEvents(), [
    "list-cleanup",
    "register",
    "begin",
    "finish",
    "delete",
    "cleanup-failed",
  ]);
  assert.equal(harness.uploadedObjects.size, 1);
  assert.equal(harness.getCandidate()?.phase, "cleanup_required");
  assert.equal(harness.getCandidate()?.cleanupError, "R2 delete failed");
  assert.equal(harness.getFailuresApplied(), 0);
});

test("a deterministic retry cleans acknowledged post-PUT work after the document row is gone", async () => {
  const harness = createHarness({
    initialCleanupRequired: true,
    documentMissing: true,
  });
  const runner = createDocumentProcessingRunner(harness.dependencies);

  await runner(job, {});

  assert.deepEqual(harness.getCandidateEvents(), [
    "list-cleanup",
    "delete",
    "ack",
  ]);
  assert.equal(harness.uploadedObjects.size, 0);
  assert.equal(harness.getCandidate()?.phase, "cleaned");
});

test("a settled upload exception exact-cleans its readable unclaimed candidate", async () => {
  const harness = createHarness({ uploadThrows: true });
  const runner = createDocumentProcessingRunner(harness.dependencies);

  await runner(job, {});

  assert.deepEqual(harness.getCandidateEvents(), [
    "list-cleanup",
    "register",
    "begin",
    "cleanup-failed",
    "delete",
    "ack",
  ]);
  assert.equal(harness.uploadedObjects.size, 0);
  assert.equal(harness.getCandidate()?.phase, "cleaned");
  assert.equal(harness.getFailuresApplied(), 1);
});
