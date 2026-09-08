import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const readSource = (filePath: string): string =>
  readFileSync(path.join(process.cwd(), filePath), "utf8");

test("auth and billing redirect consumers use the shared origin-checking return-path sanitizer", () => {
  const sources = [
    "src/app/api/billing/checkout/route.ts",
    "src/app/api/billing/portal/route.ts",
    "src/app/(authenticated)/dashboard/page.tsx",
    "src/app/onboarding/page.tsx",
    "src/app/plan/page.tsx",
    "src/components/pages/OnboardingClient.tsx",
    "src/components/auth/AuthPageClientGate.tsx",
    "src/components/auth/AuthCallbackPage.tsx",
    "src/modules/auth/server/entryRedirect.ts",
    "src/app/api/settings/workspace-invites/route.ts",
    "src/app/api/data-rooms/invite/route.ts",
  ].map(readSource);

  for (const source of sources) {
    assert.match(source, /(sanitizeInternalReturnPath|resolveAuthReturnPath)/);
    assert.doesNotMatch(
      source,
      /startsWith\("\/"\)[\s\S]*startsWith\("\/\/"\)/,
    );
  }
});
