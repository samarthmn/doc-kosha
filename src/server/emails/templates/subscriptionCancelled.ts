import { escapeHtml } from "../escape";
import { formatShortDate } from "./helpers";
import { renderBaseEmail } from "../layout";
import {
  renderButton,
  renderMutedText,
  renderParagraphHtml,
} from "../components";
import type { EmailContent } from "../types";

type SubscriptionCancelledEmailProps = {
  workspaceName: string;
  cancelEffectiveAt: string;
  settingsUrl: string;
};

export const buildSubscriptionCancelledEmail = ({
  workspaceName,
  cancelEffectiveAt,
  settingsUrl,
}: SubscriptionCancelledEmailProps): EmailContent => {
  const safeWorkspaceName = escapeHtml(workspaceName);
  const effectiveDate = new Date(cancelEffectiveAt);
  const formattedDate = Number.isNaN(effectiveDate.getTime())
    ? "soon"
    : formatShortDate(effectiveDate);
  const title = "Your DocKosha subscription is scheduled to end";
  const preheader = `Access for ${safeWorkspaceName} stays active until ${formattedDate}.`;

  const bodyHtml = [
    renderParagraphHtml(
      `Your DocKosha subscription for <strong>${safeWorkspaceName}</strong> will end on ${formattedDate}.`,
    ),
    renderParagraphHtml(
      "If you changed your mind, you can update the subscription from settings before that date.",
    ),
    renderButton("View subscription", settingsUrl),
    renderMutedText(
      "Nothing changes for your team until the current billing period ends.",
    ),
  ].join("");

  const text = [
    `Your DocKosha subscription for ${workspaceName} will end on ${formattedDate}.`,
    "If you changed your mind, you can update the subscription from settings before that date.",
    `View subscription: ${settingsUrl}`,
    "Nothing changes for your team until the current billing period ends.",
  ].join("\n");

  return {
    subject: `Your DocKosha subscription will end on ${formattedDate}`,
    html: renderBaseEmail({
      title,
      preheader,
      bodyHtml,
    }),
    text,
  };
};
