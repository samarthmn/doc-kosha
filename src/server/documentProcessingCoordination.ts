import {
  DOCUMENT_CONVERSION_TIMEOUT_MS,
  DOCUMENT_PROCESSING_MAX_PENDING_TASKS,
} from "@/lib/constants";
import {
  createEngineFailure,
  engineFailureSchema,
  type EngineFailure,
} from "@/server/engineErrors";

export type ProcessingAttemptState = {
  storagePath: string;
  convertedStoragePath: string | null;
  conversionStatus: string;
  claimId: string | null;
};

type UploadedOutputDisposition = "accept-completed" | "retain";

const DOCUMENT_PROCESSING_LEASE_MS = DOCUMENT_CONVERSION_TIMEOUT_MS + 60_000;

/**
 * Forced repairs may replace only an expired processing lease. Invalid or
 * missing timestamps fail closed so one Vercel instance cannot steal a live
 * claim from another.
 */
export const isProcessingClaimStale = (
  updatedAt: string,
  nowMs = Date.now(),
  leaseMs = DOCUMENT_PROCESSING_LEASE_MS,
): boolean => {
  const updatedAtMs = Date.parse(updatedAt);
  if (!Number.isFinite(updatedAtMs)) return false;
  return nowMs - updatedAtMs >= leaseMs;
};

/** Recovers a claim whose successful DB response was lost in transit. */
export const processingAttemptOwnsClaim = (args: {
  state: ProcessingAttemptState | null;
  sourceStoragePath: string;
  claimId: string;
}): boolean => {
  return Boolean(
    args.state &&
    args.state.storagePath === args.sourceStoragePath &&
    args.state.conversionStatus === "in_progress" &&
    args.state.claimId === args.claimId,
  );
};

export const confirmProcessingClaim = async (args: {
  sourceStoragePath: string;
  claimId: string;
  write: () => Promise<boolean>;
  read: () => Promise<ProcessingAttemptState | null>;
  onAmbiguousWrite?: (error: unknown) => void;
}): Promise<boolean> => {
  try {
    if (await args.write()) return true;
  } catch (error) {
    args.onAmbiguousWrite?.(error);
  }

  return processingAttemptOwnsClaim({
    state: await args.read(),
    sourceStoragePath: args.sourceStoragePath,
    claimId: args.claimId,
  });
};

/** Prefix that owns every conversion-attempt object for one document. */
export const buildConversionAttemptsPrefix = (
  workspaceId: string,
  documentId: string,
): string => `workspaces/${workspaceId}/conversion-attempts/${documentId}/`;

/** Gives every processing claim its own immutable object key. */
export const buildClaimScopedPdfPath = (
  workspaceId: string,
  documentId: string,
  claimId: string,
): string => {
  return `${buildConversionAttemptsPrefix(workspaceId, documentId)}${claimId}.pdf`;
};

/**
 * Recovers the owning attempts prefix from a claim-scoped output path.
 * Superseded attempts are referenced only by this convention (the delayed-GC
 * contract), so document deletion purges the prefix to avoid stranding them.
 */
export const conversionAttemptsPrefixOfPath = (
  workspaceId: string,
  path: string,
): string | null => {
  const attemptsRoot = `workspaces/${workspaceId}/conversion-attempts/`;
  if (!path.startsWith(attemptsRoot)) return null;
  const [documentId, ...rest] = path.slice(attemptsRoot.length).split("/");
  if (!documentId || rest.length !== 1 || !rest[0]) return null;
  return `${attemptsRoot}${documentId}/`;
};

/**
 * Decides whether an uploaded conversion was accepted after an ambiguous DB
 * result. Every other immutable candidate is retained for delayed garbage
 * collection: an orphan is repairable, a referenced blob deleted in a race is
 * not.
 */
export const decideUploadedOutputDisposition = (args: {
  state: ProcessingAttemptState | null | "unreadable";
  sourceStoragePath: string;
  uploadedStoragePath: string;
  claimId: string;
}): UploadedOutputDisposition => {
  if (args.state === "unreadable") return "retain";
  if (args.state === null) return "retain";

  if (
    args.state.conversionStatus === "completed" &&
    args.state.convertedStoragePath === args.uploadedStoragePath
  ) {
    return "accept-completed";
  }
  return "retain";
};

type SchedulerOptions = { force?: boolean; deadlineAt?: number };
type SchedulerJob = { documentId: string; workspaceId: string };
type SchedulerRunner = (
  job: SchedulerJob,
  options: SchedulerOptions,
) => Promise<void>;

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
};

const createDeferred = (): Deferred => {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

type SchedulerTask = {
  key: string;
  job: SchedulerJob;
  options: SchedulerOptions;
  deferred: Deferred;
  running: boolean;
  runningForce: boolean;
  rerunRequested: boolean;
  lastError: unknown;
  expiryTimer: ReturnType<typeof setTimeout> | null;
};

type SchedulerConfiguration = {
  maxPendingTasks?: number;
  onTaskFailure?: (job: SchedulerJob, failure: EngineFailure) => Promise<void>;
};

export type SchedulerAdmission =
  | { accepted: true; completion: Promise<void> }
  | { accepted: false; completion: Promise<void> };

/** Coalesces queued work and guarantees one trailing run after an in-flight hit. */
export const createDocumentProcessingScheduler = (
  runner: SchedulerRunner,
  maxConcurrency = 2,
  configuration: SchedulerConfiguration = {},
) => {
  const maxPendingTasks =
    configuration.maxPendingTasks ?? DOCUMENT_PROCESSING_MAX_PENDING_TASKS;
  let activeCount = 0;
  const queue: SchedulerTask[] = [];
  const tasksByKey = new Map<string, SchedulerTask>();
  const earliestDeadlineAt = (
    current: number | undefined,
    incoming: number | undefined,
  ): number | undefined => {
    if (current === undefined) return incoming;
    if (incoming === undefined) return current;
    return Math.min(current, incoming);
  };

  const clearExpiryTimer = (task: SchedulerTask): void => {
    if (!task.expiryTimer) return;
    clearTimeout(task.expiryTimer);
    task.expiryTimer = null;
  };

  const removeQueuedTask = (task: SchedulerTask): void => {
    const index = queue.indexOf(task);
    if (index >= 0) queue.splice(index, 1);
  };

  const notifyTypedFailure = async (
    job: SchedulerJob,
    error: unknown,
  ): Promise<void> => {
    const parsed = engineFailureSchema.safeParse(error);
    if (!parsed.success) return;
    await (
      configuration.onTaskFailure?.({ ...job }, parsed.data) ??
      Promise.resolve()
    ).catch(() => undefined);
  };

  const failTask = (task: SchedulerTask, failure: EngineFailure): void => {
    clearExpiryTimer(task);
    removeQueuedTask(task);
    tasksByKey.delete(task.key);
    void notifyTypedFailure(task.job, failure).finally(() =>
      task.deferred.reject(failure),
    );
  };

  const armQueuedDeadline = (task: SchedulerTask): void => {
    clearExpiryTimer(task);
    const deadlineAt = task.options.deadlineAt;
    if (deadlineAt === undefined) return;
    const remainingMs = deadlineAt - Date.now();
    const failure = createEngineFailure({
      code: "deadline_exceeded",
      message: "Document processing expired while waiting for capacity.",
      operation: "conversion",
    });
    if (remainingMs <= 0) {
      failTask(task, failure);
      return;
    }
    task.expiryTimer = setTimeout(() => failTask(task, failure), remainingMs);
  };

  const drain = (): void => {
    while (activeCount < maxConcurrency && queue.length > 0) {
      const task = queue.shift();
      if (!task) return;

      clearExpiryTimer(task);
      task.running = true;
      activeCount += 1;
      const runOptions = { ...task.options };
      task.options = {};
      task.runningForce = Boolean(runOptions.force);
      void runner({ ...task.job }, runOptions)
        .then(() => {
          task.lastError = null;
        })
        .catch(async (error: unknown) => {
          task.lastError = error;
          await notifyTypedFailure(task.job, error);
        })
        .finally(() => {
          activeCount -= 1;
          task.running = false;
          task.runningForce = false;
          if (task.rerunRequested) {
            task.rerunRequested = false;
            queue.push(task);
            armQueuedDeadline(task);
          } else {
            tasksByKey.delete(task.key);
            if (task.lastError) task.deferred.reject(task.lastError);
            else task.deferred.resolve();
          }
          drain();
        });
    }
  };

  const admit = (
    job: SchedulerJob,
    options: SchedulerOptions = {},
  ): SchedulerAdmission => {
    const key = `${job.workspaceId}:${job.documentId}`;
    const existing = tasksByKey.get(key);
    if (existing) {
      if (!existing.running) {
        existing.options = {
          force: Boolean(existing.options.force || options.force),
          deadlineAt: earliestDeadlineAt(
            existing.options.deadlineAt,
            options.deadlineAt,
          ),
        };
        armQueuedDeadline(existing);
        return { accepted: true, completion: existing.deferred.promise };
      }

      // A duplicate forced repair shares an already-forced run. A non-force
      // event may represent a replacement upload and must get one trailing
      // pass; a force event arriving behind a normal pass upgrades that pass.
      const needsTrailingRun = !options.force || !existing.runningForce;
      if (needsTrailingRun || existing.rerunRequested) {
        existing.options = {
          force: Boolean(existing.options.force || options.force),
          deadlineAt: earliestDeadlineAt(
            existing.options.deadlineAt,
            options.deadlineAt,
          ),
        };
      }
      if (needsTrailingRun) existing.rerunRequested = true;
      return { accepted: true, completion: existing.deferred.promise };
    }

    if (queue.length >= maxPendingTasks) {
      const failure = createEngineFailure({
        code: "queue_busy",
        message: "Document processing capacity is temporarily full.",
        operation: "conversion",
      });
      const deferred = createDeferred();
      void notifyTypedFailure(job, failure).finally(() =>
        deferred.reject(failure),
      );
      return { accepted: false, completion: deferred.promise };
    }

    const task: SchedulerTask = {
      key,
      job,
      options: { ...options },
      deferred: createDeferred(),
      running: false,
      runningForce: false,
      rerunRequested: false,
      lastError: null,
      expiryTimer: null,
    };
    tasksByKey.set(key, task);
    queue.push(task);
    armQueuedDeadline(task);
    drain();
    return { accepted: true, completion: task.deferred.promise };
  };

  const schedule = (
    job: SchedulerJob,
    options: SchedulerOptions = {},
  ): Promise<void> => admit(job, options).completion;

  return { admit, schedule };
};
