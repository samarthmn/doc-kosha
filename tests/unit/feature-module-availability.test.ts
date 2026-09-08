import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("normal feature modules expose the former edition capabilities", async () => {
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_APP_ENV: "local",
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-google-client-id",
    R2_ENDPOINT: "http://localhost:9000",
    R2_ACCESS_KEY_ID: "test-access-key",
    R2_SECRET_ACCESS_KEY: "test-secret-key",
    SMTP_HOST: "localhost",
    SENDER_EMAIL: "noreply@example.com",
    NOTIFICATION_SENDER_EMAIL: "notifications@example.com",
    FOUNDER_SENDER_EMAIL: "founder@example.com",
    COOKIE_SECRET: "test-cookie-secret-at-least-32-characters",
  });
  const { default: AnalyticsFilterBar } =
    await import("@/modules/advanced-analytics/AnalyticsFilterBar");
  const { default: PageTimeBarChart } =
    await import("@/modules/advanced-analytics/PageTimeBarChart");
  const { default: CountryBreakdownCard } =
    await import("@/modules/advanced-analytics/CountryBreakdownCard");
  const { buildViewerStats } =
    await import("@/modules/advanced-analytics/viewerInsights");
  const { resolveCountryFromHeaders } =
    await import("@/modules/advanced-analytics/server/requestMetadata");
  const { handleViewerInsightsExportRequest } =
    await import("@/modules/advanced-analytics/server/routes/viewerInsightsExport");
  const { canUseCustomDomain } =
    await import("@/modules/custom-domains/entitlements");
  const { handleCreateDomainRequest } =
    await import("@/modules/custom-domains/server/routes/createDomain");
  const { handleDeleteDomainRequest } =
    await import("@/modules/custom-domains/server/routes/deleteDomain");
  const { handleVerifyDomainRequest } =
    await import("@/modules/custom-domains/server/routes/verifyDomain");
  const { handleDnsRecordsRequest } =
    await import("@/modules/custom-domains/server/routes/dnsRecords");
  const { groups } = await import("@/modules/user-groups");
  const { fetchLinkAlcViewerGroupSeeds, hasLinkAlcGroupRules } =
    await import("@/modules/user-groups/server/alcGroupEvaluation");
  const { loadDocumentVersioningSettings } =
    await import("@/modules/document-versioning/client");
  const { getRetentionSettings, updateRetentionSettings } =
    await import("@/modules/document-versioning");
  assert.equal(typeof loadDocumentVersioningSettings, "function");
  assert.equal(typeof getRetentionSettings, "function");
  assert.equal(typeof updateRetentionSettings, "function");
  assert.equal(typeof canUseCustomDomain, "function");
  assert.equal(typeof handleCreateDomainRequest, "function");
  assert.equal(typeof handleDeleteDomainRequest, "function");
  assert.equal(typeof handleVerifyDomainRequest, "function");
  assert.equal(typeof handleDnsRecordsRequest, "function");
  assert.equal(typeof groups.loadManagementComponent, "function");
  assert.equal(typeof groups.loadAlcGroupPicker, "function");
  assert.equal(typeof AnalyticsFilterBar, "function");
  assert.equal(typeof PageTimeBarChart, "function");
  assert.equal(typeof CountryBreakdownCard, "function");
  assert.equal(typeof buildViewerStats, "function");
  assert.equal(typeof resolveCountryFromHeaders, "function");
  assert.equal(typeof handleViewerInsightsExportRequest, "function");
  assert.equal(typeof hasLinkAlcGroupRules, "function");
  assert.equal(typeof fetchLinkAlcViewerGroupSeeds, "function");
});

test("custom-domain entitlement preserves either qualifying billing capability", async () => {
  const { canUseCustomDomain } =
    await import("@/modules/custom-domains/entitlements");
  const subscription = (planId: "free" | "essential" | "plus") => ({
    workspaceId: "workspace",
    planId,
    billingInterval: "month" as const,
    status: "active" as const,
    provider: "manual" as const,
  });
  assert.equal(canUseCustomDomain(subscription("free")), false);
  assert.equal(canUseCustomDomain(subscription("essential")), true);
  assert.equal(canUseCustomDomain(subscription("plus")), true);
});

test("normal route sources no longer contain edition presence guards", () => {
  const route = readFileSync(
    path.join(
      process.cwd(),
      "src/app/api/settings/document-versioning/route.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(route, /isEeActive|getEe|Not found/);
});

test("source tree has no edition alias or activation flag", () => {
  const sourceRoot = path.join(process.cwd(), "src");
  const files = [
    "modules/user-groups/index.ts",
    "modules/document-versioning/index.ts",
  ];
  for (const relativeFile of files) {
    const source = readFileSync(path.join(sourceRoot, relativeFile), "utf8");
    const retiredEditionFlag = "DOCKOSHA_" + "EE_ENABLED";
    assert.doesNotMatch(
      source,
      new RegExp(`@ee-entry|${retiredEditionFlag}|isEeActive`),
    );
  }
});
