import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildContactFormEmail,
  buildDataRequestEmail,
  buildDocumentViewedEmail,
  buildLinkInviteEmail,
  buildLoginSessionEmail,
  buildLinkOtpEmail,
  buildNdaSignedOwnerEmail,
  buildNdaSignedViewerEmail,
  buildSubscriptionActivatedEmail,
  buildTrialStartedEmail,
  buildWelcomeUserEmail,
  buildWorkspaceAccessChangedEmail,
  buildWorkspaceInviteEmail,
  buildWorkspaceRemovedEmail,
  buildFounderHelpEmail,
  buildPlanDowngradedEmail,
  buildPaymentFailedEmail,
  buildSetupIncompleteReminderEmail,
  buildSubscriptionCancelledEmail,
  buildTrialEndingSoonEmail,
  buildInactiveOwnerEmail,
  buildWorkspaceInviteAcceptedEmail,
} from "../../src/server/emails/templates";

const outputDir = resolve(
  process.cwd(),
  process.env.EMAIL_PREVIEW_OUT || ".email-previews",
);

mkdirSync(outputDir, { recursive: true });

const previews = [
  {
    file: "link-otp.html",
    html: buildLinkOtpEmail({ code: "123456", expiryMinutes: 10, locale: "en" })
      .html,
  },
  {
    file: "workspace-invite.html",
    html: buildWorkspaceInviteEmail({
      workspaceName: "Acme Capital",
      inviteUrl: "https://dockosha.com/auth/sign-in?invite=demo",
    }).html,
  },
  {
    file: "link-invite-document.html",
    html: buildLinkInviteEmail({
      resourceName: "Q3 Investor Update",
      resourceType: "document",
      shareUrl: "https://dockosha.com/d/demo-doc/demo-link",
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      locale: "en",
    }).html,
  },
  {
    file: "link-invite-data-room.html",
    html: buildLinkInviteEmail({
      resourceName: "Series A Data Room",
      resourceType: "data_room",
      shareUrl: "https://dockosha.com/r/demo-room/demo-link",
      locale: "en",
    }).html,
  },
  {
    file: "document-viewed.html",
    html: buildDocumentViewedEmail({
      documentTitle: "Q3 Investor Update",
      analyticsUrl:
        "https://dockosha.com/documents/demo-doc/links/demo-link/analytics",
    }).html,
  },
  {
    file: "nda-signed-viewer.html",
    html: buildNdaSignedViewerEmail({
      resourceTitle: "Series A Data Room",
      contextLabel: "data room",
      workspaceName: "Acme Capital",
    }).html,
  },
  {
    file: "nda-signed-owner.html",
    html: buildNdaSignedOwnerEmail({
      resourceTitle: "Series A Data Room",
      contextLabel: "data room",
      workspaceName: "Acme Capital",
      signerName: "Jamie Lee",
      signerEmail: "jamie@example.com",
    }).html,
  },
  {
    file: "contact-form.html",
    html: buildContactFormEmail({
      name: "Jamie Lee",
      email: "jamie@example.com",
      company: "Acme Capital",
      subject: "Enterprise plan",
      message:
        "We would like to discuss enterprise pricing.\nCall us next week.",
    }).html,
  },
  {
    file: "data-request.html",
    html: buildDataRequestEmail({
      requestType: "export",
      email: "jamie@example.com",
      userId: "user_123",
      details: "Please provide an export of my data for the last 90 days.",
    }).html,
  },
  {
    file: "welcome-user.html",
    html: buildWelcomeUserEmail({
      fullName: "Jamie Lee",
      dashboardUrl: "https://dockosha.com/dashboard",
    }).html,
  },
  {
    file: "trial-started.html",
    html: buildTrialStartedEmail({
      workspaceName: "Acme Capital",
      trialEndsAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      settingsUrl: "https://dockosha.com/settings?tab=subscription",
    }).html,
  },
  {
    file: "subscription-activated.html",
    html: buildSubscriptionActivatedEmail({
      workspaceName: "Acme Capital",
      planLabel: "Plus",
      settingsUrl: "https://dockosha.com/settings?tab=subscription",
    }).html,
  },
  {
    file: "login-new-device.html",
    html: buildLoginSessionEmail({
      occurredAt: new Date().toISOString(),
      deviceLabel: "Chrome on macOS",
      countryCode: "US",
      settingsUrl: "https://dockosha.com/settings?tab=profile",
    }).html,
  },
  {
    file: "workspace-access-changed.html",
    html: buildWorkspaceAccessChangedEmail({
      workspaceName: "Acme Capital",
      documentsAccess: "viewer",
      dataRoomsAccessAll: "none",
      settingsUrl: "https://dockosha.com/settings?tab=profile",
    }).html,
  },
  {
    file: "workspace-removed.html",
    html: buildWorkspaceRemovedEmail({
      workspaceName: "Acme Capital",
      settingsUrl: "https://dockosha.com/settings?tab=profile",
    }).html,
  },
  {
    file: "setup-incomplete-reminder.html",
    html: buildSetupIncompleteReminderEmail({
      workspaceName: "Acme Capital",
      dashboardUrl: "https://dockosha.com/dashboard",
      reminderText:
        "Finish the setup steps so your team can see the workspace.",
      subject: "Finish setting up DocKosha",
    }).html,
  },
  {
    file: "founder-help.html",
    html: buildFounderHelpEmail({
      workspaceName: "Acme Capital",
      dashboardUrl: "https://dockosha.com/dashboard",
    }).html,
  },
  {
    file: "trial-ending-soon.html",
    html: buildTrialEndingSoonEmail({
      workspaceName: "Acme Capital",
      trialEndsAt: new Date(Date.now() + 2 * 86400000).toISOString(),
      settingsUrl: "https://dockosha.com/settings?tab=subscription",
    }).html,
  },
  {
    file: "inactive-owner.html",
    html: buildInactiveOwnerEmail({
      workspaceName: "Acme Capital",
      dashboardUrl: "https://dockosha.com/dashboard",
      lastSignInAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    }).html,
  },
  {
    file: "payment-failed.html",
    html: buildPaymentFailedEmail({
      workspaceName: "Acme Capital",
      planLabel: "Plus",
      paymentSettingsUrl: "https://dockosha.com/settings?tab=subscription",
      invoiceId: "INV-12345",
    }).html,
  },
  {
    file: "subscription-cancelled.html",
    html: buildSubscriptionCancelledEmail({
      workspaceName: "Acme Capital",
      cancelEffectiveAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      settingsUrl: "https://dockosha.com/settings?tab=subscription",
    }).html,
  },
  {
    file: "plan-downgraded.html",
    html: buildPlanDowngradedEmail({
      workspaceName: "Acme Capital",
      oldPlanLabel: "Max",
      newPlanLabel: "Plus",
      settingsUrl: "https://dockosha.com/settings?tab=subscription",
    }).html,
  },
  {
    file: "workspace-invite-accepted.html",
    html: buildWorkspaceInviteAcceptedEmail({
      workspaceName: "Acme Capital",
      collaboratorName: "Jamie Lee",
      collaboratorEmail: "jamie@example.com",
      membersUrl: "https://dockosha.com/settings?tab=members",
    }).html,
  },
];

for (const preview of previews) {
  writeFileSync(join(outputDir, preview.file), preview.html, "utf8");
}

console.log(`Email previews written to ${outputDir}`);
