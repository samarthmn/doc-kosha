export const LANDING_PAGE_SOURCE = "landing_page";
export const PRICING_PAGE_SOURCE = "pricing_page";
export const LANDING_PAGE_PATH = "/";

export type LandingAttributionSource =
  typeof LANDING_PAGE_SOURCE | typeof PRICING_PAGE_SOURCE;

export type LandingAttribution = {
  source?: LandingAttributionSource;
};

type SearchParamsLike = {
  get: (key: string) => string | null;
};

const sanitizeLandingAttributionSource = (
  value: unknown,
): LandingAttributionSource | undefined =>
  value === LANDING_PAGE_SOURCE || value === PRICING_PAGE_SOURCE
    ? value
    : undefined;

export const getLandingAttribution = (
  searchParams: SearchParamsLike | null | undefined,
): LandingAttribution => {
  if (!searchParams) return {};

  const source = sanitizeLandingAttributionSource(searchParams.get("source"));

  return { source };
};

export const appendLandingAttribution = (
  params: URLSearchParams,
  attribution: { source?: unknown },
): URLSearchParams => {
  const source = sanitizeLandingAttributionSource(attribution.source);

  if (source) {
    params.set("source", source);
  }

  return params;
};

export const buildLandingAttributionProperties = (
  attribution: LandingAttribution,
): Record<string, string> => {
  const properties: Record<string, string> = {};

  const source = sanitizeLandingAttributionSource(attribution.source);
  if (source) {
    properties.source = source;
  }

  return properties;
};
