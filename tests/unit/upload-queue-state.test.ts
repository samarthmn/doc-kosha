import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  isInterruptibleUploadStage,
  isSettledUploadStage,
  summarizeUploadTasks,
  type UploadTaskSnapshot,
} from "@/components/documents/uploadQueueState";

const task = (
  stage: UploadTaskSnapshot["stage"],
  progress?: number,
): UploadTaskSnapshot => ({ stage, progress });

const multipartSource = readFileSync(
  new URL(
    "../../src/components/documents/multipartUploadClient.ts",
    import.meta.url,
  ),
  "utf8",
);
const providerSource = readFileSync(
  new URL(
    "../../src/components/providers/UploadQueueProvider.tsx",
    import.meta.url,
  ),
  "utf8",
);
const lifecycleSafetyModuleUrl = new URL(
  "../../src/components/documents/uploadLifecycleSafety.ts",
  import.meta.url,
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const loadLifecycleSafetyModule = async (): Promise<
  Record<string, unknown>
> => {
  assert.equal(
    existsSync(lifecycleSafetyModuleUrl),
    true,
    "upload lifecycle safety module must exist",
  );
  const moduleValue: unknown = await import(lifecycleSafetyModuleUrl.href);
  assert.equal(isRecord(moduleValue), true);
  if (!isRecord(moduleValue)) {
    throw new Error("Upload lifecycle safety module must export an object");
  }
  return moduleValue;
};

type StatusClassifier = (status: number) => boolean;
const isStatusClassifier = (value: unknown): value is StatusClassifier =>
  typeof value === "function";

type CompletionClassifier = (
  state: "incomplete" | "finalizing" | "completed" | "ambiguous",
) => boolean;
const isCompletionClassifier = (
  value: unknown,
): value is CompletionClassifier => typeof value === "function";

type CleanupDeadlineFactory = (timeoutMs?: number) => {
  signal: AbortSignal;
  clear: () => void;
};
const isCleanupDeadlineFactory = (
  value: unknown,
): value is CleanupDeadlineFactory => typeof value === "function";

test("keeps a fixed denominator while completed uploads remain in the ledger", () => {
  assert.deepEqual(summarizeUploadTasks([task("queued"), task("queued")]), {
    totalFiles: 2,
    uploadedFiles: 0,
    settledFiles: 0,
    overallPercent: 0,
    allSettled: false,
    hasFailures: false,
    hasInterruptibleUploads: true,
  });
  assert.equal(
    summarizeUploadTasks([task("uploaded", 100), task("uploading", 20)])
      .uploadedFiles,
    1,
  );
  assert.equal(
    summarizeUploadTasks([task("uploaded", 100), task("uploading", 20)])
      .totalFiles,
    2,
  );
  assert.deepEqual(
    summarizeUploadTasks([task("uploaded", 100), task("uploaded", 100)]),
    {
      totalFiles: 2,
      uploadedFiles: 2,
      settledFiles: 2,
      overallPercent: 100,
      allSettled: true,
      hasFailures: false,
      hasInterruptibleUploads: false,
    },
  );
});

test("counts failures and cancellations as settled but not uploaded", () => {
  const summary = summarizeUploadTasks([
    task("uploaded", 100),
    task("failed"),
    task("cancelled"),
  ]);
  assert.equal(summary.totalFiles, 3);
  assert.equal(summary.uploadedFiles, 1);
  assert.equal(summary.settledFiles, 3);
  assert.equal(summary.hasFailures, true);
  assert.equal(summary.allSettled, true);
  assert.equal(isSettledUploadStage("failed"), true);
  assert.equal(isSettledUploadStage("cancelled"), true);
});

test("warns only for stages that still depend on the current document", () => {
  for (const stage of [
    "queued",
    "uploading",
    "paused",
    "finalizing",
    "indexing",
  ] as const) {
    assert.equal(isInterruptibleUploadStage(stage), true);
  }
  for (const stage of [
    "uploaded",
    "converting",
    "completed",
    "failed",
    "cancelled",
  ] as const) {
    assert.equal(isInterruptibleUploadStage(stage), false);
  }
});

test("multipart fetch boundaries use an abort signal", () => {
  assert.match(
    multipartSource,
    /const requestController = new AbortController/,
  );
  assert.match(multipartSource, /signal: requestController\.signal/);
  assert.match(multipartSource, /getTarget:/);
});

test("provider warns only through beforeunload while active", () => {
  assert.match(providerSource, /addEventListener\("beforeunload"/);
  assert.doesNotMatch(providerSource, /addEventListener\("click"/);
  assert.match(providerSource, /files uploaded/);
});

test("preserves uploaded objects for ambiguous mutation outcomes", async () => {
  const lifecycleSafety = await loadLifecycleSafetyModule();
  const classifyReplace = lifecycleSafety.isProvenReplacePreMutationRejection;
  const classifyInsert = lifecycleSafety.isProvenInsertNonCommitRejection;
  assert.equal(isStatusClassifier(classifyReplace), true);
  assert.equal(isStatusClassifier(classifyInsert), true);
  if (
    !isStatusClassifier(classifyReplace) ||
    !isStatusClassifier(classifyInsert)
  ) {
    return;
  }

  for (const status of [400, 401, 403, 409]) {
    assert.equal(classifyReplace(status), true);
  }
  for (const status of [400, 401, 403, 409, 422]) {
    assert.equal(classifyInsert(status), true);
  }
  for (const status of [0, 404, 408, 429, 500, 502, 503, 504]) {
    assert.equal(classifyReplace(status), false);
    assert.equal(classifyInsert(status), false);
  }

  assert.match(
    providerSource,
    /isProvenReplacePreMutationRejection\(replaceRes\.status\)/,
  );
  assert.match(providerSource, /status: insertStatus/);
  assert.match(
    providerSource,
    /isProvenInsertNonCommitRejection\(insertStatus\)/,
  );
});

test("cleanup deadlines independently settle stalled requests", async () => {
  const lifecycleSafety = await loadLifecycleSafetyModule();
  const createDeadline = lifecycleSafety.createUploadCleanupDeadline;
  assert.equal(isCleanupDeadlineFactory(createDeadline), true);
  if (!isCleanupDeadlineFactory(createDeadline)) return;

  const stalled = createDeadline(1);
  const cleared = createDeadline(1);
  assert.notEqual(stalled.signal, cleared.signal);
  cleared.clear();
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 10));
  assert.equal(stalled.signal.aborted, true);
  assert.equal(cleared.signal.aborted, false);
  stalled.clear();

  assert.match(multipartSource, /createUploadCleanupDeadline/);
  assert.match(providerSource, /createUploadCleanupDeadline/);
  assert.match(multipartSource, /signal: cleanupDeadline\.signal/);
  assert.match(providerSource, /signal: cleanupDeadline\.signal/);
});

test("deletes exact targets only after confirmed multipart completion", async () => {
  const lifecycleSafety = await loadLifecycleSafetyModule();
  const canDelete = lifecycleSafety.canDeleteCompletedMultipartTarget;
  assert.equal(isCompletionClassifier(canDelete), true);
  if (!isCompletionClassifier(canDelete)) return;

  assert.equal(canDelete("incomplete"), false);
  assert.equal(canDelete("finalizing"), false);
  assert.equal(canDelete("ambiguous"), false);
  assert.equal(canDelete("completed"), true);
  assert.match(multipartSource, /getCompletionState:/);
  assert.match(multipartSource, /completionState = "ambiguous"/);
  assert.match(
    providerSource,
    /canDeleteCompletedMultipartTarget\(\s*controller\.getCompletionState\(\),?\s*\)/,
  );
});

test("clearFinished cannot shrink an active batch", () => {
  assert.match(
    providerSource,
    /summarizeUploadTasks\(prev\)\.allSettled \? \[\] : prev/,
  );
});
