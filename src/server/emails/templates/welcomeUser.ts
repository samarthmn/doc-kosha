import { renderButton, renderParagraphHtml } from "../components";
import { escapeHtml } from "../escape";
import { renderBaseEmail } from "../layout";
import type { EmailContent } from "../types";

type WelcomeUserEmailProps = {
  fullName?: string | null;
  dashboardUrl: string;
};

export const buildWelcomeUserEmail = ({
  fullName,
  dashboardUrl,
}: WelcomeUserEmailProps): EmailContent => {
  const safeName = fullName ? escapeHtml(fullName) : null;
  const title = "Your DocKosha workspace is ready to set up";
  const preheader = "Complete a few setup steps and activate your workspace.";
  const greeting = safeName ? `Welcome, ${safeName}.` : "Welcome.";

  const bodyHtml = [
    renderParagraphHtml(
      `${greeting} We created your workspace and you can finish the setup in the dashboard.`,
    ),
    renderParagraphHtml(
      "Invite teammates, upload sensitive files, and launch the trial when you are ready.",
    ),
    renderButton("Finish setup", dashboardUrl),
  ].join("");

  const html = renderBaseEmail({
    title,
    preheader,
    bodyHtml,
  });

  const text = [
    fullName ? `Welcome, ${fullName}.` : "Welcome.",
    "We created your workspace so you can finish setup and start sharing securely.",
    `Finish setup: ${dashboardUrl}`,
  ].join("\n");

  return {
    subject: "Your DocKosha workspace is ready to set up",
    html,
    text,
  };
};
