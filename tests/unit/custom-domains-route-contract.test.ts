import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * Characterization contract for the four custom-domain routes.
 *
 * Pins the unauthorized/unentitled responses the normal module routes produce:
 * - invalid input   -> 400 (behavioral, executed against the handlers)
 * - unauthenticated -> 401 { error: "Unauthorized" } (source contract)
 * - non-owner       -> 403 { error: "Forbidden" } (source contract)
 * - unentitled      -> 403 { error: "Custom domains require an active subscription." }
 */

Object.assign(process.env, {
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_APP_ENV: "local",
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-google-client-id",
  R2_ENDPOINT: "http://localhost:9000",
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_SECRET_ACCESS_KEY: "test-secret-key",
  SMTP_HOST: "localhost",
  SENDER_EMAIL: "noreply@example.com",
  NOTIFICATION_SENDER_EMAIL: "notifications@example.com",
  FOUNDER_SENDER_EMAIL: "founder@example.com",
  COOKIE_SECRET: "test-cookie-secret-at-least-32-characters",
});

const UNENTITLED_ERROR = "Custom domains require an active subscription.";
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const DOMAIN_ID = "22222222-2222-4222-8222-222222222222";

/**
 * The files that implement the guard pipeline for each route.
 */
const GUARD_IMPLEMENTATIONS = [
  "src/modules/custom-domains/server/routes/createDomain.ts",
  "src/modules/custom-domains/server/routes/deleteDomain.ts",
  "src/modules/custom-domains/server/routes/verifyDomain.ts",
  "src/modules/custom-domains/server/routes/dnsRecords.ts",
];

const source = (relativePath: string): string =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

test("every domain route guards in the order auth -> ownership -> entitlement with pinned responses", () => {
  for (const file of GUARD_IMPLEMENTATIONS) {
    const text = source(file);

    const unauthorizedAt = text.search(
      /\{ error: "Unauthorized" \},?\s*\{ status: 401 \}/,
    );
    const forbiddenAt = text.search(
      /\{ error: "Forbidden" \},?\s*\{ status: 403 \}/,
    );
    const unentitledAt = text.indexOf(UNENTITLED_ERROR);

    assert.ok(unauthorizedAt >= 0, `${file}: pinned 401 Unauthorized missing`);
    assert.ok(forbiddenAt >= 0, `${file}: pinned 403 Forbidden missing`);
    assert.ok(unentitledAt >= 0, `${file}: pinned unentitled 403 missing`);
    assert.match(
      text.slice(unentitledAt, unentitledAt + 220),
      /status: 403/,
      `${file}: unentitled response must be 403`,
    );
    assert.ok(
      unauthorizedAt < forbiddenAt && forbiddenAt < unentitledAt,
      `${file}: guard order must be auth -> ownership -> entitlement`,
    );
  }
});

test("POST /api/domains rejects invalid input with the pinned 400", async () => {
  const { POST } = await import("@/app/api/domains/route");
  const response = await POST(
    new Request("http://localhost/api/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: WORKSPACE_ID, domain: "not a host" }),
    }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid input" });
});

test("DELETE /api/domains/[domainId] rejects invalid params and body with the pinned 400s", async () => {
  const { DELETE } = await import("@/app/api/domains/[domainId]/route");

  const invalidParams = await DELETE(
    new Request("http://localhost/api/domains/not-a-uuid", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: WORKSPACE_ID }),
    }),
    { params: Promise.resolve({ domainId: "not-a-uuid" }) },
  );
  assert.equal(invalidParams.status, 400);
  assert.deepEqual(await invalidParams.json(), { error: "Invalid domain ID" });

  const invalidBody = await DELETE(
    new Request(`http://localhost/api/domains/${DOMAIN_ID}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
    { params: Promise.resolve({ domainId: DOMAIN_ID }) },
  );
  assert.equal(invalidBody.status, 400);
  assert.deepEqual(await invalidBody.json(), { error: "Invalid request body" });
});

test("POST /api/domains/verify rejects invalid input with the pinned 400", async () => {
  const { POST } = await import("@/app/api/domains/verify/route");
  const response = await POST(
    new Request("http://localhost/api/domains/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: WORKSPACE_ID }),
    }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid input" });
});

test("POST /api/domains/dns-records rejects invalid input with the pinned 400", async () => {
  const { POST } = await import("@/app/api/domains/dns-records/route");
  const response = await POST(
    new Request("http://localhost/api/domains/dns-records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domainId: DOMAIN_ID }),
    }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid input" });
});
