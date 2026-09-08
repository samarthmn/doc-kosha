import assert from "node:assert/strict";
import test from "node:test";

import worker from "../../workers/custom-domains/src/index";

const workerEnv = {
  APP_ORIGIN: "https://app.dockosha.com",
  ENVIRONMENT: "test",
  CLOUDFLARE_WORKER_ORIGIN_SECRET: "worker-origin-secret",
};

const requestWithCloudflareCountry = (country: string | undefined): Request => {
  const request = new Request("https://customer.example/d/workspace-link", {
    headers: {
      "cf-ipcountry": "ZZ",
      "x-dockosha-cloudflare-country": "caller-supplied-country",
      "x-dockosha-cloudflare-origin-secret": "caller-supplied-secret",
    },
  });

  Object.defineProperty(request, "cf", {
    value: { country },
  });

  return request;
};

test("Worker forwards only normalized valid Cloudflare runtime country metadata", async (t) => {
  const originalFetch = globalThis.fetch;
  const forwardedRequests: Request[] = [];

  globalThis.fetch = async (
    input: URL | RequestInfo,
    init?: RequestInit,
  ): Promise<Response> => {
    forwardedRequests.push(
      input instanceof Request ? input : new Request(input, init),
    );
    return new Response("ok");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  for (const country of ["in", "XX", "T1", "invalid", "ß", undefined]) {
    const response = await worker.fetch(
      requestWithCloudflareCountry(country),
      workerEnv,
    );
    assert.equal(response.status, 200);
  }

  assert.deepEqual(
    forwardedRequests.map((request) => ({
      country: request.headers.get("x-dockosha-cloudflare-country"),
      originSecret: request.headers.get("x-dockosha-cloudflare-origin-secret"),
      forwardedHost: request.headers.get("x-forwarded-host"),
    })),
    [
      {
        country: "IN",
        originSecret: "worker-origin-secret",
        forwardedHost: "customer.example",
      },
      {
        country: null,
        originSecret: "worker-origin-secret",
        forwardedHost: "customer.example",
      },
      {
        country: null,
        originSecret: "worker-origin-secret",
        forwardedHost: "customer.example",
      },
      {
        country: null,
        originSecret: "worker-origin-secret",
        forwardedHost: "customer.example",
      },
      {
        country: null,
        originSecret: "worker-origin-secret",
        forwardedHost: "customer.example",
      },
      {
        country: null,
        originSecret: "worker-origin-secret",
        forwardedHost: "customer.example",
      },
    ],
  );
});

test("Worker authenticates app-origin pass-through requests", async (t) => {
  const originalFetch = globalThis.fetch;
  const forwardedRequests: Request[] = [];

  globalThis.fetch = async (
    input: URL | RequestInfo,
    init?: RequestInit,
  ): Promise<Response> => {
    forwardedRequests.push(
      input instanceof Request ? input : new Request(input, init),
    );
    return new Response("ok");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  for (const country of ["br", "XX"]) {
    const request = new Request(
      "https://app.dockosha.com/api/public/links/file",
      {
        headers: {
          "cf-ipcountry": "ZZ",
          "x-dockosha-cloudflare-country": "caller-supplied-country",
          "x-dockosha-cloudflare-origin-secret": "caller-supplied-secret",
          "x-forwarded-host": "caller-supplied-host.example",
        },
      },
    );
    Object.defineProperty(request, "cf", {
      value: { country },
    });

    const response = await worker.fetch(request, workerEnv);

    assert.equal(response.status, 200);
  }

  assert.deepEqual(
    forwardedRequests.map((request) => ({
      country: request.headers.get("x-dockosha-cloudflare-country"),
      originSecret: request.headers.get("x-dockosha-cloudflare-origin-secret"),
      forwardedHost: request.headers.get("x-forwarded-host"),
    })),
    [
      {
        country: "BR",
        originSecret: "worker-origin-secret",
        forwardedHost: null,
      },
      {
        country: null,
        originSecret: "worker-origin-secret",
        forwardedHost: null,
      },
    ],
  );
});
