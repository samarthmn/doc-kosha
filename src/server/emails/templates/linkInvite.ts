import {
  renderButton,
  renderMutedText,
  renderParagraphHtml,
} from "../components";
import { escapeHtml } from "../escape";
import { renderBaseEmail } from "../layout";
import type { EmailContent } from "../types";
import {
  formatPublicDate,
  getPublicMessages,
} from "@/modules/public-links/i18n";
import type { PublicLanguage } from "@/modules/public-links/types";

type LinkInviteEmailProps = {
  resourceName: string;
  resourceType: "document" | "data_room";
  shareUrl: string;
  expiresAt?: string | null;
  locale: PublicLanguage;
};

export const buildLinkInviteEmail = ({
  resourceName,
  resourceType,
  shareUrl,
  expiresAt,
  locale,
}: LinkInviteEmailProps): EmailContent => {
  const messages = getPublicMessages(locale).emails;
  const subject =
    resourceType === "document"
      ? messages.linkInviteSubjectDocument(resourceName)
      : messages.linkInviteSubjectDataRoom(resourceName);
  const title =
    resourceType === "document"
      ? messages.linkInviteTitleDocument
      : messages.linkInviteTitleDataRoom;
  const preheader = messages.linkInvitePreheader(resourceName);
  const safeResourceName = escapeHtml(resourceName);

  const expiryText = expiresAt
    ? messages.linkInviteExpiry(formatPublicDate(new Date(expiresAt), locale))
    : null;

  const introHtml =
    resourceType === "document"
      ? `${messages
          .linkInviteIntroDocument(safeResourceName)
          .replace(safeResourceName, `<strong>${safeResourceName}</strong>`)}`
      : `${messages
          .linkInviteIntroDataRoom(safeResourceName)
          .replace(safeResourceName, `<strong>${safeResourceName}</strong>`)}`;

  const bodyHtml = [
    renderParagraphHtml(introHtml),
    renderButton(messages.linkInviteOpenLink, shareUrl),
    expiryText ? renderMutedText(expiryText) : "",
  ].join("");

  const html = renderBaseEmail({
    title,
    preheader,
    bodyHtml,
  });

  const textLines = [
    resourceType === "document"
      ? messages.linkInviteIntroDocument(resourceName)
      : messages.linkInviteIntroDataRoom(resourceName),
    `${messages.linkInviteOpenLink}: ${shareUrl}`,
  ];
  if (expiryText) {
    textLines.push(expiryText);
  }

  return { subject, html, text: textLines.join("\n") };
};
