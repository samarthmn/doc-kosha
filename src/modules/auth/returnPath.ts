import { sanitizeInternalReturnPath } from "@/lib/internalReturnPath";

const DEFAULT_AUTH_RETURN_PATH = "/dashboard";

export const resolveAuthReturnPath = (
  requestPath: string | null | undefined,
): string => {
  const sanitized = sanitizeInternalReturnPath(requestPath);
  if (!sanitized || sanitized.startsWith("/auth")) {
    return DEFAULT_AUTH_RETURN_PATH;
  }
  return sanitized;
};
