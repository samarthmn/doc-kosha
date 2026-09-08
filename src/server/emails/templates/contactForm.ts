import {
  renderDivider,
  renderKeyValueTable,
  renderParagraphHtml,
} from "../components";
import { escapeHtml, normalizeText } from "../escape";
import { renderBaseEmail } from "../layout";
import type { EmailContent } from "../types";

type ContactFormEmailProps = {
  name: string;
  email: string;
  company?: string;
  subject?: string;
  message: string;
};

export const buildContactFormEmail = ({
  name,
  email,
  company,
  subject,
  message,
}: ContactFormEmailProps): EmailContent => {
  const mailSubject = "Contact Form Submission";
  const title = "Contact form submission";
  const preheader = "New contact form submission received.";

  const fields = [
    { label: "Name", value: name },
    { label: "Email", value: email },
    { label: "Company", value: company || "(not provided)" },
    { label: "Subject", value: subject || "(not provided)" },
  ];

  const bodyHtml = [
    renderKeyValueTable(fields),
    renderDivider(),
    renderParagraphHtml(
      `<strong>Message</strong><br><span style="white-space: pre-wrap;">${escapeHtml(
        message,
      )}</span>`,
    ),
  ].join("");

  const html = renderBaseEmail({
    title,
    preheader,
    bodyHtml,
  });

  const text = [
    "Contact form submission",
    `Name: ${name}`,
    `Email: ${email}`,
    `Company: ${company || "(not provided)"}`,
    `Subject: ${subject || "(not provided)"}`,
    "",
    "Message:",
    normalizeText(message),
  ].join("\n");

  return { subject: mailSubject, html, text };
};
