import {
  renderButton,
  renderKeyValueTable,
  renderMutedText,
  renderParagraph,
} from "../components";
import { renderBaseEmail } from "../layout";
import type { EmailContent } from "../types";

type LoginSessionEmailProps = {
  occurredAt: string;
  deviceLabel: string;
  countryCode?: string | null;
  settingsUrl: string;
};

export const buildLoginSessionEmail = ({
  occurredAt,
  deviceLabel,
  countryCode,
  settingsUrl,
}: LoginSessionEmailProps): EmailContent => {
  const title = "New sign-in detected";
  const preheader = "A sign-in was detected on your DocKosha account.";

  const bodyHtml = [
    renderParagraph("We detected a sign-in to your DocKosha account."),
    renderKeyValueTable([
      { label: "Time (UTC)", value: occurredAt },
      { label: "Device", value: deviceLabel },
      {
        label: "Country",
        value: countryCode && countryCode.length > 0 ? countryCode : "Unknown",
      },
    ]),
    renderButton("Review account settings", settingsUrl),
    renderMutedText(
      "If this wasn't you, reset your password and review workspace access immediately.",
    ),
  ].join("");

  const html = renderBaseEmail({
    title,
    preheader,
    bodyHtml,
  });

  const text = [
    "We detected a sign-in to your DocKosha account.",
    `Time (UTC): ${occurredAt}`,
    `Device: ${deviceLabel}`,
    `Country: ${countryCode && countryCode.length > 0 ? countryCode : "Unknown"}`,
    `Review account settings: ${settingsUrl}`,
    "If this wasn't you, reset your password and review workspace access immediately.",
  ].join("\n");

  return {
    subject: "New DocKosha sign-in detected",
    html,
    text,
  };
};
