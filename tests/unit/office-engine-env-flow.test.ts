import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// Minimal server env so serverEnvSchema.parse() succeeds. Office routing and
// size admission are constants now; no rollout environment is configured.
Object.assign(process.env, {
  NEXT_PUBLIC_APP_ENV: "local",
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy",
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: "dummy",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  R2_ACCESS_KEY_ID: "dummy",
  R2_SECRET_ACCESS_KEY: "dummy",
  R2_ENDPOINT: "http://localhost:9000",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  SENDER_EMAIL: "t@t.co",
  NOTIFICATION_SENDER_EMAIL: "t@t.co",
  FOUNDER_SENDER_EMAIL: "t@t.co",
  SUPABASE_SERVICE_ROLE_KEY: "dummy",
  COOKIE_SECRET: "0123456789abcdef0123456789abcdef",
});

test("office engine is always on for every active Office extension", async () => {
  const { OFFICE_ENGINE_EXTENSIONS } =
    await import("@/server/officeEngineRouter");
  const { DOCUMENT_CONVERSION_MAX_INPUT_BYTES, OFFICE_ENGINE_MAX_INPUT_BYTES } =
    await import("@/lib/constants");

  assert.deepEqual([...OFFICE_ENGINE_EXTENSIONS].sort(), [
    "docx",
    "pptx",
    "xlsm",
    "xlsx",
  ]);
  assert.equal(OFFICE_ENGINE_MAX_INPUT_BYTES, 50 * 1024 * 1024);
  assert.equal(DOCUMENT_CONVERSION_MAX_INPUT_BYTES, 50 * 1024 * 1024);
});

test("the retired DocYantra HTTP service and configuration stay removed", () => {
  assert.equal(existsSync(path.join(process.cwd(), "private-engine")), false);
  assert.equal(
    existsSync(path.join(process.cwd(), "src", "server", "docyantraAuth.ts")),
    false,
  );

  const activeConfiguration = [
    "env.example",
    "package.json",
    "playwright.config.ts",
    "src/lib/env.ts",
  ]
    .map((file) => readFileSync(path.join(process.cwd(), file), "utf8"))
    .join("\n");
  assert.doesNotMatch(
    activeConfiguration,
    /DOCYANTRA_(?:URL|API_KEY|API_KEY_HEADER)/,
  );
  assert.doesNotMatch(activeConfiguration, /docyantra:(?:up|down|logs)/);
});
