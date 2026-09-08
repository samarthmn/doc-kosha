import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDefaultAnalyticsConsent,
  reconcileAnalyticsConsentRegion,
  type AnalyticsConsent,
} from "@/lib/analytics/consent";

test("EU reclassification disables an auto-granted default and requires opt-in", () => {
  const seeded = buildDefaultAnalyticsConsent({
    region: "US",
    gpcSeen: false,
  });

  const result = reconcileAnalyticsConsentRegion({
    consent: seeded,
    region: "EU_EEA_UK",
    gpcEnabled: false,
  });

  assert.equal(result.consent.analytics, false);
  assert.equal(result.consent.replay, false);
  assert.equal(result.consent.decision, "default");
  assert.equal(result.requiresEuConsent, true);
});

test("EU reclassification preserves an explicit user choice", () => {
  const explicitOptIn: AnalyticsConsent = {
    ...buildDefaultAnalyticsConsent({ region: "US", gpcSeen: false }),
    decision: "explicit",
  };

  const result = reconcileAnalyticsConsentRegion({
    consent: explicitOptIn,
    region: "EU_EEA_UK",
    gpcEnabled: false,
  });

  assert.equal(result.consent.analytics, true);
  assert.equal(result.consent.replay, true);
  assert.equal(result.consent.decision, "explicit");
  assert.equal(result.requiresEuConsent, false);
});
