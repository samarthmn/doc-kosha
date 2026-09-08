import { escapeHtml } from "../escape";
import { renderBaseEmail } from "../layout";
import {
  renderButton,
  renderMutedText,
  renderParagraphHtml,
} from "../components";
import type { EmailContent } from "../types";

type PaymentFailedEmailProps = {
  workspaceName: string;
  planLabel: string;
  paymentSettingsUrl: string;
  invoiceId?: string | null;
};

export const buildPaymentFailedEmail = ({
  workspaceName,
  planLabel,
  paymentSettingsUrl,
  invoiceId,
}: PaymentFailedEmailProps): EmailContent => {
  const safeWorkspaceName = escapeHtml(workspaceName);
  const safePlanLabel = escapeHtml(planLabel);
  const title = "Payment failed for your DocKosha subscription";
  const preheader = `Update your payment method so ${safeWorkspaceName} keeps running.`;

  const bodyHtml = [
    renderParagraphHtml(
      `We were unable to charge the ${safePlanLabel} plan for <strong>${safeWorkspaceName}</strong>.`,
    ),
    renderParagraphHtml(
      invoiceId
        ? `Invoice ${escapeHtml(invoiceId)} is awaiting payment.`
        : "An invoice is awaiting payment.",
    ),
    renderButton("Update payment method", paymentSettingsUrl),
    renderMutedText(
      "Once you update the payment method we will retry automatically and restore access.",
    ),
  ].join("");

  const text = [
    `We were unable to charge the ${planLabel} plan for ${workspaceName}.`,
    invoiceId
      ? `Invoice ${invoiceId} is awaiting payment.`
      : "An invoice is awaiting payment.",
    `Update payment method: ${paymentSettingsUrl}`,
    "Once you update the payment method we will retry automatically and restore access.",
  ].join("\n");

  return {
    subject: "Payment failed for your DocKosha subscription",
    html: renderBaseEmail({
      title,
      preheader,
      bodyHtml,
    }),
    text,
  };
};
