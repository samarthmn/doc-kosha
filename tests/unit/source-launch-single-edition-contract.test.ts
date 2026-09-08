import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string): string => readFileSync(path, "utf8");

test("the four source-launch routes render unconditionally", () => {
  const routes = [
    ["src/app/hosted-vs-self-hosted/page.tsx", "HostedVsSelfHostPage"],
    ["src/app/security/subprocessors/page.tsx", "SubprocessorsPage"],
    ["src/app/security/questionnaire/page.tsx", "SecurityQuestionnairePage"],
    ["src/app/security/dpa/page.tsx", "DpaPage"],
  ] as const;

  for (const [path, component] of routes) {
    const source = read(path);
    assert.doesNotMatch(source, /notFound\(\)|launchFlags/);
    assert.match(source, new RegExp(`return <${component} />`));
  }
});

test("footer and sitemap entries are unconditional", () => {
  const footer = read("src/components/marketing/MarketingFooter.tsx");
  const sitemap = read("src/app/sitemap.ts");
  const entries = [
    "/hosted-vs-self-hosted",
    "/security/subprocessors",
    "/security/questionnaire",
    "/security/dpa",
  ];

  assert.doesNotMatch(footer, /isOssLaunchEnabled|launchFlags/);
  assert.doesNotMatch(sitemap, /isOssLaunchEnabled|launchFlags/);
  for (const entry of entries) {
    assert.ok(footer.includes(entry), `footer must list ${entry}`);
    assert.ok(sitemap.includes(entry), `sitemap must list ${entry}`);
  }
  assert.match(footer, /docs\.dockosha\.com/);
});

test("approved launch sections are present in their normal layouts", () => {
  const pricing = read("src/components/marketing/pages/PricingPageClient.tsx");
  const security = read("src/components/marketing/pages/SecurityPage.tsx");
  const settings = read("src/components/settings/SubscriptionUsage.tsx");

  assert.match(pricing, /<PricingEngineKeys \/>/);
  assert.match(
    security,
    /<CardTitle className="text-xl">Trust center<\/CardTitle>/,
  );
  assert.match(settings, /title="Document processing"/);
  for (const source of [pricing, security, settings]) {
    assert.doesNotMatch(source, /isOssLaunchEnabled|launchFlags/);
  }
});

test("the launch flag and helper are absent from the public source", () => {
  const retiredLaunchFlag = "NEXT_PUBLIC_" + "OSS_LAUNCH";
  assert.doesNotMatch(read("env.example"), new RegExp(retiredLaunchFlag));
  assert.doesNotMatch(read("src/lib/env.ts"), new RegExp(retiredLaunchFlag));
  assert.equal(existsSync("src/lib/launchFlags.ts"), false);
});
