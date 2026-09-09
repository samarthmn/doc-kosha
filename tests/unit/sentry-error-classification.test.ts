import assert from "node:assert/strict";
import test from "node:test";
import {
  isExternalAndroidLoggerError,
  getServerActionFailureTags,
} from "../../src/lib/sentryErrorClassification";

const message = "Error invoking postMessage: Java object is gone";
const loggerFrame = { filename: "app://navigation_performance_logger_android" };
const event = (frames = [loggerFrame], value = message) => ({
  exception: { values: [{ value, stacktrace: { frames } }] },
});

test("filters only the identified external Android navigation logger", () => {
  assert.equal(isExternalAndroidLoggerError(event()), true);
  assert.equal(
    isExternalAndroidLoggerError(
      event([
        {
          filename:
            "./node_modules/@sentry/browser/build/npm/esm/prod/helpers.js",
        },
        loggerFrame,
      ]),
    ),
    true,
  );
  assert.equal(isExternalAndroidLoggerError(event([], message)), false);
  assert.equal(
    isExternalAndroidLoggerError(event([loggerFrame], "Other failure")),
    false,
  );
  // beforeSend runs before Sentry source mapping. A minified wrapper cannot
  // safely be distinguished from product code by its chunk URL or mechanism.
  assert.equal(
    isExternalAndroidLoggerError(
      event([
        { filename: "app:///_next/static/chunks/opaque.js" },
        loggerFrame,
      ]),
    ),
    false,
  );
  assert.equal(
    isExternalAndroidLoggerError(
      event([loggerFrame, { filename: "./src/components/player.tsx" }]),
    ),
    false,
  );
  assert.equal(
    isExternalAndroidLoggerError(
      event([
        loggerFrame,
        { filename: "https://www.dockosha.com/_next/static/chunks/app.js" },
      ]),
    ),
    false,
  );
  assert.equal(
    isExternalAndroidLoggerError({
      exception: {
        values: [...event().exception.values, { value: "Application failure" }],
      },
    }),
    false,
  );
});

test("classifies missing actions with finite tags without retaining request data", () => {
  const error = new Error(
    "Failed to find Server Action. This request might be from an older or newer deployment.",
  );
  const request = {
    method: "POST",
    headers: {
      "Content-Type": "multipart/form-data; boundary=private-boundary",
      "Next-Action": "private-action-id",
      "X-Deployment-Id": "client-secret-id",
      cookie: "private-session",
      authorization: "Bearer private-token",
    },
  };
  assert.deepEqual(
    getServerActionFailureTags(error, request, "server-secret-id"),
    {
      action_request_method: "post",
      action_request_transport: "multipart",
      action_header: "present",
      action_deployment: "mismatch",
    },
  );
  assert.equal(
    getServerActionFailureTags(error, request, "client-secret-id")
      ?.action_deployment,
    "match",
  );
  assert.equal(
    getServerActionFailureTags(error, request)?.action_deployment,
    "unknown",
  );
  assert.deepEqual(
    getServerActionFailureTags(error, { method: "GET", headers: {} }, "server"),
    {
      action_request_method: "other",
      action_request_transport: "other",
      action_header: "absent",
      action_deployment: "absent",
    },
  );
  assert.equal(
    getServerActionFailureTags(new Error("Different error"), request),
    null,
  );
  assert.equal(getServerActionFailureTags(null, request), null);
});
