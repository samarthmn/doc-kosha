import {
  renderButton,
  renderMutedText,
  renderParagraphHtml,
} from "../components";
import { escapeHtml } from "../escape";
import { renderBaseEmail } from "../layout";
import type { EmailContent } from "../types";

type WorkspaceInviteEmailProps = {
  workspaceName: string;
  inviteUrl: string;
};

export const buildWorkspaceInviteEmail = ({
  workspaceName,
  inviteUrl,
}: WorkspaceInviteEmailProps): EmailContent => {
  const subject = `${workspaceName} invited you to DocKosha`;
  const title = "You are invited to join a workspace";
  const preheader = `Join ${workspaceName} on DocKosha.`;
  const safeWorkspaceName = escapeHtml(workspaceName);

  const bodyHtml = [
    renderParagraphHtml(
      `You have been invited to join the <strong>${safeWorkspaceName}</strong> workspace on DocKosha.`,
    ),
    renderButton("Accept invite", inviteUrl),
    renderMutedText(
      "If you did not expect this invite, you can ignore this email.",
    ),
  ].join("");

  const html = renderBaseEmail({
    title,
    preheader,
    bodyHtml,
  });

  const text = `You have been invited to join the ${workspaceName} workspace on DocKosha.\nAccept invite: ${inviteUrl}\nIf you did not expect this invite, you can ignore this email.`;

  return { subject, html, text };
};
