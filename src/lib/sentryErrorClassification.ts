import type { ErrorEvent } from "@sentry/nextjs";

const ANDROID_LOGGER_SOURCE = "app://navigation_performance_logger_android";
const ANDROID_LOGGER_MESSAGE =
  "Error invoking postMessage: Java object is gone";

/** Require positive source evidence; unknown or application frames keep the event. */
export const isExternalAndroidLoggerError = (
  event: Pick<ErrorEvent, "exception">,
): boolean => {
  const exceptions = event.exception?.values;
  if (
    exceptions?.length !== 1 ||
    exceptions[0].value !== ANDROID_LOGGER_MESSAGE
  ) {
    return false;
  }
  const frames = exceptions[0].stacktrace?.frames ?? [];
  return (
    frames.some((frame) => frame.filename === ANDROID_LOGGER_SOURCE) &&
    frames.every(
      (frame) =>
        frame.filename === ANDROID_LOGGER_SOURCE ||
        /^\.\/node_modules\/@sentry\/browser\/.+\/helpers\.js$/.test(
          frame.filename ?? "",
        ),
    )
  );
};

export const getServerActionFailureTags = (
  error: unknown,
  request: {
    method: string;
    headers: Record<string, string | string[] | undefined>;
  },
  deploymentId?: string,
): Record<string, string> | null => {
  if (
    !(error instanceof Error) ||
    !error.message.startsWith("Failed to find Server Action.")
  ) {
    return null;
  }
  const header = (name: string): string | undefined => {
    const entry = Object.entries(request.headers).find(
      ([key]) => key.toLowerCase() === name,
    )?.[1];
    return typeof entry === "string" ? entry : undefined;
  };
  const clientDeployment = header("x-deployment-id");
  return {
    action_request_method:
      request.method.toUpperCase() === "POST" ? "post" : "other",
    action_request_transport: /^multipart\/form-data(?:;|$)/i.test(
      header("content-type") ?? "",
    )
      ? "multipart"
      : "other",
    action_header: header("next-action") ? "present" : "absent",
    action_deployment: !clientDeployment
      ? "absent"
      : !deploymentId
        ? "unknown"
        : clientDeployment === deploymentId
          ? "match"
          : "mismatch",
  };
};
