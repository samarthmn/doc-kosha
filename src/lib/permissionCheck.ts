export type PermissionCheckResult = {
  data: boolean | null;
  error: unknown | null;
};

type PermissionResolution =
  | { status: "allowed" }
  | { status: "denied" }
  | { status: "error"; error: unknown };

export type PermissionRetryOptions = {
  attempts?: number;
  delayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
};

const sleep = async (delayMs: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

export const resolvePermissionWithRetry = async (
  check: () => Promise<PermissionCheckResult>,
  options: PermissionRetryOptions = {},
): Promise<PermissionResolution> => {
  const attempts = options.attempts ?? 3;
  const delayMs = options.delayMs ?? 150;
  const wait = options.sleep ?? sleep;

  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error("Permission retry attempts must be a positive integer");
  }
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new Error("Permission retry delay must be a non-negative number");
  }

  let lastError: unknown = new Error("Permission check returned no decision");

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await check();
      if (!result.error && result.data === true) {
        return { status: "allowed" };
      }
      if (!result.error && result.data === false) {
        return { status: "denied" };
      }
      lastError =
        result.error ?? new Error("Permission check returned no decision");
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts) {
      await wait(delayMs * attempt);
    }
  }

  return { status: "error", error: lastError };
};
