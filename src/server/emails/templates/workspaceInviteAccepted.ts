import { escapeHtml } from "../escape";
import { renderBaseEmail } from "../layout";
import {
  renderButton,
  renderMutedText,
  renderParagraphHtml,
} from "../components";
import type { EmailContent } from "../types";

type WorkspaceInviteAcceptedEmailProps = {
  workspaceName: string;
  collaboratorName?: string | null;
  collaboratorEmail?: string | null;
  membersUrl: string;
};

export const buildWorkspaceInviteAcceptedEmail = ({
  workspaceName,
  collaboratorName,
  collaboratorEmail,
  membersUrl,
}: WorkspaceInviteAcceptedEmailProps): EmailContent => {
  const safeWorkspaceName = escapeHtml(workspaceName);
  const collaboratorLabel =
    collaboratorName || collaboratorEmail || "A collaborator";
  const safeCollaboratorLabel = escapeHtml(collaboratorLabel);
  const title = "A collaborator joined your workspace";
  const preheader = `${safeCollaboratorLabel} accepted access to ${safeWorkspaceName}.`;

  const bodyHtml = [
    renderParagraphHtml(
      `<strong>${safeCollaboratorLabel}</strong> accepted access to <strong>${safeWorkspaceName}</strong>.`,
    ),
    renderParagraphHtml(
      "Visit the members tab to confirm their permissions or invite others.",
    ),
    renderButton("View members", membersUrl),
    renderMutedText("Only workspace owners receive this notification."),
  ].join("");

  const text = [
    `${collaboratorLabel} accepted access to ${workspaceName}.`,
    "Visit the members tab to confirm their permissions or invite others.",
    `View members: ${membersUrl}`,
    "Only workspace owners receive this notification.",
  ].join("\n");

  return {
    subject: "A collaborator joined your workspace",
    html: renderBaseEmail({
      title,
      preheader,
      bodyHtml,
    }),
    text,
  };
};
