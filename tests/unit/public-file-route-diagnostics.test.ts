import assert from "node:assert/strict";
import test from "node:test";

test("public file infrastructure failures are correlated, logged, and retryable", async () => {
  const diagnostics = await import("@/server/publicFileRouteDiagnostics");
  const createFailureResponse = Reflect.get(
    diagnostics,
    "createPublicFileInfrastructureFailureResponse",
  );
  assert.equal(typeof createFailureResponse, "function");
  if (typeof createFailureResponse !== "function") return;

  const logged: Array<{ message: string; context: unknown }> = [];
  const response = createFailureResponse({
    requestId: "request-123",
    operation: "alc_seed_lookup",
    reasonCode: "alc_seed_lookup_failed",
    status: 503,
    code: "ACCESS_EVALUATION_UNAVAILABLE",
    message: "Access evaluation is temporarily unavailable",
    logger: (message: string, context: unknown) => {
      logged.push({ message, context });
    },
  });

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("X-DocKosha-Request-Id"), "request-123");
  assert.equal(
    response.headers.get("X-DocKosha-Error-Code"),
    "ACCESS_EVALUATION_UNAVAILABLE",
  );
  assert.equal(response.headers.get("X-DocKosha-Retryable"), "true");
  assert.deepEqual(await response.json(), {
    error: "Access evaluation is temporarily unavailable",
    code: "ACCESS_EVALUATION_UNAVAILABLE",
  });
  assert.deepEqual(logged, [
    {
      message: "[public-file] infrastructure failure",
      context: {
        requestId: "request-123",
        operation: "alc_seed_lookup",
        reasonCode: "alc_seed_lookup_failed",
      },
    },
  ]);
});
