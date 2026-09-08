import assert from "node:assert/strict";
import test from "node:test";

Object.assign(process.env, {
  NEXT_PUBLIC_APP_ENV: "local",
});

const nextConfigModule = import("../../next.config");

test("Next config routes relative analytics traffic through the configured rewrites", async () => {
  const { default: nextConfig } = await nextConfigModule;
  if (typeof nextConfig.rewrites !== "function") {
    assert.fail("Expected Next config to define rewrites");
  }

  const rewrites = await nextConfig.rewrites();

  assert.deepEqual(rewrites, [
    {
      source: "/ingest/static/:path*",
      destination: "https://s.dockosha.com/static/:path*",
    },
    {
      source: "/ingest/:path*",
      destination: "https://s.dockosha.com/:path*",
    },
  ]);
  assert.equal(nextConfig.skipTrailingSlashRedirect, true);
});
