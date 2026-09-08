import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { resolveMultipartAccessWithRetry } from "@/server/storage/multipartAccess";

test("multipart access recovers from transient permission service errors", async () => {
  const responses = [
    { data: null, error: new Error("upstream connection closed") },
    { data: null, error: new Error("temporary PostgREST failure") },
    { data: true, error: null },
  ];
  const delays: number[] = [];
  let calls = 0;

  const resolution = await resolveMultipartAccessWithRetry(
    async () => {
      const response = responses[calls];
      calls += 1;
      if (!response) throw new Error("unexpected permission lookup");
      return response;
    },
    {
      attempts: 3,
      delayMs: 25,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    },
  );

  assert.deepEqual(resolution, { status: "allowed" });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [25, 50]);
});

test("multipart access preserves an explicit permission denial", async () => {
  let calls = 0;

  const resolution = await resolveMultipartAccessWithRetry(async () => {
    calls += 1;
    return { data: false, error: null };
  });

  assert.deepEqual(resolution, { status: "denied" });
  assert.equal(calls, 1);
});

test("multipart access reports an unavailable permission service after retries", async () => {
  const finalError = new Error("permission service unavailable");
  let calls = 0;

  const resolution = await resolveMultipartAccessWithRetry(
    async () => {
      calls += 1;
      return { data: null, error: finalError };
    },
    { attempts: 2, delayMs: 0 },
  );

  assert.equal(resolution.status, "unavailable");
  if (resolution.status === "unavailable") {
    assert.equal(resolution.error, finalError);
  }
  assert.equal(calls, 2);
});

test("every multipart route maps outages to 503 and denials to 403", () => {
  for (const route of ["initiate", "sign-part", "complete", "abort"]) {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "src/app/api/storage/multipart",
        route,
        "route.ts",
      ),
      "utf8",
    );
    const unavailableStart = source.indexOf(
      'if (access.status === "unavailable")',
    );
    const deniedStart = source.indexOf('if (access.status === "denied")');

    assert.match(source, /resolveMultipartAccessWithRetry/);
    assert.ok(unavailableStart >= 0, `${route} must handle unavailable access`);
    assert.ok(deniedStart > unavailableStart, `${route} must handle denials`);
    assert.match(
      source.slice(unavailableStart, deniedStart),
      /\{ status: 503 \}/,
    );
    assert.match(
      source.slice(deniedStart, deniedStart + 400),
      /\{ status: 403 \}/,
    );
    assert.doesNotMatch(source, /canEditError\s*\|\|\s*!canEdit/);
  }
});
