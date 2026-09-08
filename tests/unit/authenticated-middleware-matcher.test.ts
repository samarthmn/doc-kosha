import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("every authenticated route prefix runs middleware even when a slug contains a dot", () => {
  const proxyPath = path.join(process.cwd(), "src/proxy.ts");
  assert.ok(
    existsSync(proxyPath),
    "the Next proxy convention must live beside src/app so it executes",
  );
  const source = readFileSync(proxyPath, "utf8");
  const authenticatedPrefixes = [
    "billing",
    "branding",
    "custom-domain",
    "custom-watermarks",
    "dashboard",
    "data-rooms",
    "documents",
    "nda-templates",
    "settings",
    "testimonial",
    "user-groups",
  ];

  for (const prefix of authenticatedPrefixes) {
    assert.ok(
      source.includes(`"/${prefix}/:path*"`),
      `${prefix} must bypass the broad static-asset dot exclusion`,
    );
  }
});
