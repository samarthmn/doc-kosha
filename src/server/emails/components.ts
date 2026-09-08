import { escapeAttribute, escapeHtml, sanitizeUrl } from "./escape";
import { styles } from "./styles";

type KeyValueItem = {
  label: string;
  value: string;
};

export const renderParagraph = (text: string): string =>
  `<p style="${styles.paragraph}">${escapeHtml(text)}</p>`;

export const renderParagraphHtml = (html: string): string =>
  `<p style="${styles.paragraph}">${html}</p>`;

export const renderMutedText = (text: string): string =>
  `<p style="${styles.mutedText}">${escapeHtml(text)}</p>`;

export const renderButton = (label: string, href: string): string => {
  const safeUrl = escapeAttribute(sanitizeUrl(href));
  const safeLabel = escapeHtml(label);
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="${styles.buttonTable}" class="button-table">
      <tr>
        <td align="left" style="${styles.buttonCell}" class="button-cell">
          <a href="${safeUrl}" style="${styles.buttonLink}" class="button-link">${safeLabel}</a>
        </td>
      </tr>
    </table>
  `;
};

export const renderDivider = (): string => `
  <table role="presentation" cellspacing="0" cellpadding="0" style="${styles.dividerTable}">
    <tr>
      <td style="${styles.dividerCell}"></td>
    </tr>
  </table>
`;

export const renderCodeChip = (code: string): string =>
  `<div style="${styles.codeChip}" class="code-chip">${escapeHtml(code)}</div>`;

export const renderKeyValueTable = (items: KeyValueItem[]): string => {
  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="${styles.kvLabel}">${escapeHtml(item.label)}</td>
          <td style="${styles.kvValue}">${escapeHtml(item.value)}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="${styles.kvTable}">
      ${rows}
    </table>
  `;
};
