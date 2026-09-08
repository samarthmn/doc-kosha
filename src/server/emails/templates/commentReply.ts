import { renderButton, renderParagraphHtml } from "../components";
import { escapeHtml } from "../escape";
import { renderBaseEmail } from "../layout";
import type { EmailContent } from "../types";
import { getPublicMessages } from "@/modules/public-links/i18n";
import type { PublicLanguage } from "@/modules/public-links/types";

type CommentReplyEmailProps = {
  documentTitle: string;
  replyAuthorEmail: string;
  replyBody: string;
  viewerUrl: string;
  locale: PublicLanguage;
};

export const buildCommentReplyEmail = ({
  documentTitle,
  replyAuthorEmail,
  replyBody,
  viewerUrl,
  locale,
}: CommentReplyEmailProps): EmailContent => {
  const messages = getPublicMessages(locale).emails;
  const sanitizedTitle = documentTitle.replace(/[\r\n\t]/g, " ").trim();
  const subject = messages.commentReplySubject(sanitizedTitle);
  const title = messages.commentReplyTitle;
  const preheader = messages.commentReplyPreheader;

  const safeTitle = escapeHtml(documentTitle);
  const safeAuthor = escapeHtml(replyAuthorEmail);
  const safeBody = escapeHtml(replyBody);
  const bodyTemplate = messages.commentReplyBody("{{author}}", "{{title}}");

  const bodyHtml = [
    renderParagraphHtml(
      bodyTemplate
        .replace("{{author}}", `<strong>${safeAuthor}</strong>`)
        .replace("{{title}}", `<strong>${safeTitle}</strong>`),
    ),
    renderParagraphHtml(
      `<strong>${messages.commentReplyLine("").replace(/:\s*$/, "")}:</strong> ${safeBody}`,
    ),
    renderButton(messages.commentReplyOpenDocument, viewerUrl),
  ].join("");

  const html = renderBaseEmail({
    title,
    preheader,
    bodyHtml,
  });

  const text = `${messages.commentReplyBody(replyAuthorEmail, documentTitle)}\n${messages.commentReplyLine(replyBody)}\n${messages.commentReplyOpenDocument}: ${viewerUrl}`;

  return { subject, html, text };
};
