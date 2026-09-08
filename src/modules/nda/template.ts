const baseStyles = `
  .nda-document {
    font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
    max-width: 840px;
    margin: 0 auto;
    padding: 24px 28px 36px;
    color: #0f172a;
    background-color: #ffffff;
  }

  .nda-document h1 {
    text-align: center;
    margin-bottom: 32px;
    font-size: 28px;
    letter-spacing: 0.04em;
  }

  .nda-document h2 {
    font-size: 18px;
    margin-top: 24px;
    margin-bottom: 8px;
  }

  .nda-document p {
    line-height: 1.6;
    margin-bottom: 16px;
    font-size: 14px;
  }

  .nda-document ul {
    margin: 0 0 16px 20px;
    padding: 0;
    font-size: 14px;
  }

  .nda-document li {
    margin-bottom: 10px;
  }

  .nda-meta {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 16px 20px;
    border-radius: 10px;
    margin-bottom: 24px;
    font-size: 13px;
  }

  .nda-signature-block {
    border-top: 1px solid #0f172a;
    margin-top: 32px;
    padding-top: 20px;
    font-size: 13px;
  }

  .nda-signature-header {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-bottom: 14px;
  }

  .nda-signature-details p {
    margin-bottom: 6px;
  }

  .nda-signature-image {
    margin-top: 12px;
    height: 120px;
    display: flex;
    align-items: center;
  }

  .nda-signature-image img {
    max-width: 240px;
    max-height: 110px;
    object-fit: contain;
  }

  .nda-signature-placeholder {
    margin-top: 12px;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed #94a3b8;
    border-radius: 10px;
    color: #64748b;
    background: #f8fafc;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 12px;
  }

  .nda-footnote {
    font-size: 12px;
    color: #64748b;
    margin-top: 6px;
  }

  .nda-blank {
    display: inline-flex;
    align-items: flex-end;
    min-width: 180px;
    border-bottom: 1px solid #0f172a;
    height: 1.4em;
    vertical-align: baseline;
  }

  .nda-blank--email {
    min-width: 220px;
  }

  .nda-blank--filled {
    padding: 0 4px;
    font-weight: 500;
  }
`;

type GenerateNdaTemplateInput = {
  workspaceName: string;
  documentTitle: string;
  receivingPartyName?: string | null;
  receivingPartyEmail?: string | null;
  effectiveDate: Date | string | number;
  signedDateTime?: Date | string | number | null;
  signatureDataUrl?: string | null;
  showSignaturePlaceholder?: boolean;
  /** Custom body HTML for the NDA clauses */
  bodyHtmlOverride: string;
};

type GenerateNdaTemplateResult = {
  fullHtml: string;
  previewHtml: string;
  effectiveDateFormatted: string;
  signedDateTimeFormatted: string;
  safeWorkspaceName: string;
  safeDocumentTitle: string;
  safeReceivingPartyName: string;
  safeReceivingPartyEmail: string;
};

const escapeHtml = (input: string | null | undefined): string =>
  (input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const toDate = (value: GenerateNdaTemplateInput["effectiveDate"]): Date => {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date();
  }
  return date;
};

const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);

const formatDateTime = (date: Date): string =>
  new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);

const createBlankLine = (value: string, className?: string): string => {
  const classSuffix = className ? ` ${className}` : "";
  if (value) {
    return `<span class="nda-blank nda-blank--filled${classSuffix}">${value}</span>`;
  }
  return `<span class="nda-blank${classSuffix}"></span>`;
};

const sanitizeSignature = (signatureDataUrl?: string | null): string | null => {
  if (!signatureDataUrl) return null;
  const trimmed = signatureDataUrl.trim();
  return /^data:image\/(?:png|jpeg);base64,[a-z0-9+/=]+$/i.test(trimmed)
    ? trimmed
    : null;
};

/** Export the default body HTML for use as a template starting point */
export const getDefaultNdaBodyHtml = (): string => {
  // Return a clean version without placeholders for the editor
  return `<p>This Non-Disclosure Agreement ("Agreement") is entered into as of the effective date by and between the Disclosing Party and the Receiving Party. The parties agree as follows:</p>
<h2>1. Confidential Information</h2>
<p>"Confidential Information" means all non-public information disclosed by the Disclosing Party in any form that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure. Confidential Information includes, without limitation, business and marketing plans, technology, technical information, product designs, trade secrets, financial data, and the content of the covered document.</p>
<h2>2. Obligations</h2>
<p>The Receiving Party shall:</p>
<ul>
<li>Use the Confidential Information solely for the purpose of evaluating or pursuing a business relationship related to the covered document;</li>
<li>Limit disclosure of Confidential Information to those of its representatives who need to know such information for the permitted purpose and who are bound by written confidentiality obligations at least as protective as those in this Agreement;</li>
<li>Protect the Confidential Information with the same degree of care it uses for its own confidential information, and in no event less than a reasonable degree of care;</li>
<li>Promptly notify the Disclosing Party of any unauthorized use or disclosure and cooperate in any remediation efforts.</li>
</ul>
<h2>3. Exclusions</h2>
<p>The obligations in this Agreement do not apply to information that the Receiving Party can demonstrate: (a) was known to it without restriction before receipt; (b) becomes publicly known through no fault of the Receiving Party; (c) is rightfully received from a third party without a duty of confidentiality; or (d) is independently developed without use of or reference to the Confidential Information.</p>
<h2>4. Required Disclosure</h2>
<p>If the Receiving Party is compelled by law or court order to disclose Confidential Information, it shall, to the extent legally permitted, provide the Disclosing Party with prompt written notice and cooperate with any efforts to obtain a protective order or other appropriate remedy.</p>
<h2>5. Term and Return</h2>
<p>This Agreement remains in effect for three (3) years from the Effective Date. Upon request or termination of discussions, the Receiving Party will promptly return or destroy all Confidential Information and certify such destruction in writing upon request.</p>
<h2>6. Remedies</h2>
<p>The Receiving Party acknowledges that any breach of this Agreement may cause irreparable harm to the Disclosing Party for which monetary damages would be inadequate. The Disclosing Party is entitled to seek injunctive relief, in addition to any other remedies available at law or in equity.</p>
<h2>7. Governing Law</h2>
<p>This Agreement is governed by and construed in accordance with the laws applicable to the Disclosing Party's principal place of business, without regard to conflict of law principles.</p>`;
};

export const generateNdaTemplate = (
  input: GenerateNdaTemplateInput,
): GenerateNdaTemplateResult => {
  const effectiveDate = toDate(input.effectiveDate);
  const signedDateTime = input.signedDateTime
    ? toDate(input.signedDateTime)
    : effectiveDate;

  const safeWorkspaceName = escapeHtml(input.workspaceName || "The Workspace");
  const safeDocumentTitle = escapeHtml(input.documentTitle || "Document");
  const safeReceivingPartyName = escapeHtml(input.receivingPartyName ?? "");
  const safeReceivingPartyEmail = escapeHtml(input.receivingPartyEmail ?? "");

  const receivingPartyNameLine = createBlankLine(safeReceivingPartyName);
  const receivingPartyEmailLine = createBlankLine(
    safeReceivingPartyEmail,
    "nda-blank--email",
  );

  const effectiveDateFormatted = formatDate(effectiveDate);
  const signedDateTimeFormatted = formatDateTime(signedDateTime);

  const signatureImageSrc = sanitizeSignature(input.signatureDataUrl);
  const shouldShowPlaceholder =
    !signatureImageSrc && input.showSignaturePlaceholder !== false;

  const signatureContent = signatureImageSrc
    ? `<div class="nda-signature-image"><img src="${signatureImageSrc}" alt="Receiving party signature" /></div>`
    : shouldShowPlaceholder
      ? '<div class="nda-signature-placeholder">Sign here</div>'
      : "";

  const bodyHtmlOverride = input.bodyHtmlOverride.trim();
  if (!bodyHtmlOverride) {
    throw new Error("NDA template body is required");
  }

  const bodyHtml = `<div class="nda-custom-body">${bodyHtmlOverride}</div>`;

  const content = `
    <div class="nda-document">
      <h1>Non-Disclosure Agreement</h1>
      <div class="nda-meta">
        <p><strong>Disclosing Party:</strong> ${safeWorkspaceName}</p>
        <p><strong>Receiving Party:</strong> ${receivingPartyNameLine}</p>
        <p><strong>Receiving Party Email:</strong> ${receivingPartyEmailLine}</p>
        <p><strong>Covered Document:</strong> ${safeDocumentTitle}</p>
        <p><strong>Effective Date:</strong> ${effectiveDateFormatted}</p>
      </div>
      ${bodyHtml}
      <div class="nda-signature-block">
        <div class="nda-signature-header">Receiving Party Acknowledgement</div>
        <div class="nda-signature-details">
          <p><strong>Name:</strong> ${receivingPartyNameLine}</p>
          <p><strong>Email:</strong> ${receivingPartyEmailLine}</p>
          <p><strong>Date Signed:</strong> ${signedDateTimeFormatted}</p>
        </div>
        ${signatureContent}
      </div>
      <p class="nda-footnote">Signed electronically on ${signedDateTimeFormatted}</p>
    </div>
  `;

  const previewHtml = `<style>${baseStyles}</style>${content}`;
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Non-Disclosure Agreement</title><style>${baseStyles}</style></head><body>${content}</body></html>`;

  return {
    fullHtml,
    previewHtml,
    effectiveDateFormatted,
    signedDateTimeFormatted,
    safeWorkspaceName,
    safeDocumentTitle,
    safeReceivingPartyName,
    safeReceivingPartyEmail,
  };
};
