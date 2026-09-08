const INTERNAL_PATH_BASE = "https://dockosha.invalid";

export const sanitizeInternalReturnPath = (
  requestPath: string | null | undefined,
): string | null => {
  if (
    !requestPath ||
    !requestPath.startsWith("/") ||
    requestPath.startsWith("//")
  ) {
    return null;
  }

  try {
    const parsed = new URL(requestPath, INTERNAL_PATH_BASE);
    if (parsed.origin !== INTERNAL_PATH_BASE) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
};
