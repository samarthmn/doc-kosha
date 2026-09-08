export const ANALYTICS_CONSENT_COOKIE = "dk_analytics_consent";
export const ANALYTICS_REGION_COOKIE = "dk_analytics_region";
export const ANALYTICS_CONSENT_EVENT = "dk-analytics-consent";
export const ANALYTICS_CONSENT_VERSION = 1;

export type ConsentRegion = "EU_EEA_UK" | "US" | "REST";

const EU_EEA_UK_COUNTRY_CODES = new Set<string>([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
  "GB",
]);

const normalizeCountryCode = (countryCode: string | null | undefined): string =>
  (countryCode ?? "").trim().toUpperCase();

export const normalizeConsentRegion = (
  region: string | null | undefined,
): ConsentRegion => {
  const normalized = (region ?? "").trim().toUpperCase();
  if (normalized === "US") return "US";
  if (normalized === "REST") return "REST";
  if (normalized === "EU_EEA_UK") return "EU_EEA_UK";
  return "EU_EEA_UK";
};

export const classifyRegionFromCountryCode = (
  countryCode: string | null | undefined,
): ConsentRegion => {
  const normalized = normalizeCountryCode(countryCode);

  if (!normalized) {
    // Unknown geography must fail-safe to EU/EEA/UK behavior.
    return "EU_EEA_UK";
  }

  if (normalized === "US") {
    return "US";
  }

  if (EU_EEA_UK_COUNTRY_CODES.has(normalized)) {
    return "EU_EEA_UK";
  }

  return "REST";
};
