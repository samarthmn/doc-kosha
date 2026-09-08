import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

type ManagedPlaywrightConfig = {
  env: {
    NEXT_DISTDIR?: string;
  };
  grepInvert: string | null;
};

const inspectPlaywrightConfig = (
  nextDistDir?: string,
): ManagedPlaywrightConfig => {
  const env = { ...process.env };
  delete env.NEXT_DISTDIR;
  if (nextDistDir !== undefined) env.NEXT_DISTDIR = nextDistDir;
  const result = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      `const imported = await import('./playwright.config.ts');
     const raw = imported.default;
     const config = raw.default ?? raw;
     const server = Array.isArray(config.webServer) ? config.webServer[0] : config.webServer;
     console.log(JSON.stringify({env: {NEXT_DISTDIR: server.env?.NEXT_DISTDIR},
       grepInvert: config.grepInvert instanceof RegExp ? config.grepInvert.source : null}));`,
    ],
    { env, encoding: "utf8" },
  );
  return JSON.parse(result) as ManagedPlaywrightConfig;
};

test("Playwright uses one overrideable cache without edition branching", () => {
  assert.deepEqual(inspectPlaywrightConfig(), {
    env: {
      NEXT_DISTDIR: ".next-e2e",
    },
    grepInvert: null,
  });
  assert.deepEqual(inspectPlaywrightConfig(".next-custom"), {
    env: { NEXT_DISTDIR: ".next-custom" },
    grepInvert: null,
  });
});
