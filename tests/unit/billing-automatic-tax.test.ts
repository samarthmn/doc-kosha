import assert from "node:assert/strict";
import test from "node:test";

import Stripe from "stripe";

import { shouldRetryCheckoutWithoutAutomaticTax } from "../../src/modules/billing/server/automaticTax";

const invalidRequestError = (
  overrides: Partial<Stripe.StripeRawError> = {},
): Stripe.errors.StripeInvalidRequestError =>
  new Stripe.errors.StripeInvalidRequestError({
    type: "invalid_request_error",
    message: "Stripe rejected the checkout request",
    ...overrides,
  });

test("retries checkout without automatic tax when Stripe Tax settings are pending", async () => {
  const error = invalidRequestError();

  const shouldRetry = await shouldRetryCheckoutWithoutAutomaticTax(
    error,
    async () => ({
      status: "pending",
    }),
  );

  assert.equal(shouldRetry, true);
});

test("does not treat an unrelated invalid request as an automatic-tax configuration error when Stripe Tax is active", async () => {
  const error = invalidRequestError();

  const shouldRetry = await shouldRetryCheckoutWithoutAutomaticTax(
    error,
    async () => ({
      status: "active",
    }),
  );

  assert.equal(shouldRetry, false);
});

test("does not reclassify unrelated structured Stripe errors while Tax is pending", async () => {
  const errors = [
    invalidRequestError({ code: "resource_missing" }),
    invalidRequestError({ param: "line_items[0][price]" }),
  ];
  let settingsLoads = 0;

  for (const error of errors) {
    const shouldRetry = await shouldRetryCheckoutWithoutAutomaticTax(
      error,
      async () => {
        settingsLoads += 1;
        return { status: "pending" };
      },
    );

    assert.equal(shouldRetry, false);
  }

  assert.equal(settingsLoads, 0);
});

test("uses Stripe's structured automatic-tax fields without loading Tax settings", async () => {
  const errors = [
    invalidRequestError({ code: "customer_tax_location_invalid" }),
    invalidRequestError({ code: "invalid_tax_location" }),
    invalidRequestError({ param: "automatic_tax" }),
    invalidRequestError({ param: "automatic_tax[enabled]" }),
  ];
  let settingsLoads = 0;

  for (const error of errors) {
    const shouldRetry = await shouldRetryCheckoutWithoutAutomaticTax(
      error,
      async () => {
        settingsLoads += 1;
        return { status: "active" };
      },
    );

    assert.equal(shouldRetry, true);
  }

  assert.equal(settingsLoads, 0);
});

test("does not retry non-Stripe errors or hide a Tax settings lookup failure", async () => {
  const settingsLoader = async (): Promise<{ status: "pending" }> => {
    throw new Error("Tax settings unavailable");
  };

  assert.equal(
    await shouldRetryCheckoutWithoutAutomaticTax(
      new Error("application failure"),
      settingsLoader,
    ),
    false,
  );
  assert.equal(
    await shouldRetryCheckoutWithoutAutomaticTax(
      invalidRequestError(),
      settingsLoader,
    ),
    false,
  );
});
