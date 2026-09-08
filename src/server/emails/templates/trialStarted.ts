import {
  renderButton,
  renderMutedText,
  renderParagraphHtml,
} from "../components";
import { escapeHtml } from "../escape";
import { renderBaseEmail } from "../layout";
import type { EmailContent } from "../types";
import { formatShortDate } from "./helpers";

type TrialStartedEmailProps = {
  workspaceName: string;
  trialEndsAt: string;
  settingsUrl: string;
};

export const buildTrialStartedEmail = ({
  workspaceName,
  trialEndsAt,
  settingsUrl,
}: TrialStartedEmailProps): EmailContent => {
  const safeWorkspaceName = escapeHtml(workspaceName);
  const trialEndsDate = new Date(trialEndsAt);
  const formattedEndDate = Number.isNaN(trialEndsDate.getTime())
    ? "Unknown"
    : formatShortDate(trialEndsDate);
  const title = "Your trial is live";
  const preheader = `Your Essential trial for ${safeWorkspaceName} is now running.`;

  const bodyHtml = [
    renderParagraphHtml(
      `The 14-day Essential trial for <strong>${safeWorkspaceName}</strong> is now active.`,
    ),
    renderParagraphHtml(
      `Trial end date: <strong>${formattedEndDate}</strong>.`,
    ),
    renderButton("Review subscription settings", settingsUrl),
    renderMutedText("Change or cancel your plan at any time from settings."),
  ].join("");

  const html = renderBaseEmail({
    title,
    preheader,
    bodyHtml,
  });

  const text = [
    `The 14-day Essential trial for ${workspaceName} is now active.`,
    `Trial end date: ${formattedEndDate}.`,
    `Review subscription settings: ${settingsUrl}`,
    "Change or cancel your plan at any time from settings.",
  ].join("\n");

  return {
    subject: "Your DocKosha trial has started",
    html,
    text,
  };
};
