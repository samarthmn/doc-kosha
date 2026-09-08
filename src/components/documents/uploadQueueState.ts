export type UploadStage =
  | "queued"
  | "uploading"
  | "paused"
  | "finalizing"
  | "indexing"
  | "uploaded"
  | "converting"
  | "completed"
  | "failed"
  | "cancelled";

export type UploadTaskSnapshot = {
  stage: UploadStage;
  progress?: number;
};

const UPLOADED_STAGES = new Set<UploadStage>([
  "uploaded",
  "converting",
  "completed",
]);
const SETTLED_STAGES = new Set<UploadStage>([
  ...UPLOADED_STAGES,
  "failed",
  "cancelled",
]);
const INTERRUPTIBLE_STAGES = new Set<UploadStage>([
  "queued",
  "uploading",
  "paused",
  "finalizing",
  "indexing",
]);

export const isInterruptibleUploadStage = (stage: UploadStage): boolean =>
  INTERRUPTIBLE_STAGES.has(stage);

export const isSettledUploadStage = (stage: UploadStage): boolean =>
  SETTLED_STAGES.has(stage);

export const summarizeUploadTasks = (tasks: UploadTaskSnapshot[]) => {
  const totalFiles = tasks.length;
  const uploadedFiles = tasks.filter((task) =>
    UPLOADED_STAGES.has(task.stage),
  ).length;
  const settledFiles = tasks.filter((task) =>
    isSettledUploadStage(task.stage),
  ).length;
  const sum = tasks.reduce((total, task) => {
    if (isSettledUploadStage(task.stage)) return total + 100;
    return total + Math.min(100, Math.max(0, task.progress ?? 0));
  }, 0);

  return {
    totalFiles,
    uploadedFiles,
    settledFiles,
    overallPercent:
      totalFiles === 0 ? 0 : Math.min(100, Math.round(sum / totalFiles)),
    allSettled: totalFiles > 0 && settledFiles === totalFiles,
    hasFailures: tasks.some(
      (task) => task.stage === "failed" || task.stage === "cancelled",
    ),
    hasInterruptibleUploads: tasks.some((task) =>
      isInterruptibleUploadStage(task.stage),
    ),
  };
};
