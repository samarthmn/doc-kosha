import { escapeHtml } from "../escape";
import { formatShortDate } from "./helpers";
import { renderBaseEmail } from "../layout";
import {
  renderButton,
  renderParagraphHtml,
  renderMutedText,
} from "../components";
import type { EmailContent } from "../types";

type InactiveOwnerEmailProps = {
  workspaceName?: string | null;
  dashboardUrl: string;
  lastSignInAt?: string | null;
};

export const buildInactiveOwnerEmail = ({
  workspaceName,
  dashboardUrl,
  lastSignInAt,
}: InactiveOwnerEmailProps): EmailContent => {
  const rawName = workspaceName ?? "workspace";
  const safeName = workspaceName ? escapeHtml(workspaceName) : "workspace";
  const lastSeenDate = lastSignInAt ? new Date(lastSignInAt) : null;
  const lastSeenText =
    lastSeenDate && !Number.isNaN(lastSeenDate.getTime())
      ? formatShortDate(lastSeenDate)
      : "recently";
  const title = "Your DocKosha workspace has been idle";
  const preheader = `You last signed in ${lastSeenText}.`;

  const bodyHtml = [
    renderParagraphHtml(
      `We have not seen the owner account for <strong>${safeName}</strong> since ${lastSeenText}.`,
    ),
    renderParagraphHtml(
      "If you still plan to use the workspace, open it and pick things back up.",
    ),
    renderButton("Open dashboard", dashboardUrl),
    renderMutedText("Ignore this if you have already been back in."),
  ].join("");

  const text = [
    `We have not seen the owner account for ${rawName} since ${lastSeenText}.`,
    "If you still plan to use the workspace, open it and pick things back up.",
    `Open dashboard: ${dashboardUrl}`,
    "Ignore this if you have already been back in.",
  ].join("\n");

  return {
    subject: "Your DocKosha workspace has been idle",
    html: renderBaseEmail({
      title,
      preheader,
      bodyHtml,
    }),
    text,
  };
};
