import { capturePostHogEvent } from "@/lib/analytics/posthog";
import { hasGrantedAnalyticsConsent } from "@/lib/analytics/consent";
import { isPostHogEnabled } from "@/lib/deployment";
import {
  resolveGoogleAdsFunnelConversion,
  trackGoogleAdsFunnelConversion,
} from "@/lib/analytics/googleAds";

type ProductEventName =
  | "landing_primary_cta_clicked"
  | "landing_secondary_cta_clicked"
  | "landing_section_cta_clicked"
  | "landing_resource_clicked"
  | "user_signed_in"
  | "onboarding_completed"
  | "document_uploaded"
  | "document_viewed"
  | "document_downloaded"
  | "data_room_created"
  | "data_room_opened"
  | "data_room_zip_downloaded"
  | "link_created"
  | "link_updated"
  | "link_deleted"
  | "watermark_created"
  | "watermark_updated"
  | "watermark_deleted"
  | "domain_added"
  | "domain_verified"
  | "domain_removed"
  | "nda_template_created"
  | "nda_template_updated"
  | "nda_template_deleted"
  | "plan_viewed"
  | "checkout_started"
  | "trial_started"
  | "free_plan_started"
  | "billing_portal_opened";

export const trackProductEvent = (
  event: ProductEventName,
  properties?: Record<string, unknown>,
): void => {
  if (typeof window === "undefined") return;

  const googleAdsConversion = resolveGoogleAdsFunnelConversion(
    event,
    properties,
  );
  if (googleAdsConversion) {
    trackGoogleAdsFunnelConversion(
      googleAdsConversion.conversion,
      googleAdsConversion.dedupeId,
    );
  }

  if (!isPostHogEnabled()) return;
  if (!hasGrantedAnalyticsConsent()) return;
  void capturePostHogEvent({ event, properties });
};
