import assert from "node:assert/strict";
import test from "node:test";

import Stripe from "stripe";

Object.assign(process.env, {
  NEXT_PUBLIC_APP_ENV: "local",
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy",
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: "dummy",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  R2_ACCESS_KEY_ID: "dummy",
  R2_SECRET_ACCESS_KEY: "dummy",
  R2_ENDPOINT: "http://localhost:9000",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  SENDER_EMAIL: "t@t.co",
  NOTIFICATION_SENDER_EMAIL: "t@t.co",
  FOUNDER_SENDER_EMAIL: "t@t.co",
  COOKIE_SECRET: "0123456789abcdef0123456789abcdef",
});

const subscriptionSync =
  import("../../src/modules/billing/server/subscriptionSync");

const createCustomer = (id: string): Stripe.Customer => ({
  id,
  object: "customer",
  balance: 0,
  created: 1_722_470_400,
  default_source: null,
  description: null,
  email: "owner@example.com",
  invoice_settings: {
    custom_fields: null,
    default_payment_method: null,
    footer: null,
    rendering_options: null,
  },
  livemode: false,
  metadata: {},
  shipping: null,
});

const searchResult = (
  data: Stripe.Customer[],
): Stripe.ApiSearchResult<Stripe.Customer> => ({
  object: "search_result",
  data,
  has_more: false,
  url: "/v1/customers/search",
  next_page: null,
});

const listResult = (
  data: Stripe.Customer[],
): Stripe.ApiList<Stripe.Customer> => ({
  object: "list",
  data,
  has_more: false,
  url: "/v1/customers",
});

test("skips a stale deleted search hit and returns the next live customer", async (t) => {
  const staleCustomer = createCustomer("cus_stale");
  const liveCustomer = createCustomer("cus_live");
  const stripe = new Stripe("sk_test_unit");

  t.mock.method(stripe.customers, "search", async () =>
    searchResult([staleCustomer, liveCustomer]),
  );
  t.mock.method(stripe.customers, "retrieve", async (customerId: string) => {
    if (customerId === staleCustomer.id) {
      return {
        id: staleCustomer.id,
        object: "customer",
        deleted: true,
      } satisfies Stripe.DeletedCustomer;
    }
    return liveCustomer;
  });
  t.mock.method(stripe.customers, "list", async () => listResult([]));

  const { findStripeCustomerByEmail } = await subscriptionSync;
  const result = await findStripeCustomerByEmail(stripe, "OWNER@EXAMPLE.COM");

  assert.equal(result, liveCustomer);
});

test("falls through to the authoritative list when a search hit is missing", async (t) => {
  const missingCustomer = createCustomer("cus_missing");
  const listedCustomer = createCustomer("cus_listed");
  const stripe = new Stripe("sk_test_unit");

  t.mock.method(stripe.customers, "search", async () =>
    searchResult([missingCustomer]),
  );
  t.mock.method(stripe.customers, "retrieve", async () => {
    throw new Error("No such customer");
  });
  t.mock.method(stripe.customers, "list", async () =>
    listResult([listedCustomer]),
  );

  const { findStripeCustomerByEmail } = await subscriptionSync;
  const result = await findStripeCustomerByEmail(stripe, "owner@example.com");

  assert.equal(result, listedCustomer);
});

test("still returns a live customer found by search", async (t) => {
  const liveCustomer = createCustomer("cus_live");
  const stripe = new Stripe("sk_test_unit");

  t.mock.method(stripe.customers, "search", async () =>
    searchResult([liveCustomer]),
  );
  t.mock.method(stripe.customers, "retrieve", async () => liveCustomer);
  t.mock.method(stripe.customers, "list", async () => {
    throw new Error("list fallback should not run");
  });

  const { findStripeCustomerByEmail } = await subscriptionSync;
  const result = await findStripeCustomerByEmail(stripe, "owner@example.com");

  assert.equal(result, liveCustomer);
});
