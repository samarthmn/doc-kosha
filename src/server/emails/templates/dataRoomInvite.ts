import {
  renderButton,
  renderMutedText,
  renderParagraphHtml,
} from "../components";
import { escapeHtml } from "../escape";
import { renderBaseEmail } from "../layout";
import type { EmailContent } from "../types";

type DataRoomInviteEmailProps = {
  workspaceName: string;
  dataRoomName: string;
  inviteUrl: string;
};

const getSafeInviteUrl = (inviteUrl: string): string | null => {
  try {
    const parsed = new URL(inviteUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

export const buildDataRoomInviteEmail = ({
  workspaceName,
  dataRoomName,
  inviteUrl,
}: DataRoomInviteEmailProps): EmailContent => {
  const safeInviteUrl = getSafeInviteUrl(inviteUrl);
  const safeWorkspaceName = escapeHtml(workspaceName);
  const safeRoomName = escapeHtml(dataRoomName);
  const subject = `${workspaceName} invited you to a data room`;
  const title = "You are invited to a data room";
  const preheader = `Join ${workspaceName} to access ${dataRoomName}.`;

  const bodyHtml = [
    renderParagraphHtml(
      `You have been invited to access <strong>${safeRoomName}</strong> in the <strong>${safeWorkspaceName}</strong> workspace on DocKosha.`,
    ),
    safeInviteUrl
      ? renderButton("Accept invite", safeInviteUrl)
      : renderMutedText("Invite link is unavailable. Please contact support."),
    renderMutedText(
      "If you did not expect this invite, you can ignore this email.",
    ),
  ].join("");

  const html = renderBaseEmail({ title, preheader, bodyHtml });
  const text = `You have been invited to access ${dataRoomName} in the ${workspaceName} workspace on DocKosha.\nAccept invite: ${safeInviteUrl ?? "Unavailable"}\nIf you did not expect this invite, you can ignore this email.`;
  return { subject, html, text };
};
