import {
  renderButton,
  renderMutedText,
  renderParagraphHtml,
} from "../components";
import { escapeHtml } from "../escape";
import { renderBaseEmail } from "../layout";
import type { EmailContent } from "../types";

type SubscriptionActivatedEmailProps = {
  workspaceName: string;
  planLabel: string;
  settingsUrl: string;
};

export const buildSubscriptionActivatedEmail = ({
  workspaceName,
  planLabel,
  settingsUrl,
}: SubscriptionActivatedEmailProps): EmailContent => {
  const safeWorkspaceName = escapeHtml(workspaceName);
  const safePlanLabel = escapeHtml(planLabel);
  const title = "Subscription activated";
  const preheader = `${safeWorkspaceName} is now on ${safePlanLabel}.`;

  const bodyHtml = [
    renderParagraphHtml(
      `Your <strong>${safeWorkspaceName}</strong> workspace is now on the <strong>${safePlanLabel}</strong> plan.`,
    ),
    renderButton("View subscription", settingsUrl),
    renderMutedText(
      "If you did not make this change, contact your workspace owner immediately.",
    ),
  ].join("");

  const html = renderBaseEmail({
    title,
    preheader,
    bodyHtml,
  });

  const text = [
    `Your ${workspaceName} workspace is now on the ${planLabel} plan.`,
    `View subscription: ${settingsUrl}`,
    "If you did not make this change, contact your workspace owner immediately.",
  ].join("\n");

  return {
    subject: `DocKosha ${planLabel} plan is now active`,
    html,
    text,
  };
};
