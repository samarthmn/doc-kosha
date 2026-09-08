import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveTrustedCountryCode,
  resolveTrustedRequestHost,
} from "@/server/trustedCountryResolver";

test("normalizes a trusted Vercel country code", () => {
  const headers = new Headers({ "x-vercel-ip-country": " de " });

  assert.equal(resolveTrustedCountryCode(headers), "DE");
});

test("rejects malformed and reserved Vercel country codes", () => {
  for (const value of ["", "D", "DEU", "12", "XX", "T1", "ß"]) {
    const headers = new Headers({ "x-vercel-ip-country": value });

    assert.equal(resolveTrustedCountryCode(headers), null, value);
  }
});

test("uses the authenticated Cloudflare country without falling back to Vercel", () => {
  const secret = "a-trusted-cloudflare-origin-secret";
  const headers = new Headers({
    "x-dockosha-cloudflare-origin-secret": secret,
    "x-dockosha-cloudflare-country": "in",
    "x-vercel-ip-country": "US",
  });

  assert.equal(resolveTrustedCountryCode(headers, secret), "IN");
});

test("normalizes the configured Cloudflare secret before authenticating a request", () => {
  const secret = "a-trusted-cloudflare-origin-secret";
  const headers = new Headers({
    "x-dockosha-cloudflare-origin-secret": secret,
    "x-dockosha-cloudflare-country": "IN",
    "x-vercel-ip-country": "US",
  });

  assert.equal(resolveTrustedCountryCode(headers, ` ${secret} `), "IN");
});

test("rejects an invalid authenticated Cloudflare country without falling back", () => {
  const secret = "a-trusted-cloudflare-origin-secret";
  const headers = new Headers({
    "x-dockosha-cloudflare-origin-secret": secret,
    "x-dockosha-cloudflare-country": "T1",
    "x-vercel-ip-country": "US",
  });

  assert.equal(resolveTrustedCountryCode(headers, secret), null);
});

test("ignores Cloudflare internal headers when the secret is absent or incorrect", () => {
  const headers = new Headers({
    "x-dockosha-cloudflare-origin-secret": "spoofed-secret",
    "x-dockosha-cloudflare-country": "IN",
    "x-vercel-ip-country": "US",
  });

  assert.equal(
    resolveTrustedCountryCode(headers, "a-trusted-cloudflare-origin-secret"),
    "US",
  );
  assert.equal(resolveTrustedCountryCode(headers), "US");
});

test("rejects a Cloudflare secret with a matching prefix but a different length", () => {
  const secret = "a-trusted-cloudflare-origin-secret";
  const headers = new Headers({
    "x-dockosha-cloudflare-origin-secret": `${secret}-extra`,
    "x-dockosha-cloudflare-country": "IN",
    "x-vercel-ip-country": "US",
  });

  assert.equal(resolveTrustedCountryCode(headers, secret), "US");
});

test("does not trust generic provider country or forwarded IP headers", () => {
  const headers = new Headers({
    "cf-ipcountry": "IN",
    "x-country": "DE",
    "x-appengine-country": "GB",
    "fly-client-country": "FR",
    "x-forwarded-for": "203.0.113.10",
    forwarded: "for=198.51.100.8",
  });

  assert.equal(resolveTrustedCountryCode(headers), null);
});

test("ignores a forwarded host unless the Worker origin secret authenticates it", () => {
  const secret = "a-trusted-cloudflare-origin-secret";
  const spoofedHeaders = new Headers({
    host: "app.dockosha.com",
    "cf-ray": "caller-controlled",
    "cf-connecting-ip": "203.0.113.8",
    "x-forwarded-host": "verified-customer.example",
    "x-dockosha-cloudflare-origin-secret": "spoofed-secret",
  });

  assert.equal(resolveTrustedRequestHost(spoofedHeaders, secret), null);
  assert.equal(resolveTrustedRequestHost(spoofedHeaders), null);
});

test("uses the Worker forwarded host only with the exact configured secret", () => {
  const secret = "a-trusted-cloudflare-origin-secret";
  const headers = new Headers({
    host: "app.dockosha.com:443",
    "x-forwarded-host": "Verified-Customer.Example:443",
    "x-dockosha-cloudflare-origin-secret": secret,
  });

  assert.equal(
    resolveTrustedRequestHost(headers, ` ${secret} `),
    "verified-customer.example",
  );
});
