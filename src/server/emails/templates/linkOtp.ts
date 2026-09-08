import {
  renderCodeChip,
  renderMutedText,
  renderParagraph,
} from "../components";
import { renderBaseEmail } from "../layout";
import type { EmailContent } from "../types";
import { getPublicMessages } from "@/modules/public-links/i18n";
import type { PublicLanguage } from "@/modules/public-links/types";

type LinkOtpEmailProps = {
  code: string;
  expiryMinutes: number;
  locale: PublicLanguage;
};

export const buildLinkOtpEmail = ({
  code,
  expiryMinutes,
  locale,
}: LinkOtpEmailProps): EmailContent => {
  const messages = getPublicMessages(locale).emails;
  const subject = messages.linkOtpSubject;
  const title = messages.linkOtpTitle;
  const preheader = messages.linkOtpPreheader;

  const bodyHtml = [
    renderParagraph(messages.linkOtpIntro),
    renderCodeChip(code),
    renderMutedText(messages.linkOtpExpiry(expiryMinutes)),
  ].join("");

  const html = renderBaseEmail({
    title,
    preheader,
    bodyHtml,
  });

  const text = `${messages.linkOtpTitle}: ${code}. ${messages.linkOtpExpiry(expiryMinutes)}`;

  return { subject, html, text };
};
