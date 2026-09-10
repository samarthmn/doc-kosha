import { buildLoginSessionEmail } from "@/server/emails/templates/loginSession";
export type LoginSessionEvent = {
  userId: string;
  sessionId: string;
  occurredAt: string;
  eligible: boolean;
  disabledAt: string | null;
  deviceLabel: string | null;
  countryCode: string | null;
};
type Claim =
  | { claimed: true; id: string; token: string }
  | { claimed: false; reason: "sent" | "in_progress" };
export type LoginSessionDeliveryDependencies = {
  loadEvent: (
    userId: string,
    sessionId: string,
  ) => Promise<LoginSessionEvent | null>;
  loadRecipient: (
    userId: string,
  ) => Promise<{ email: string; enabled: boolean } | null>;
  disable: (userId: string, sessionId: string) => Promise<void>;
  claim: (args: {
    template: string;
    toEmail: string;
    userId: string;
    dedupeKey: string;
  }) => Promise<Claim>;
  send: (args: {
    id: string;
    claimToken: string;
    toEmail: string;
    subject: string;
    html: string;
    text: string;
  }) => Promise<boolean>;
  settingsUrl: string;
};
export async function deliverLoginSession(
  userId: string,
  sessionId: string,
  deps: LoginSessionDeliveryDependencies,
): Promise<"sent" | "skipped" | "deferred"> {
  const event = await deps.loadEvent(userId, sessionId);
  if (!event || !event.eligible || event.disabledAt) return "skipped";
  const recipient = await deps.loadRecipient(userId);
  if (!recipient) return "skipped";
  if (!recipient.enabled) {
    await deps.disable(userId, sessionId);
    return "skipped";
  }
  const claim = await deps.claim({
    template: "login-session",
    toEmail: recipient.email,
    userId,
    dedupeKey: `login-session:${userId}:${sessionId}`,
  });
  if (!claim.claimed) return claim.reason === "sent" ? "sent" : "deferred";
  const email = buildLoginSessionEmail({
    occurredAt: event.occurredAt,
    deviceLabel: event.deviceLabel ?? "Unknown",
    countryCode: event.countryCode,
    settingsUrl: deps.settingsUrl,
  });
  const sent = await deps.send({
    id: claim.id,
    claimToken: claim.token,
    toEmail: recipient.email,
    ...email,
  });
  if (!sent) throw new Error("Sign-in email delivery failed");
  return "sent";
}
