import {
  createEngineFailure,
  type EngineFailure,
  type EngineOperation,
} from "@/server/engineErrors";

export type OperationDeadline = Readonly<{ deadlineAt: number }>;

const normalizedDurationMs = (timeoutMs: number): number =>
  Number.isFinite(timeoutMs) ? Math.max(0, Math.floor(timeoutMs)) : 0;

export const createOperationDeadline = (
  timeoutMs: number,
  nowMs = Date.now(),
): OperationDeadline => ({
  deadlineAt: nowMs + normalizedDurationMs(timeoutMs),
});

export const remainingOperationTimeMs = (
  deadline: OperationDeadline,
  nowMs = Date.now(),
  reserveMs = 0,
): number =>
  Math.max(
    0,
    Math.floor(deadline.deadlineAt - nowMs - normalizedDurationMs(reserveMs)),
  );

export const createDeadlineExceededFailure = (context: {
  operation: EngineOperation;
  format?: string;
}): EngineFailure =>
  createEngineFailure({
    code: "deadline_exceeded",
    message: "The document operation deadline was exceeded.",
    operation: context.operation,
    format: context.format,
  });

export const createOperationDeadlineSignal = (
  deadline: OperationDeadline,
  context: { operation: EngineOperation; format?: string },
): { signal: AbortSignal; dispose: () => void } => {
  const controller = new AbortController();
  const failure = createDeadlineExceededFailure(context);
  const remainingMs = remainingOperationTimeMs(deadline);
  if (remainingMs <= 0) {
    controller.abort(failure);
    return { signal: controller.signal, dispose: () => undefined };
  }
  const timer = setTimeout(() => controller.abort(failure), remainingMs);
  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timer),
  };
};

export const runWithinOperationDeadline = async <T>(
  deadline: OperationDeadline,
  options: {
    operation: EngineOperation;
    format?: string;
    reserveMs?: number;
    now?: () => number;
    run: (signal: AbortSignal) => Promise<T>;
  },
): Promise<T> => {
  const remainingMs = remainingOperationTimeMs(
    deadline,
    options.now?.() ?? Date.now(),
    options.reserveMs,
  );
  const failure = createDeadlineExceededFailure(options);
  if (remainingMs <= 0) throw failure;

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort(failure);
      reject(failure);
    }, remainingMs);
  });

  try {
    const result = await Promise.race([
      options.run(controller.signal),
      expired,
    ]);
    if (
      remainingOperationTimeMs(
        deadline,
        options.now?.() ?? Date.now(),
        options.reserveMs,
      ) <= 0
    ) {
      throw failure;
    }
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
};
