import { renderButton, renderParagraphHtml } from "../components";
import { escapeHtml } from "../escape";
import { renderBaseEmail } from "../layout";
import type { EmailContent } from "../types";

type DocumentViewedEmailProps = {
  documentTitle: string;
  analyticsUrl: string;
};

export const buildDocumentViewedEmail = ({
  documentTitle,
  analyticsUrl,
}: DocumentViewedEmailProps): EmailContent => {
  const sanitizedTitle = documentTitle.replace(/[\r\n\t]/g, " ").trim();
  const subject = `Document Viewed: ${sanitizedTitle}`;
  const title = "Your document was viewed";
  const preheader = "Your shared document was viewed.";
  const safeTitle = escapeHtml(documentTitle);

  const bodyHtml = [
    renderParagraphHtml(
      `Your shared document <strong>${safeTitle}</strong> has been viewed.`,
    ),
    renderButton("View link analytics", analyticsUrl),
  ].join("");

  const html = renderBaseEmail({
    title,
    preheader,
    bodyHtml,
  });

  const text = `Your shared document ${documentTitle} has been viewed.\nView link analytics: ${analyticsUrl}`;

  return { subject, html, text };
};
