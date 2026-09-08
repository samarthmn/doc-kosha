import { escapeHtml } from "../escape";
import { renderBaseEmail } from "../layout";
import {
  renderButton,
  renderMutedText,
  renderParagraphHtml,
} from "../components";
import type { EmailContent } from "../types";

type SetupIncompleteReminderEmailProps = {
  workspaceName?: string | null;
  dashboardUrl: string;
  reminderText: string;
  subject: string;
};

export const buildSetupIncompleteReminderEmail = ({
  workspaceName,
  dashboardUrl,
  reminderText,
  subject,
}: SetupIncompleteReminderEmailProps): EmailContent => {
  const rawName = workspaceName ?? "workspace";
  const safeName = workspaceName ? escapeHtml(workspaceName) : "workspace";
  const safeReminderText = escapeHtml(reminderText);
  const title = `Finish setting up ${safeName}`;
  const preheader = safeReminderText;

  const bodyHtml = [
    renderParagraphHtml(
      `Your ${safeName} workspace is there, but setup is not finished yet.`,
    ),
    renderParagraphHtml(safeReminderText),
    renderButton("Finish workspace setup", dashboardUrl),
    renderMutedText(
      "Once that is done, you can invite collaborators, upload documents, and start the trial.",
    ),
  ].join("");

  const text = [
    `Your ${rawName} workspace is there, but setup is not finished yet.`,
    reminderText,
    `Finish setup: ${dashboardUrl}`,
    "Once that is done, you can invite collaborators, upload documents, and start the trial.",
  ].join("\n");

  return {
    subject,
    html: renderBaseEmail({
      title,
      preheader,
      bodyHtml,
    }),
    text,
  };
};
