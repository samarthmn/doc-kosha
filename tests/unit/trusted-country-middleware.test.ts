import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

const CLOUDFLARE_SECRET = "01234567890123456789012345678901";

Object.assign(process.env, {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  NEXT_PUBLIC_APP_URL: "https://dockosha.com",
  NEXT_PUBLIC_APP_ENV: "local",
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-google-client-id",
  R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "test-r2-access-key",
  R2_SECRET_ACCESS_KEY: "test-r2-secret-key",
  SMTP_HOST: "localhost",
  SENDER_EMAIL: "sender@example.com",
  NOTIFICATION_SENDER_EMAIL: "notifications@example.com",
  FOUNDER_SENDER_EMAIL: "founder@example.com",
  COOKIE_SECRET: "01234567890123456789012345678901",
});

const withCloudflareOriginSecret = async (
  secret: string | undefined,
  run: () => Promise<void>,
): Promise<void> => {
  const previousSecret = process.env.CLOUDFLARE_WORKER_ORIGIN_SECRET;
  if (secret === undefined) {
    delete process.env.CLOUDFLARE_WORKER_ORIGIN_SECRET;
  } else {
    process.env.CLOUDFLARE_WORKER_ORIGIN_SECRET = secret;
  }

  try {
    await run();
  } finally {
    if (previousSecret === undefined) {
      delete process.env.CLOUDFLARE_WORKER_ORIGIN_SECRET;
    } else {
      process.env.CLOUDFLARE_WORKER_ORIGIN_SECRET = previousSecret;
    }
  }
};

test("regional consent classifies a direct trusted Vercel request", async () => {
  const { proxy } = await import("@/request-middleware");
  const request = new NextRequest("https://dockosha.com/", {
    headers: { "x-vercel-ip-country": "US" },
  });

  const response = await proxy(request);

  assert.equal(response.cookies.get("dk_analytics_region")?.value, "US");
});

test("regional consent gives an authenticated Cloudflare country precedence over Vercel", async () => {
  await withCloudflareOriginSecret(` ${CLOUDFLARE_SECRET} `, async () => {
    const { proxy } = await import("@/request-middleware");
    const request = new NextRequest("https://dockosha.com/", {
      headers: {
        "x-dockosha-cloudflare-origin-secret": CLOUDFLARE_SECRET,
        "x-dockosha-cloudflare-country": "IN",
        "x-vercel-ip-country": "US",
      },
    });

    const response = await proxy(request);

    assert.equal(response.cookies.get("dk_analytics_region")?.value, "REST");
  });
});

test("regional consent does not fall back when authenticated Cloudflare country is missing or invalid", async () => {
  await withCloudflareOriginSecret(CLOUDFLARE_SECRET, async () => {
    const { proxy } = await import("@/request-middleware");

    for (const cloudflareCountry of [null, "T1"]) {
      const headers = new Headers({
        "x-dockosha-cloudflare-origin-secret": CLOUDFLARE_SECRET,
        "x-vercel-ip-country": "US",
      });
      if (cloudflareCountry) {
        headers.set("x-dockosha-cloudflare-country", cloudflareCountry);
      }

      const response = await proxy(
        new NextRequest("https://dockosha.com/", { headers }),
      );

      assert.equal(
        response.cookies.get("dk_analytics_region")?.value,
        "EU_EEA_UK",
        cloudflareCountry ?? "missing",
      );
    }
  });
});

test("regional consent ignores an untrusted generic provider country header", async () => {
  const { proxy } = await import("@/request-middleware");
  const request = new NextRequest("https://dockosha.com/", {
    headers: { "cf-ipcountry": "US" },
  });

  const response = await proxy(request);

  assert.equal(response.cookies.get("dk_analytics_region")?.value, "EU_EEA_UK");
});
