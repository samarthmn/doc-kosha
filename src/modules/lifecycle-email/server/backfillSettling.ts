export const settleLifecycleBackfills = async (args: {
  tasks: readonly Promise<void>[];
  onRejected: (reason: unknown) => void;
}): Promise<void> => {
  const results = await Promise.allSettled(args.tasks);
  for (const result of results) {
    if (result.status === "rejected") {
      args.onRejected(result.reason);
    }
  }
};
