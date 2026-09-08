import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildSettingsTabUrl,
  coerceSettingsTab,
  isSettingsRecoveryTab,
  resolveSettingsTab,
} from "@/components/pages/settingsTabNavigation";

test("Settings selection is derived from the tab query with a safe default", () => {
  assert.equal(
    resolveSettingsTab(new URLSearchParams("tab=notifications")),
    "notifications",
  );
  assert.equal(
    resolveSettingsTab(new URLSearchParams("tab=unknown&source=nav")),
    "profile",
  );
  assert.equal(
    resolveSettingsTab(new URLSearchParams("source=nav")),
    "profile",
  );
  assert.equal(coerceSettingsTab("privacy"), "privacy");
  assert.equal(coerceSettingsTab("unknown"), "profile");
  assert.equal(isSettingsRecoveryTab("subscription"), true);
  assert.equal(isSettingsRecoveryTab("privacy"), false);
});

test("a Settings URL change preserves repeated query keys, encoded values, and hash", () => {
  const currentParams = new URLSearchParams(
    "tab=profile&filter=a&filter=b&redirect=%2Fdocuments%3Ffolder%3Dx",
  );

  assert.equal(
    buildSettingsTabUrl({
      pathname: "/settings",
      searchParams: currentParams,
      nextTab: "privacy",
      hash: "#security",
    }),
    "/settings?tab=privacy&filter=a&filter=b&redirect=%2Fdocuments%3Ffolder%3Dx#security",
  );
  assert.equal(
    currentParams.toString(),
    "tab=profile&filter=a&filter=b&redirect=%2Fdocuments%3Ffolder%3Dx",
  );
});

test("settings tabs replace native history while preserving query state and the hash", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/pages/SettingsClient.tsx"),
    "utf8",
  );

  assert.match(source, /resolveSettingsTab\(searchParams\)/);
  assert.match(source, /buildSettingsTabUrl\(/);
  assert.match(source, /History\.prototype\.replaceState\.call\(/);
  assert.match(
    source,
    /window\.history\.replaceState\(null,\s*"",\s*nextUrl\)/,
  );
  assert.match(source, /<Tabs\s+value=\{selectedTab\}/);
  assert.doesNotMatch(source, /router\.(?:push|replace)\(/);
});

test("a Settings tab click updates history in the click handler rather than an effect", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/pages/SettingsClient.tsx"),
    "utf8",
  );

  const handler = source.match(
    /const handleTabChange = \(next: string\): void => \{[\s\S]*?\n {2}\};/,
  )?.[0];

  assert.ok(handler, "the Settings tab handler must remain explicit");
  assert.match(handler, /buildSettingsTabUrl\(/);
  assert.match(handler, /searchParams/);
  assert.match(handler, /window\.location\.hash/);
  assert.match(handler, /commitSettingsTabUrl\(/);
  assert.match(handler, /isSettingsRecoveryTab\(/);
  assert.doesNotMatch(handler, /router\.(?:push|replace)\(/);
});

test("the Privacy panel reads stored consent without reseeding cookies on mount", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/settings/PrivacySettings.tsx"),
    "utf8",
  );

  assert.match(source, /inspectAnalyticsConsent\(/);
  assert.doesNotMatch(source, /bootstrapAnalyticsConsent\(/);
});

test("subscription recovery consumes the guarded internal return path", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/settings/SubscriptionUsage.tsx"),
    "utf8",
  );

  assert.match(source, /resolveSubscriptionReturnPath\(/);
  assert.match(source, /redirectPath=\{subscriptionReturnPath\}/);
  assert.match(source, /router\.replace\(subscriptionReturnPath\)/);
});
