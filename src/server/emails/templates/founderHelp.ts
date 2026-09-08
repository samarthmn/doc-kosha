import { escapeHtml } from "../escape";
import { renderBaseEmail } from "../layout";
import {
  renderButton,
  renderParagraphHtml,
  renderMutedText,
} from "../components";
import type { EmailContent } from "../types";

type FounderHelpEmailProps = {
  workspaceName?: string | null;
  dashboardUrl: string;
};

export const buildFounderHelpEmail = ({
  workspaceName,
  dashboardUrl,
}: FounderHelpEmailProps): EmailContent => {
  const rawName = workspaceName ?? "workspace";
  const safeName = workspaceName ? escapeHtml(workspaceName) : "workspace";
  const title = "Need any help getting started with DocKosha?";
  const preheader = `A quick check-in on your ${safeName} workspace.`;

  const bodyHtml = [
    renderParagraphHtml(
      `Hi, I&apos;m Samarth, founder of DocKosha. I saw that your ${safeName} workspace is up, so I wanted to check in.`,
    ),
    renderParagraphHtml(
      "If anything feels unclear, just reply here. I read these myself. If you are already moving, you can jump back into the workspace below.",
    ),
    renderButton("Open dashboard", dashboardUrl),
    renderMutedText("Happy to help if you are stuck."),
  ].join("");

  const text = [
    `Hi, I'm Samarth, founder of DocKosha. I saw that your ${rawName} workspace is up, so I wanted to check in.`,
    "If anything feels unclear, just reply here. I read these myself. If you are already moving, you can jump back into the workspace below.",
    `Open dashboard: ${dashboardUrl}`,
    "Happy to help if you are stuck.",
  ].join("\n");

  return {
    subject: "Need Any Help Getting Started with DocKosha?",
    html: renderBaseEmail({
      title,
      preheader,
      bodyHtml,
    }),
    text,
  };
};
