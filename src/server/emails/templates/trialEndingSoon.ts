import { escapeHtml } from "../escape";
import { formatShortDate } from "./helpers";
import { renderBaseEmail } from "../layout";
import {
  renderButton,
  renderMutedText,
  renderParagraphHtml,
} from "../components";
import type { EmailContent } from "../types";

type TrialEndingSoonEmailProps = {
  workspaceName: string;
  trialEndsAt: string;
  settingsUrl: string;
};

export const buildTrialEndingSoonEmail = ({
  workspaceName,
  trialEndsAt,
  settingsUrl,
}: TrialEndingSoonEmailProps): EmailContent => {
  const safeWorkspaceName = escapeHtml(workspaceName);
  const trialEndsDate = new Date(trialEndsAt);
  const formattedEndDate = Number.isNaN(trialEndsDate.getTime())
    ? "soon"
    : formatShortDate(trialEndsDate);
  const daysRemaining = Number.isNaN(trialEndsDate.getTime())
    ? null
    : Math.max(
        1,
        Math.ceil(
          (trialEndsDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
        ),
      );
  const daysText =
    daysRemaining === null
      ? "soon"
      : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`;
  const title = `Your DocKosha trial ends in ${daysText}`;
  const preheader = `Your Essential trial for ${safeWorkspaceName} ends ${formattedEndDate}.`;

  const bodyHtml = [
    renderParagraphHtml(
      `The 14-day Essential trial for <strong>${safeWorkspaceName}</strong> ends on <strong>${formattedEndDate}</strong>.`,
    ),
    renderParagraphHtml(
      "If you want to keep using DocKosha after that, pick a plan or add a payment method in settings.",
    ),
    renderButton("Choose a plan", settingsUrl),
    renderMutedText(
      "You can still change plans or cancel from settings before the trial ends.",
    ),
  ].join("");

  const text = [
    `The 14-day Essential trial for ${workspaceName} ends on ${formattedEndDate}.`,
    "If you want to keep using DocKosha after that, pick a plan or add a payment method in settings.",
    `Choose a plan: ${settingsUrl}`,
    "You can still change plans or cancel from settings before the trial ends.",
  ].join("\n");

  return {
    subject: `Your DocKosha trial ends in ${daysText}`,
    html: renderBaseEmail({
      title,
      preheader,
      bodyHtml,
    }),
    text,
  };
};
