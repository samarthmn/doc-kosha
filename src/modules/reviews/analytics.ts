import type { ReviewSiteId } from "@/modules/reviews/config";

export const buildReviewAnalyticsProperties = (options: {
  pathname?: string | null;
  reviewSource?: string | null;
  siteId?: ReviewSiteId;
}): Record<string, string> => {
  const properties: Record<string, string> = {};

  if (options.pathname) {
    properties.pathname = options.pathname;
  }

  if (options.reviewSource) {
    properties.review_source = options.reviewSource;
  }

  if (options.siteId) {
    properties.site_id = options.siteId;
  }

  return properties;
};
