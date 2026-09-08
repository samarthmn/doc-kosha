import {
  renderButton,
  renderMutedText,
  renderParagraphHtml,
} from "../components";
import { escapeHtml } from "../escape";
import { renderBaseEmail } from "../layout";
import type { EmailContent } from "../types";

type WorkspaceRemovedEmailProps = {
  workspaceName: string;
  settingsUrl: string;
};

export const buildWorkspaceRemovedEmail = ({
  workspaceName,
  settingsUrl,
}: WorkspaceRemovedEmailProps): EmailContent => {
  const safeWorkspaceName = escapeHtml(workspaceName);
  const title = "Workspace access removed";
  const preheader = `Your access to ${safeWorkspaceName} has been removed.`;

  const bodyHtml = [
    renderParagraphHtml(
      `Your access to <strong>${safeWorkspaceName}</strong> has been removed by a workspace owner.`,
    ),
    renderButton("Review account settings", settingsUrl),
    renderMutedText(
      "If you did not expect this change, contact your workspace owner.",
    ),
  ].join("");

  const html = renderBaseEmail({
    title,
    preheader,
    bodyHtml,
  });

  const text = [
    `Your access to ${workspaceName} has been removed by a workspace owner.`,
    `Review account settings: ${settingsUrl}`,
    "If you did not expect this change, contact your workspace owner.",
  ].join("\n");

  return {
    subject: "Your DocKosha workspace access was removed",
    html,
    text,
  };
};
