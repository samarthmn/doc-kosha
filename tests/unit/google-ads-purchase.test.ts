import assert from "node:assert/strict";
import test from "node:test";

import { buildGoogleAdsPurchaseConversion } from "@/modules/billing/googleAdsPurchase";
import {
  emitGoogleAdsFunnelConversion,
  emitGoogleAdsPurchaseConversion,
  resolveGoogleAdsFunnelConversion,
  retryGoogleAdsPurchaseTracking,
  trackGoogleAdsFunnelConversion,
} from "@/lib/analytics/googleAds";
import { loadVendor, unloadVendor } from "@/lib/analytics/consent";

test("builds a Google Ads purchase from a paid USD subscription checkout", () => {
  const conversion = buildGoogleAdsPurchaseConversion({
    id: "cs_live_paid_subscription",
    mode: "subscription",
    paymentStatus: "paid",
    amountTotal: 4900,
    currency: "usd",
  });

  assert.deepEqual(conversion, {
    value: 49,
    currency: "USD",
    transactionId: "cs_live_paid_subscription",
  });
});

test("does not count an unpaid checkout as a Google Ads purchase", () => {
  const conversion = buildGoogleAdsPurchaseConversion({
    id: "cs_live_unpaid_subscription",
    mode: "subscription",
    paymentStatus: "unpaid",
    amountTotal: 4900,
    currency: "usd",
  });

  assert.equal(conversion, null);
});

test("does not count a zero-value trial checkout as a Google Ads purchase", () => {
  const conversion = buildGoogleAdsPurchaseConversion({
    id: "cs_live_trial_subscription",
    mode: "subscription",
    paymentStatus: "no_payment_required",
    amountTotal: 0,
    currency: "usd",
  });

  assert.equal(conversion, null);
});

test("does not count a non-subscription checkout as a subscription purchase", () => {
  const conversion = buildGoogleAdsPurchaseConversion({
    id: "cs_live_payment",
    mode: "payment",
    paymentStatus: "paid",
    amountTotal: 4900,
    currency: "usd",
  });

  assert.equal(conversion, null);
});

test("fails closed when a paid checkout is not denominated in USD", () => {
  const conversion = buildGoogleAdsPurchaseConversion({
    id: "cs_live_eur_subscription",
    mode: "subscription",
    paymentStatus: "paid",
    amountTotal: 4900,
    currency: "eur",
  });

  assert.equal(conversion, null);
});

test("emits the configured purchase action with transaction-specific fields", () => {
  const calls: unknown[][] = [];
  const stored = new Map<string, string>();
  const storage = {
    getItem: (key: string): string | null => stored.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      stored.set(key, value);
    },
  };

  const emitted = emitGoogleAdsPurchaseConversion(
    {
      value: 49,
      currency: "USD",
      transactionId: "cs_live_paid_subscription",
    },
    (...args: unknown[]) => {
      calls.push(args);
    },
    storage,
  );

  assert.equal(emitted, true);
  assert.deepEqual(calls, [
    [
      "event",
      "conversion",
      {
        send_to: "AW-17991945932/N0wKCOWFn-YcEMydnYND",
        value: 49,
        currency: "USD",
        transaction_id: "cs_live_paid_subscription",
      },
    ],
  ]);
});

test("does not emit the same purchase twice in one browser session", () => {
  const calls: unknown[][] = [];
  const stored = new Map<string, string>();
  const storage = {
    getItem: (key: string): string | null => stored.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      stored.set(key, value);
    },
  };
  const conversion = {
    value: 49,
    currency: "USD" as const,
    transactionId: "cs_live_paid_subscription",
  };
  const gtag = (...args: unknown[]): void => {
    calls.push(args);
  };

  assert.equal(
    emitGoogleAdsPurchaseConversion(conversion, gtag, storage),
    true,
  );
  assert.equal(
    emitGoogleAdsPurchaseConversion(conversion, gtag, storage),
    false,
  );
  assert.equal(calls.length, 1);
});

test("retries an eligible purchase until Google Ads accepts it", async () => {
  const controller = new AbortController();
  let attempts = 0;

  const tracked = await retryGoogleAdsPurchaseTracking(
    {
      value: 49,
      currency: "USD",
      transactionId: "cs_live_delayed_google_ads",
    },
    {
      signal: controller.signal,
      maxAttempts: 5,
      retryDelayMs: 0,
      track: () => {
        attempts += 1;
        return attempts === 3;
      },
    },
  );

  assert.equal(tracked, true);
  assert.equal(attempts, 3);
});

test("stops retrying a purchase as soon as tracking is cancelled", async () => {
  const controller = new AbortController();
  let attempts = 0;

  const pending = retryGoogleAdsPurchaseTracking(
    {
      value: 49,
      currency: "USD",
      transactionId: "cs_live_cancelled_google_ads",
    },
    {
      signal: controller.signal,
      maxAttempts: 5,
      retryDelayMs: 10_000,
      track: () => {
        attempts += 1;
        return false;
      },
    },
  );

  controller.abort();

  assert.equal(await pending, false);
  assert.equal(attempts, 1);
});

test("bounds Google Ads purchase tracking retries", async () => {
  const controller = new AbortController();
  let attempts = 0;

  const tracked = await retryGoogleAdsPurchaseTracking(
    {
      value: 49,
      currency: "USD",
      transactionId: "cs_live_unavailable_google_ads",
    },
    {
      signal: controller.signal,
      maxAttempts: 3,
      retryDelayMs: 0,
      track: () => {
        attempts += 1;
        return false;
      },
    },
  );

  assert.equal(tracked, false);
  assert.equal(attempts, 3);
});

test("emits each configured Google Ads funnel conversion label", () => {
  const calls: unknown[][] = [];
  const stored = new Map<string, string>();
  const storage = {
    getItem: (key: string): string | null => stored.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      stored.set(key, value);
    },
  };
  const gtag = (...args: unknown[]): void => {
    calls.push(args);
  };

  assert.equal(
    emitGoogleAdsFunnelConversion("signup", "workspace-1", gtag, storage),
    true,
  );
  assert.equal(
    emitGoogleAdsFunnelConversion(
      "trial_started",
      "workspace-1",
      gtag,
      storage,
    ),
    true,
  );
  assert.equal(
    emitGoogleAdsFunnelConversion(
      "checkout_started",
      "workspace-1:essential:month",
      gtag,
      storage,
    ),
    true,
  );

  assert.deepEqual(calls, [
    ["event", "conversion", { send_to: "AW-17991945932/Pd1ACILQs-YcEMydnYND" }],
    ["event", "conversion", { send_to: "AW-17991945932/iPCUCKX-seYcEMydnYND" }],
    ["event", "conversion", { send_to: "AW-17991945932/s2ziCNKlsuYcEMydnYND" }],
  ]);
});

test("emits a funnel conversion when browser session storage access throws", async () => {
  const calls: unknown[][] = [];
  const originalDeploymentEnv = process.env.NEXT_PUBLIC_APP_ENV;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

  process.env.NEXT_PUBLIC_APP_ENV = "production";
  Reflect.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      gtag: (...args: unknown[]): void => {
        calls.push(args);
      },
      get sessionStorage(): Storage {
        throw new DOMException("Storage is blocked", "SecurityError");
      },
    },
  });
  await loadVendor("google_ads", { adsId: "AW-17991945932" });

  try {
    assert.equal(
      trackGoogleAdsFunnelConversion("signup", "workspace-storage-blocked"),
      true,
    );
    assert.deepEqual(calls, [
      [
        "event",
        "conversion",
        { send_to: "AW-17991945932/Pd1ACILQs-YcEMydnYND" },
      ],
    ]);
  } finally {
    await unloadVendor("google_ads", { adsId: "AW-17991945932" });
    if (originalDeploymentEnv === undefined) {
      delete process.env.NEXT_PUBLIC_APP_ENV;
    } else {
      process.env.NEXT_PUBLIC_APP_ENV = originalDeploymentEnv;
    }
    if (originalWindow) {
      Reflect.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("deduplicates one funnel action without suppressing another action", () => {
  const calls: unknown[][] = [];
  const stored = new Map<string, string>();
  const storage = {
    getItem: (key: string): string | null => stored.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      stored.set(key, value);
    },
  };
  const gtag = (...args: unknown[]): void => {
    calls.push(args);
  };

  assert.equal(
    emitGoogleAdsFunnelConversion("signup", "workspace-1", gtag, storage),
    true,
  );
  assert.equal(
    emitGoogleAdsFunnelConversion("signup", "workspace-1", gtag, storage),
    false,
  );
  assert.equal(
    emitGoogleAdsFunnelConversion(
      "trial_started",
      "workspace-1",
      gtag,
      storage,
    ),
    true,
  );
  assert.equal(calls.length, 2);
});

test("maps successful product milestones to their Google Ads funnel actions", () => {
  assert.deepEqual(
    resolveGoogleAdsFunnelConversion("onboarding_completed", {
      workspace_id: "workspace-1",
      flow: "new_workspace",
    }),
    { conversion: "signup", dedupeId: "workspace-1" },
  );
  assert.deepEqual(
    resolveGoogleAdsFunnelConversion("trial_started", {
      workspace_id: "workspace-1",
    }),
    { conversion: "trial_started", dedupeId: "workspace-1" },
  );
  assert.deepEqual(
    resolveGoogleAdsFunnelConversion("checkout_started", {
      workspace_id: "workspace-1",
      plan_id: "essential",
      billing_interval: "month",
    }),
    {
      conversion: "checkout_started",
      dedupeId: "workspace-1:essential:month",
    },
  );
});

test("does not classify invited onboarding or unrelated product events as ad conversions", () => {
  assert.equal(
    resolveGoogleAdsFunnelConversion("onboarding_completed", {
      workspace_id: "workspace-1",
      flow: "member",
    }),
    null,
  );
  assert.equal(
    resolveGoogleAdsFunnelConversion("free_plan_started", {
      workspace_id: "workspace-1",
    }),
    null,
  );
  assert.equal(
    resolveGoogleAdsFunnelConversion("checkout_started", {
      workspace_id: "workspace-1",
    }),
    null,
  );
});
