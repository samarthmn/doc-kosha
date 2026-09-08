import {
  renderDivider,
  renderKeyValueTable,
  renderParagraphHtml,
} from "../components";
import { escapeHtml, normalizeText } from "../escape";
import { renderBaseEmail } from "../layout";
import type { EmailContent } from "../types";

type TestimonialSubmittedEmailProps = {
  workspaceName: string;
  userEmail: string | null;
  name: string;
  roleTitle: string;
  company: string;
  testimonial: string;
  headshotUploaded: boolean;
};

export const buildTestimonialSubmittedEmail = ({
  workspaceName,
  userEmail,
  name,
  roleTitle,
  company,
  testimonial,
  headshotUploaded,
}: TestimonialSubmittedEmailProps): EmailContent => {
  const sanitizedUserEmail =
    userEmail?.replace(/[\r\n]/g, "").trim() || "(email unavailable)";
  const mailSubject = `New testimonial from ${name.replace(/[\r\n]/g, "")}`;
  const title = "New testimonial submission";
  const preheader = "A workspace testimonial was just submitted.";

  const fields = [
    { label: "Workspace", value: workspaceName },
    { label: "User email", value: sanitizedUserEmail },
    { label: "Name", value: name },
    { label: "Role / Title", value: roleTitle },
    { label: "Company", value: company },
    { label: "Headshot uploaded", value: headshotUploaded ? "Yes" : "No" },
  ];

  const bodyHtml = [
    renderKeyValueTable(fields),
    renderDivider(),
    renderParagraphHtml(
      `<strong>Testimonial</strong><br><span style="white-space: pre-wrap;">${escapeHtml(
        testimonial,
      )}</span>`,
    ),
  ].join("");

  const html = renderBaseEmail({
    title,
    preheader,
    bodyHtml,
  });

  const text = [
    "New testimonial submission",
    `Workspace: ${workspaceName}`,
    `User email: ${sanitizedUserEmail}`,
    `Name: ${name}`,
    `Role / Title: ${roleTitle}`,
    `Company: ${company}`,
    `Headshot uploaded: ${headshotUploaded ? "Yes" : "No"}`,
    "",
    "Testimonial:",
    normalizeText(testimonial),
  ].join("\n");

  return { subject: mailSubject, html, text };
};
