type LogContext = Record<string, unknown>;

const serializeError = (error: unknown): unknown => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return error;
};

const normalizeContext = (
  context: LogContext | undefined,
): LogContext | undefined => {
  if (!context) return undefined;
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => {
      if (key === "error") return [key, serializeError(value)];
      return [key, value];
    }),
  );
};

export const processLogger = {
  debug: (message: string, context?: LogContext) => {
    const normalized = normalizeContext(context);
    if (normalized) {
      console.debug(message, normalized);
      return;
    }
    console.debug(message);
  },
  info: (message: string, context?: LogContext) => {
    const normalized = normalizeContext(context);
    if (normalized) {
      console.info(message, normalized);
      return;
    }
    console.info(message);
  },
  warn: (message: string, context?: LogContext) => {
    const normalized = normalizeContext(context);
    if (normalized) {
      console.warn(message, normalized);
      return;
    }
    console.warn(message);
  },
  error: (message: string, context?: LogContext) => {
    const normalized = normalizeContext(context);
    if (normalized) {
      console.error(message, normalized);
      return;
    }
    console.error(message);
  },
};
