import {
  resolvePermissionWithRetry,
  type PermissionCheckResult,
  type PermissionRetryOptions,
} from "@/lib/permissionCheck";

type MultipartAccessResolution =
  | { status: "allowed" }
  | { status: "denied" }
  | { status: "unavailable"; error: unknown };

export const resolveMultipartAccessWithRetry = async (
  check: () => Promise<PermissionCheckResult>,
  options: PermissionRetryOptions = {},
): Promise<MultipartAccessResolution> => {
  const resolution = await resolvePermissionWithRetry(check, options);
  if (resolution.status === "error") {
    return { status: "unavailable", error: resolution.error };
  }
  return resolution;
};
