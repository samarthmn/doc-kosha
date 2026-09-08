import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  hasCompletedOnboardingProfile,
  resolveOnboardingFullName,
} from "@/modules/auth/onboardingProfile";

test("onboarding completion depends on primary use case, not a fallback name", () => {
  assert.equal(hasCompletedOnboardingProfile(null), false);
  assert.equal(hasCompletedOnboardingProfile(undefined), false);
  assert.equal(hasCompletedOnboardingProfile(""), false);
  assert.equal(hasCompletedOnboardingProfile("   "), false);
  assert.equal(hasCompletedOnboardingProfile("sales_enablement"), true);
});

test("database email fallbacks are blank in the name input while real names remain", () => {
  assert.equal(
    resolveOnboardingFullName({
      profileFullName: "samarth.m.n@gmail.com",
      authEmail: "samarth.m.n@gmail.com",
    }),
    "",
  );
  assert.equal(
    resolveOnboardingFullName({
      profileFullName: " FALLBACK@EXAMPLE.COM ",
      authEmail: null,
    }),
    "FALLBACK@EXAMPLE.COM",
  );
  assert.equal(
    resolveOnboardingFullName({
      profileFullName: "provider-label@example.com",
      authEmail: "account@example.com",
    }),
    "provider-label@example.com",
  );
  assert.equal(
    resolveOnboardingFullName({
      profileFullName: " Samarth M N ",
      authEmail: "samarth.m.n@gmail.com",
    }),
    "Samarth M N",
  );
});

test("onboarding filters database-only email fallback names before hydrating the form", () => {
  const clientSource = readFileSync(
    path.join(process.cwd(), "src/components/pages/OnboardingClient.tsx"),
    "utf8",
  );
  const stepSource = readFileSync(
    path.join(
      process.cwd(),
      "src/components/pages/onboarding/OnboardingStep1.tsx",
    ),
    "utf8",
  );

  assert.match(clientSource, /resolveOnboardingFullName/);
  assert.match(clientSource, /isLoading\s*\|\|\s*shouldFetchInitialData/);
  assert.match(
    clientSource,
    /step === "loading"[\s\S]*isIdentityHydrationPending/,
  );
  assert.doesNotMatch(
    clientSource,
    /fullName:\s*userProfile\?\.full_name\s*\?\?/,
  );
  assert.match(
    clientSource,
    /if\s*\(isIdentityHydrationPending\s*\|\|\s*step1Data\)\s*return;\s*setStep1Data\(defaultStep1Data\)/,
  );
  assert.doesNotMatch(stepSource, /useGlobalStore/);
  assert.doesNotMatch(stepSource, /resolveOnboardingFullName/);
  assert.doesNotMatch(
    stepSource,
    /setFullName\(initialData\.fullName\s*\?\?\s*""\)/,
  );
});
