import {
  renderButton,
  renderKeyValueTable,
  renderMutedText,
  renderParagraphHtml,
} from "../components";
import { escapeHtml } from "../escape";
import { renderBaseEmail } from "../layout";
import type { EmailContent } from "../types";

type WorkspaceAccessChangedEmailProps = {
  workspaceName: string;
  documentsAccess: "none" | "viewer" | "editor";
  dataRoomsAccessAll: "none" | "viewer" | "editor";
  settingsUrl: string;
};

const accessLabel: Record<"none" | "viewer" | "editor", string> = {
  none: "No access",
  viewer: "Viewer",
  editor: "Editor",
};

export const buildWorkspaceAccessChangedEmail = ({
  workspaceName,
  documentsAccess,
  dataRoomsAccessAll,
  settingsUrl,
}: WorkspaceAccessChangedEmailProps): EmailContent => {
  const safeWorkspaceName = escapeHtml(workspaceName);
  const title = "Workspace access updated";
  const preheader = `Your access for ${safeWorkspaceName} was changed.`;

  const bodyHtml = [
    renderParagraphHtml(
      `Your access permissions in <strong>${safeWorkspaceName}</strong> were updated by a workspace owner.`,
    ),
    renderKeyValueTable([
      { label: "Documents", value: accessLabel[documentsAccess] },
      { label: "Data rooms (all)", value: accessLabel[dataRoomsAccessAll] },
    ]),
    renderButton("Review access", settingsUrl),
    renderMutedText(
      "If you did not expect this change, contact your workspace owner.",
    ),
  ].join("");

  const html = renderBaseEmail({
    title,
    preheader,
    bodyHtml,
  });

  const text = [
    `Your access permissions in ${workspaceName} were updated by a workspace owner.`,
    `Documents: ${accessLabel[documentsAccess]}`,
    `Data rooms (all): ${accessLabel[dataRoomsAccessAll]}`,
    `Review access: ${settingsUrl}`,
    "If you did not expect this change, contact your workspace owner.",
  ].join("\n");

  return {
    subject: "Your DocKosha workspace access was updated",
    html,
    text,
  };
};
