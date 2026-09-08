import { renderMutedText, renderParagraphHtml } from "../components";
import { escapeHtml } from "../escape";
import { renderBaseEmail } from "../layout";
import type { EmailContent } from "../types";
import { getPublicMessages } from "@/modules/public-links/i18n";
import type { PublicLanguage } from "@/modules/public-links/types";

type NdaSignedBaseProps = {
  resourceTitle: string;
  contextLabel: "document" | "data room";
  workspaceName: string;
  locale?: PublicLanguage;
};

type NdaSignedOwnerProps = NdaSignedBaseProps & {
  signerName: string;
  signerEmail: string;
};

export const buildNdaSignedViewerEmail = ({
  resourceTitle,
  contextLabel,
  workspaceName,
  locale = "en",
}: NdaSignedBaseProps): EmailContent => {
  const messages = getPublicMessages(locale).emails;
  const safeWorkspaceName = escapeHtml(workspaceName);
  const safeSubjectTitle = escapeHtml(resourceTitle);
  const subject = messages.ndaSignedViewerSubject(safeSubjectTitle);
  const title = messages.ndaSignedViewerTitle;
  const preheader = messages.ndaSignedViewerPreheader(safeWorkspaceName);
  const safeTitle = escapeHtml(resourceTitle);
  const bodyTemplate = messages.ndaSignedViewerBody(contextLabel, "{{title}}");

  const bodyHtml = [
    renderParagraphHtml(
      bodyTemplate.replace("{{title}}", `<strong>${safeTitle}</strong>`),
    ),
    renderMutedText(messages.ndaSignedViewerAttachment),
  ].join("");

  const html = renderBaseEmail({
    title,
    preheader,
    bodyHtml,
  });

  const text = `${messages.ndaSignedViewerBody(contextLabel, resourceTitle)}\n${messages.ndaSignedViewerAttachment}`;

  return { subject, html, text };
};

export const buildNdaSignedOwnerEmail = ({
  resourceTitle,
  contextLabel,
  workspaceName,
  signerName,
  signerEmail,
}: NdaSignedOwnerProps): EmailContent => {
  const safeSubjectTitle = escapeHtml(resourceTitle);
  const subject = `NDA Signed: ${safeSubjectTitle}`;
  const title = "NDA signed";
  const safeTitle = escapeHtml(resourceTitle);
  const safeName = escapeHtml(signerName);
  const safeEmail = escapeHtml(signerEmail);
  const safeWorkspaceName = escapeHtml(workspaceName);
  const preheader = `An NDA was signed for ${safeWorkspaceName}.`;

  const bodyHtml = [
    renderParagraphHtml(
      `<strong>${safeName}</strong> (${safeEmail}) has signed the NDA for the ${contextLabel} <strong>${safeTitle}</strong>.`,
    ),
    renderMutedText("A copy of the signed NDA is attached."),
  ].join("");

  const html = renderBaseEmail({
    title,
    preheader,
    bodyHtml,
  });

  const text = `${signerName} (${signerEmail}) has signed the NDA for the ${contextLabel} ${resourceTitle}.\nA copy of the signed NDA is attached.`;

  return { subject, html, text };
};
