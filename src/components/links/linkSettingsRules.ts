import type { LinkSettings } from "@/components/documents/LinkSettingsPanel";
import { requiresVerifiedViewerEmail } from "@/lib/publicLinkEmailPolicy";

type EmailVerificationInputs = Pick<
  LinkSettings,
  | "collectEmailsForAnalytics"
  | "dynamicWatermarkEmail"
  | "allowedEmails"
  | "blockedEmails"
  | "allowedGroupIds"
  | "blockedGroupIds"
  | "ndaRequired"
>;

/**
 * Single source of truth for when a link must require email verification
 * (OTP). ALC-gated data-room links always require it; otherwise it is derived
 * from email-dependent features unless the NDA flow already verifies email.
 */
export const deriveEmailVerification = (
  settings: EmailVerificationInputs,
  context: { resourceType: "document" | "data_room"; alcActive: boolean },
): boolean =>
  (context.resourceType === "data_room" && context.alcActive) ||
  (requiresVerifiedViewerEmail({
    collectEmailForAnalytics: settings.collectEmailsForAnalytics,
    dynamicWatermarkEmail: settings.dynamicWatermarkEmail,
    allowlistActive:
      settings.allowedEmails.length > 0 ||
      settings.blockedEmails.length > 0 ||
      settings.allowedGroupIds.length > 0 ||
      settings.blockedGroupIds.length > 0,
  }) &&
    !settings.ndaRequired);
