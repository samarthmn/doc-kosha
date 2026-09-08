import assert from "node:assert/strict";
import test from "node:test";

import { shouldSendFounderHelpEmail } from "@/modules/lifecycle-email/server/founderHelpPolicy";

const activeTrialBase = {
  hasOwnerEmail: true,
  onboardingRemindersEnabled: true,
  isTrialActive: true,
  hasPaidOrCanceledSubscription: false,
};

test("founder check-in sends to an eligible new trial owner without requiring activation", () => {
  assert.equal(shouldSendFounderHelpEmail(activeTrialBase), true);
});

test("founder check-in retains delivery and subscription suppressions", () => {
  const suppressedInputs = [
    { ...activeTrialBase, hasOwnerEmail: false },
    { ...activeTrialBase, onboardingRemindersEnabled: false },
    { ...activeTrialBase, isTrialActive: false },
    { ...activeTrialBase, hasPaidOrCanceledSubscription: true },
  ];

  for (const input of suppressedInputs) {
    assert.equal(shouldSendFounderHelpEmail(input), false);
  }
});
