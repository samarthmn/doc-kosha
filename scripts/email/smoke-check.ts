import assert from "node:assert/strict";
import {
  buildContactFormEmail,
  buildDataRequestEmail,
  buildDocumentViewedEmail,
  buildLinkInviteEmail,
  buildLoginNewDeviceEmail,
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

const assertIncludes = (value: string, expected: string, label: string) => {
  assert.ok(value.includes(expected), `${label} should include "${expected}"`);
};

const assertNotIncludes = (value: string, expected: string, label: string) => {
  assert.ok(
    !value.includes(expected),
    `${label} should not include "${expected}"`,
  );
};

const assertNonEmpty = (value: string, label: string) => {
  assert.ok(value.trim().length > 0, `${label} should not be empty`);
};

const otp = buildLinkOtpEmail({
  code: "654321",
  expiryMinutes: 10,
  locale: "en",
});
assertNonEmpty(otp.subject, "OTP subject");
assertIncludes(otp.html, "654321", "OTP html");
assertIncludes(otp.text, "654321", "OTP text");

const workspaceInvite = buildWorkspaceInviteEmail({
  workspaceName: "Acme Capital",
  inviteUrl: "https://dockosha.com/auth/sign-in?invite=demo",
});
assertIncludes(workspaceInvite.html, "Acme Capital", "Workspace invite html");
assertIncludes(
  workspaceInvite.text,
  "https://dockosha.com/auth/sign-in?invite=demo",
  "Workspace invite text",
);

const linkInvite = buildLinkInviteEmail({
  resourceName: "Q3 Investor Update",
  resourceType: "document",
  shareUrl: "https://dockosha.com/d/demo-doc/demo-link",
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  locale: "en",
});
assertIncludes(linkInvite.html, "Q3 Investor Update", "Link invite html");
assertIncludes(
  linkInvite.text,
  "https://dockosha.com/d/demo-doc/demo-link",
  "Link invite text",
);

const viewed = buildDocumentViewedEmail({
  documentTitle: "Q3 Investor Update",
  analyticsUrl:
    "https://dockosha.com/documents/demo-doc/links/demo-link/analytics",
});
assertIncludes(viewed.html, "Q3 Investor Update", "Viewed html");
assertIncludes(viewed.text, "analytics", "Viewed text");

const ndaViewer = buildNdaSignedViewerEmail({
  resourceTitle: "Series A Data Room",
  contextLabel: "data room",
  workspaceName: "Acme Capital",
});
assertIncludes(ndaViewer.html, "Series A Data Room", "NDA viewer html");
assertIncludes(ndaViewer.text, "NDA", "NDA viewer text");

const ndaOwner = buildNdaSignedOwnerEmail({
  resourceTitle: "Series A Data Room",
  contextLabel: "data room",
  workspaceName: "Acme Capital",
  signerName: "Jamie Lee",
  signerEmail: "jamie@example.com",
});
assertIncludes(ndaOwner.html, "Jamie Lee", "NDA owner html");
assertIncludes(ndaOwner.text, "jamie@example.com", "NDA owner text");

const contact = buildContactFormEmail({
  name: "Jamie Lee",
  email: "jamie@example.com",
  company: "Acme Capital",
  subject: "Enterprise plan",
  message: "Please contact me.",
});
assertIncludes(contact.html, "Contact form", "Contact html");
assertIncludes(contact.text, "Please contact me.", "Contact text");

const dataRequest = buildDataRequestEmail({
  requestType: "export",
  email: "jamie@example.com",
  userId: "user_123",
  details: "Export my data.",
});
assertIncludes(dataRequest.html, "Data request", "Data request html");
assertIncludes(dataRequest.text, "Export my data.", "Data request text");

const welcome = buildWelcomeUserEmail({
  fullName: "Jamie Lee",
  dashboardUrl: "https://dockosha.com/dashboard",
});
assertIncludes(welcome.html, "Welcome", "Welcome html");
assertIncludes(welcome.text, "dashboard", "Welcome text");

const trialStarted = buildTrialStartedEmail({
  workspaceName: "Acme Capital",
  trialEndsAt: new Date(Date.now() + 14 * 86400000).toISOString(),
  settingsUrl: "https://dockosha.com/settings?tab=subscription",
});
assertIncludes(trialStarted.html, "14-day Essential trial", "Trial html");
assertIncludes(trialStarted.text, "Trial end date", "Trial text");

const subscriptionActivated = buildSubscriptionActivatedEmail({
  workspaceName: "Acme Capital",
  planLabel: "Plus",
  settingsUrl: "https://dockosha.com/settings?tab=subscription",
});
assertIncludes(
  subscriptionActivated.html,
  "Acme Capital",
  "Subscription activated html",
);
assertIncludes(
  subscriptionActivated.text,
  "Plus",
  "Subscription activated text",
);

const loginNewDevice = buildLoginNewDeviceEmail({
  occurredAt: new Date().toISOString(),
  deviceLabel: "Chrome on macOS",
  countryCode: "US",
  settingsUrl: "https://dockosha.com/settings?tab=profile",
});
assertIncludes(loginNewDevice.html, "new device", "Login alert html");
assertIncludes(loginNewDevice.text, "Country: US", "Login alert text");

const workspaceAccessChanged = buildWorkspaceAccessChangedEmail({
  workspaceName: "Acme Capital",
  documentsAccess: "viewer",
  dataRoomsAccessAll: "none",
  settingsUrl: "https://dockosha.com/settings?tab=profile",
});
assertIncludes(
  workspaceAccessChanged.html,
  "Acme Capital",
  "Workspace changed html",
);
assertIncludes(
  workspaceAccessChanged.text,
  "Documents: Viewer",
  "Workspace changed text",
);

const workspaceRemoved = buildWorkspaceRemovedEmail({
  workspaceName: "Acme Capital",
  settingsUrl: "https://dockosha.com/settings?tab=profile",
});
assertIncludes(workspaceRemoved.html, "removed", "Workspace removed html");
assertIncludes(
  workspaceRemoved.text,
  "Review account settings",
  "Workspace removed text",
);

const setupReminder = buildSetupIncompleteReminderEmail({
  workspaceName: "Acme Capital",
  dashboardUrl: "https://dockosha.com/dashboard",
  reminderText: "Finish the setup steps so your team can see the workspace.",
  subject: "Finish setting up DocKosha",
});
assertIncludes(setupReminder.html, "setup steps", "Setup reminder html");
assertIncludes(setupReminder.text, "Finish setup", "Setup reminder text");

const founderHelp = buildFounderHelpEmail({
  workspaceName: "Acme Capital",
  dashboardUrl: "https://dockosha.com/dashboard",
});
assertIncludes(founderHelp.html, "Samarth", "Founder help html");
assertIncludes(founderHelp.text, "reply", "Founder help text");

const trialEndingSoon = buildTrialEndingSoonEmail({
  workspaceName: "Acme Capital",
  trialEndsAt: new Date(Date.now() + 2 * 86400000).toISOString(),
  settingsUrl: "https://dockosha.com/settings?tab=subscription",
});
assertIncludes(trialEndingSoon.html, "ends on", "Trial ending html");
assertIncludes(trialEndingSoon.text, "Choose a plan", "Trial ending text");

const inactiveOwner = buildInactiveOwnerEmail({
  workspaceName: "Acme Capital",
  dashboardUrl: "https://dockosha.com/dashboard",
  lastSignInAt: new Date(Date.now() - 8 * 86400000).toISOString(),
});
assertIncludes(inactiveOwner.html, "have not seen", "Inactive owner html");
assertIncludes(inactiveOwner.text, "have not seen", "Inactive owner text");

const paymentFailed = buildPaymentFailedEmail({
  workspaceName: "Acme Capital",
  planLabel: "Plus",
  paymentSettingsUrl: "https://dockosha.com/settings?tab=subscription",
  invoiceId: "INV-12345",
});
assertIncludes(paymentFailed.html, "unable to charge", "Payment failed html");
assertIncludes(paymentFailed.text, "Invoice INV-12345", "Payment failed text");

const subscriptionCancelled = buildSubscriptionCancelledEmail({
  workspaceName: "Acme Capital",
  cancelEffectiveAt: new Date(Date.now() + 14 * 86400000).toISOString(),
  settingsUrl: "https://dockosha.com/settings?tab=subscription",
});
assertIncludes(subscriptionCancelled.html, "will end on", "Cancelled html");
assertIncludes(subscriptionCancelled.text, "will end on", "Cancelled text");

const planDowngraded = buildPlanDowngradedEmail({
  workspaceName: "Acme Capital",
  oldPlanLabel: "Max",
  newPlanLabel: "Plus",
  settingsUrl: "https://dockosha.com/settings?tab=subscription",
});
assertIncludes(planDowngraded.html, "moved from", "Plan downgraded html");
assertIncludes(planDowngraded.text, "moved from", "Plan downgraded text");

const inviteAccepted = buildWorkspaceInviteAcceptedEmail({
  workspaceName: "Acme Capital",
  collaboratorName: "<b>Jamie Lee</b>",
  collaboratorEmail: "jamie@example.com",
  membersUrl: "https://dockosha.com/settings?tab=members",
});
assertIncludes(
  inviteAccepted.html,
  "&lt;b&gt;Jamie Lee&lt;/b&gt;",
  "Invite accepted html escapes collaborator name",
);
assertNotIncludes(
  inviteAccepted.html,
  "<b>Jamie Lee</b>",
  "Invite accepted html raw collaborator name",
);
assertIncludes(inviteAccepted.text, "View members", "Invite accepted text");

console.log("Email template smoke checks passed.");
