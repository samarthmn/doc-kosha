type PublicFileFailureLogger = (
  message: string,
  context: {
    requestId: string;
    operation: string;
    reasonCode: string;
  },
) => void;

type PublicFileInfrastructureFailure = {
  requestId: string;
  operation: string;
  reasonCode: string;
  status: number;
  code: string;
  message: string;
  retryable?: boolean;
  logger?: PublicFileFailureLogger;
};

const logPublicFileRouteFailure = (input: {
  requestId: string;
  operation: string;
  reasonCode: string;
  logger?: PublicFileFailureLogger;
}): void => {
  const logger = input.logger ?? console.error;
  logger("[public-file] infrastructure failure", {
    requestId: input.requestId,
    operation: input.operation,
    reasonCode: input.reasonCode,
  });
};

export const createPublicFileInfrastructureFailureResponse = (
  input: PublicFileInfrastructureFailure,
): Response => {
  logPublicFileRouteFailure(input);
  const retryable = input.retryable ?? input.status === 503;
  return Response.json(
    {
      error: input.message,
      code: input.code,
    },
    {
      status: input.status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-DocKosha-Error-Code": input.code,
        "X-DocKosha-Request-Id": input.requestId,
        "X-DocKosha-Retryable": retryable ? "true" : "false",
      },
    },
  );
};
