import { escapeHtml } from "../escape";
import { renderBaseEmail } from "../layout";
import {
  renderButton,
  renderMutedText,
  renderParagraphHtml,
} from "../components";
import type { EmailContent } from "../types";

type PlanDowngradedEmailProps = {
  workspaceName: string;
  oldPlanLabel: string;
  newPlanLabel: string;
  settingsUrl: string;
};

export const buildPlanDowngradedEmail = ({
  workspaceName,
  oldPlanLabel,
  newPlanLabel,
  settingsUrl,
}: PlanDowngradedEmailProps): EmailContent => {
  const safeWorkspaceName = escapeHtml(workspaceName);
  const safeOldPlanLabel = escapeHtml(oldPlanLabel);
  const safeNewPlanLabel = escapeHtml(newPlanLabel);
  const title = "Your DocKosha plan has changed";
  const preheader = `${safeWorkspaceName} is now on ${safeNewPlanLabel}.`;

  const bodyHtml = [
    renderParagraphHtml(
      `<strong>${safeWorkspaceName}</strong> moved from ${safeOldPlanLabel} to ${safeNewPlanLabel}.`,
    ),
    renderParagraphHtml(
      "Check the limits in settings to make sure the workspace still fits what you need.",
    ),
    renderButton("View subscription", settingsUrl),
    renderMutedText(
      "You can move back to a higher plan from the same settings page.",
    ),
  ].join("");

  const text = [
    `${workspaceName} moved from ${oldPlanLabel} to ${newPlanLabel}.`,
    "Check the limits in settings to make sure the workspace still fits what you need.",
    `View subscription: ${settingsUrl}`,
    "You can move back to a higher plan from the same settings page.",
  ].join("\n");

  return {
    subject: "Your DocKosha plan has changed",
    html: renderBaseEmail({
      title,
      preheader,
      bodyHtml,
    }),
    text,
  };
};
