import { expect, test, type APIResponse } from "@playwright/test";

const EXPECTED_ENFORCED_HEADERS = {
  "strict-transport-security": "max-age=31536000",
  "x-frame-options": "SAMEORIGIN",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
} as const;

const expectSecurityHeaders = (response: APIResponse): void => {
  const headers = response.headers();

  for (const [name, value] of Object.entries(EXPECTED_ENFORCED_HEADERS)) {
    expect(headers[name], `${name} on ${response.url()}`).toBe(value);
  }

  expect(headers["x-dns-prefetch-control"]).toBe("on");

  const reportOnlyPolicy = headers["content-security-policy-report-only"];
  expect(reportOnlyPolicy).toBeTruthy();
  expect(reportOnlyPolicy).toContain("default-src 'self'");
  expect(reportOnlyPolicy).toContain(
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  );
  expect(reportOnlyPolicy).toContain("style-src 'self' 'unsafe-inline'");
  expect(reportOnlyPolicy).toContain("img-src 'self' blob: data: https:");
  expect(reportOnlyPolicy).toContain("font-src 'self' data:");
  expect(reportOnlyPolicy).toContain("connect-src 'self'");
  expect(reportOnlyPolicy).toContain("worker-src 'self' blob:");
  expect(reportOnlyPolicy).toContain("media-src 'self' blob:");
  expect(reportOnlyPolicy).toContain(
    "frame-src 'self' data: https://demo.arcade.software",
  );
  expect(reportOnlyPolicy).toContain("object-src 'none'");
  expect(reportOnlyPolicy).toContain("base-uri 'self'");
  expect(reportOnlyPolicy).toContain("form-action 'self'");
  expect(reportOnlyPolicy).toContain("frame-ancestors 'self'");
  expect(reportOnlyPolicy).not.toContain("undefined");

  // Phase 0 observes violations only. The later human-gated enforcement task
  // must update this assertion deliberately when it flips the policy.
  expect(headers["content-security-policy"]).toBeUndefined();
};

test.describe("security response headers @core", () => {
  test("SEC-HEADERS-001 covers marketing, API, and Next static responses in report-only mode", async ({
    request,
  }) => {
    const marketingResponse = await request.get("/dockosha-facts");
    expect(marketingResponse.ok()).toBe(true);
    expectSecurityHeaders(marketingResponse);

    const apiResponse = await request.get("/api/demos/markdown");
    expect(apiResponse.status()).toBe(400);
    expectSecurityHeaders(apiResponse);

    const marketingHtml = await marketingResponse.text();
    const staticAssetPath = marketingHtml
      .match(/(?:src|href)="([^"]*\/_next\/static\/[^"]+)"/)?.[1]
      ?.replaceAll("&amp;", "&");

    expect(
      staticAssetPath,
      "the marketing response should reference a reachable Next static asset",
    ).toBeTruthy();

    if (!staticAssetPath) {
      throw new Error(
        "the marketing response did not reference a Next static asset",
      );
    }

    const staticAssetResponse = await request.get(staticAssetPath);
    expect(staticAssetResponse.ok()).toBe(true);
    expectSecurityHeaders(staticAssetResponse);
  });
});
