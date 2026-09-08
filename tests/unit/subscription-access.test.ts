import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSubscriptionAccessRedirect,
  isSubscriptionRecoveryPath,
  resolveSubscriptionReturnPath,
  sanitizeInternalReturnPath,
} from "@/modules/billing/subscriptionAccess";
import { hasEntitlementNow } from "@/modules/billing/entitlements";
import type { WorkspaceSubscriptionLike } from "@/modules/billing/types";

test("only the subscription settings tab is exempt from the entitlement guard", () => {
  assert.equal(
    isSubscriptionRecoveryPath(
      "/settings?tab=subscription&planPicker=1&redirect=%2Fdocuments",
    ),
    true,
  );
  assert.equal(isSubscriptionRecoveryPath("/settings"), false);
  assert.equal(isSubscriptionRecoveryPath("/settings?tab=profile"), false);
  assert.equal(
    isSubscriptionRecoveryPath("/settings?tab=notifications"),
    false,
  );
});

test("checkout completion and cancellation routes remain available for recovery", () => {
  assert.equal(
    isSubscriptionRecoveryPath(
      "/dashboard?billing_success=1&session_id=checkout",
    ),
    true,
  );
  assert.equal(
    isSubscriptionRecoveryPath("/dashboard?billing_success=true"),
    true,
  );
  assert.equal(
    isSubscriptionRecoveryPath("/dashboard?billing_success=0"),
    false,
  );
  assert.equal(
    isSubscriptionRecoveryPath("/billing/checkout/canceled?state=failed"),
    true,
  );
  assert.equal(isSubscriptionRecoveryPath("/documents"), false);
});

test("subscription redirect preserves a safe internal return path", () => {
  const result = buildSubscriptionAccessRedirect(
    "/settings?tab=profile&source=nav",
  );
  const redirect = new URL(result, "https://dockosha.test");

  assert.equal(redirect.pathname, "/settings");
  assert.equal(redirect.searchParams.get("tab"), "subscription");
  assert.equal(redirect.searchParams.get("planPicker"), "1");
  assert.equal(
    redirect.searchParams.get("redirect"),
    "/settings?tab=profile&source=nav",
  );
});

test("subscription redirect rejects external or protocol-relative return paths", () => {
  for (const unsafePath of [
    "https://example.com/account",
    "//example.com/account",
    "/\\example.com/account",
  ]) {
    const redirect = new URL(
      buildSubscriptionAccessRedirect(unsafePath),
      "https://dockosha.test",
    );
    assert.equal(redirect.searchParams.get("redirect"), "/");
  }
});

test("subscription recovery resolves only safe internal return paths", () => {
  assert.equal(
    resolveSubscriptionReturnPath("/documents?folder=customer"),
    "/documents?folder=customer",
  );

  for (const unsafePath of [
    null,
    "https://example.com/account",
    "//example.com/account",
    "/\\example.com/account",
  ]) {
    assert.equal(
      resolveSubscriptionReturnPath(unsafePath),
      "/settings?tab=subscription",
    );
  }
});

test("shared billing return-path sanitizer rejects URL parser escape forms", () => {
  assert.equal(
    sanitizeInternalReturnPath("/dashboard?billing_success=1"),
    "/dashboard?billing_success=1",
  );
  assert.equal(sanitizeInternalReturnPath("/\\example.com/account"), null);
  assert.equal(sanitizeInternalReturnPath("//example.com/account"), null);
  assert.equal(sanitizeInternalReturnPath("https://example.com/account"), null);
});

test("client entitlement semantics match the database status and date policy", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");
  const base: WorkspaceSubscriptionLike = {
    workspaceId: "workspace-id",
    planId: "essential",
    billingInterval: "month",
    status: "active",
    provider: "stripe",
  };

  const cases: Array<{
    label: string;
    subscription: WorkspaceSubscriptionLike | null;
    expected: boolean;
  }> = [
    { label: "missing", subscription: null, expected: false },
    {
      label: "active without fixed end",
      subscription: { ...base, currentPeriodEndsAt: null },
      expected: true,
    },
    {
      label: "active future period",
      subscription: {
        ...base,
        currentPeriodEndsAt: "2026-07-29T12:00:00.000Z",
      },
      expected: true,
    },
    {
      label: "scheduled cancellation before period end",
      subscription: {
        ...base,
        cancelAtPeriodEnd: true,
        currentPeriodEndsAt: "2026-07-29T12:00:00.000Z",
      },
      expected: true,
    },
    {
      label: "active expired period",
      subscription: {
        ...base,
        currentPeriodEndsAt: "2026-07-27T12:00:00.000Z",
      },
      expected: false,
    },
    {
      label: "active trial",
      subscription: {
        ...base,
        status: "trialing",
        trialEndsAt: "2026-07-29T12:00:00.000Z",
      },
      expected: true,
    },
    {
      label: "expired trial",
      subscription: {
        ...base,
        status: "trialing",
        trialEndsAt: "2026-07-27T12:00:00.000Z",
      },
      expected: false,
    },
    {
      label: "trial without an end",
      subscription: { ...base, status: "trialing", trialEndsAt: null },
      expected: false,
    },
    ...(["past_due", "canceled", "expired", "incomplete", "none"] as const).map(
      (status) => ({
        label: status,
        subscription: { ...base, status },
        expected: false,
      }),
    ),
  ];

  for (const item of cases) {
    assert.equal(
      hasEntitlementNow(item.subscription, now),
      item.expected,
      item.label,
    );
  }
});
