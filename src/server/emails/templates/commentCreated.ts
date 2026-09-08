import { renderButton, renderParagraphHtml } from "../components";
import { escapeHtml } from "../escape";
import { renderBaseEmail } from "../layout";
import type { EmailContent } from "../types";

type CommentCreatedEmailProps = {
  documentTitle: string;
  viewerEmail: string;
  pageNumber: number;
  quote: string | null;
  commentBody: string;
  commentsUrl: string;
};

export const buildCommentCreatedEmail = ({
  documentTitle,
  viewerEmail,
  pageNumber,
  quote,
  commentBody,
  commentsUrl,
}: CommentCreatedEmailProps): EmailContent => {
  const sanitizedTitle = documentTitle.replace(/[\r\n\t]/g, " ").trim();
  const subject = `New comment: ${sanitizedTitle}`;
  const title = "New viewer comment";
  const preheader = "A viewer left a comment on your document.";

  const safeTitle = escapeHtml(documentTitle);
  const safeViewer = escapeHtml(viewerEmail);
  const safeBody = escapeHtml(commentBody);
  const safeQuote = quote ? escapeHtml(quote) : null;

  const bodyHtml = [
    renderParagraphHtml(
      `A viewer (<strong>${safeViewer}</strong>) commented on <strong>${safeTitle}</strong> (page ${pageNumber}).`,
    ),
    ...(safeQuote
      ? [renderParagraphHtml(`<strong>Selected text:</strong> “${safeQuote}”`)]
      : []),
    renderParagraphHtml(`<strong>Comment:</strong> ${safeBody}`),
    renderButton("View comments", commentsUrl),
  ].join("");

  const html = renderBaseEmail({
    title,
    preheader,
    bodyHtml,
  });

  const textParts = [
    `A viewer (${viewerEmail}) commented on ${documentTitle} (page ${pageNumber}).`,
    ...(quote ? [`Selected text: "${quote}"`] : []),
    `Comment: ${commentBody}`,
    `View comments: ${commentsUrl}`,
  ];

  return {
    subject,
    html,
    text: textParts.join("\n"),
  };
};
