import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.join(process.cwd(), "src/components/settings/ProfileSettings.tsx"),
  "utf8",
);

test("Settings Domain summary reads the stored custom hostname, not the retired subdomain label", () => {
  const domainLookup = source.match(
    /from\("custom_domains"\)[\s\S]{0,400}maybeSingle\(\)/,
  )?.[0];

  assert.ok(
    domainLookup,
    "ProfileSettings must look up the workspace custom domain row",
  );
  assert.match(domainLookup, /\.select\("domain,status"\)/);
  assert.doesNotMatch(domainLookup, /subdomain_label/);
  assert.match(source, /row\?\.status === "verified" && row\?\.domain/);
  assert.match(source, /setVerifiedDomain\(row\.domain\)/);
  assert.doesNotMatch(source, /subdomain_label/);
  assert.doesNotMatch(source, /setVerifiedDomain\(`\$\{row\.subdomain_label\}/);
});
