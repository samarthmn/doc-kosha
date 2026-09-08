import {
  renderDivider,
  renderKeyValueTable,
  renderParagraphHtml,
} from "../components";
import { escapeHtml, normalizeText } from "../escape";
import { renderBaseEmail } from "../layout";
import type { EmailContent } from "../types";

type DataRequestEmailProps = {
  requestType: string;
  email: string;
  userId?: string | null;
  details: string;
};

const formatRequestType = (value: string): string => {
  const formatted = value.replace(/_/g, " ");
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

export const buildDataRequestEmail = ({
  requestType,
  email,
  userId,
  details,
}: DataRequestEmailProps): EmailContent => {
  const mailSubject = `Data request from ${email.replace(/[\r\n]/g, "")}`;
  const title = "Data request received";
  const preheader = "A new data request was submitted.";

  const fields = [
    { label: "User", value: email },
    { label: "User ID", value: userId || "(unauthenticated)" },
    { label: "Request type", value: formatRequestType(requestType) },
  ];

  const bodyHtml = [
    renderKeyValueTable(fields),
    renderDivider(),
    renderParagraphHtml(
      `<strong>Details</strong><br><span style="white-space: pre-wrap;">${escapeHtml(
        details,
      )}</span>`,
    ),
  ].join("");

  const html = renderBaseEmail({
    title,
    preheader,
    bodyHtml,
  });

  const text = [
    "Data request",
    `User: ${email}`,
    `User ID: ${userId || "(unauthenticated)"}`,
    `Request type: ${formatRequestType(requestType)}`,
    "",
    "Details:",
    normalizeText(details),
  ].join("\n");

  return { subject: mailSubject, html, text };
};
