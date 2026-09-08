import assert from "node:assert/strict";
import test from "node:test";

import {
  invalidateGuardForSubscriptionRecovery,
  resolveAuthenticatedLayoutView,
  resolveGuardAfterVerifyError,
  subscriptionGuardCoversWorkspace,
  type SubscriptionGuardResult,
} from "@/components/layouts/authenticatedLayoutView";

const allowedGuard = (
  workspaceId = "workspace-a",
): SubscriptionGuardResult => ({
  workspaceId,
  revision: 0,
  status: "allowed",
});

test("entering subscription recovery invalidates an allowed verdict", () => {
  assert.equal(
    invalidateGuardForSubscriptionRecovery(allowedGuard(), true),
    null,
  );
});

test("guard invalidation is limited to recovery routes", () => {
  const guard = allowedGuard();
  assert.strictEqual(
    invalidateGuardForSubscriptionRecovery(guard, false),
    guard,
  );
  assert.equal(invalidateGuardForSubscriptionRecovery(null, true), null);
});

test("cross-pathname navigation keeps a workspace entitlement verdict", () => {
  const guard = allowedGuard();
  assert.equal(subscriptionGuardCoversWorkspace(guard, "workspace-a"), true);
  assert.equal(
    resolveAuthenticatedLayoutView({
      isLoading: false,
      isAuthenticated: true,
      isOnboarded: true,
      hasSubscriptionGuardError: false,
      hasSubscriptionAccess: true,
    }),
    "ready",
  );
});

test("a workspace entitlement verdict never covers another workspace", () => {
  const guard = allowedGuard("workspace-a");
  assert.equal(subscriptionGuardCoversWorkspace(guard, "workspace-b"), false);
  assert.equal(subscriptionGuardCoversWorkspace(guard, null), false);
});

test("a background verify error preserves an allowed workspace verdict", () => {
  const guard = allowedGuard();
  assert.strictEqual(
    resolveGuardAfterVerifyError(guard, "workspace-a", 1),
    guard,
  );
});

test("a verify error fails closed without a matching workspace verdict", () => {
  for (const previous of [null, allowedGuard("workspace-b")]) {
    const result = resolveGuardAfterVerifyError(previous, "workspace-a", 1);
    assert.deepEqual(result, {
      workspaceId: "workspace-a",
      revision: 1,
      status: "error",
    });
    assert.equal(
      resolveAuthenticatedLayoutView({
        isLoading: false,
        isAuthenticated: true,
        isOnboarded: true,
        hasSubscriptionGuardError: true,
        hasSubscriptionAccess: false,
      }),
      "subscription-error",
    );
  }
});

test("non-allowed verdicts never grant workspace access", () => {
  for (const status of ["redirecting", "error"] as const) {
    const guard: SubscriptionGuardResult = {
      workspaceId: "workspace-a",
      revision: 0,
      status,
    };
    assert.equal(subscriptionGuardCoversWorkspace(guard, "workspace-a"), true);
    assert.equal(guard.status === "allowed", false);
  }
});

test("a missing verdict requires one verification pass", () => {
  assert.equal(subscriptionGuardCoversWorkspace(null, "workspace-a"), false);
});
