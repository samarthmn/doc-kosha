import { escapeHtml } from "./escape";
import { styles } from "./styles";

type BaseEmailOptions = {
  title: string;
  preheader?: string;
  bodyHtml: string;
  footerHtml?: string;
};

const defaultFooterHtml = `<p style="${styles.mutedText}">This is an automated message from DocKosha. If you did not expect this email, you can ignore it.</p>`;

export const renderBaseEmail = ({
  title,
  preheader,
  bodyHtml,
  footerHtml,
}: BaseEmailOptions): string => {
  const safeTitle = escapeHtml(title);
  const safePreheader = preheader ? escapeHtml(preheader) : "";
  const finalFooter = footerHtml ?? defaultFooterHtml;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${safeTitle}</title>
    <style>
      @media only screen and (max-width: 640px) {
        .container {
          width: 100% !important;
        }
        .logo {
          padding: 0 0 12px 0 !important;
        }
        .card {
          border-radius: 10px !important;
        }
        .header {
          padding: 24px 20px 0 20px !important;
          font-size: 18px !important;
        }
        .content {
          padding: 18px 20px 8px 20px !important;
        }
        .footer {
          padding: 14px 20px 20px 20px !important;
        }
        .button-table {
          width: 100% !important;
        }
        .button-cell {
          width: 100% !important;
        }
        .button-link {
          display: block !important;
          text-align: center !important;
        }
        .code-chip {
          font-size: 18px !important;
        }
      }
    </style>
  </head>
  <body style="${styles.body}">
    ${
      preheader ? `<div style="${styles.preheader}">${safePreheader}</div>` : ""
    }
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="${styles.outerTable}">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="${styles.containerTable}" class="container">
            <tr>
              <td align="left" style="padding:0 0 12px 0; font-size:18px; font-weight:600; color:#111827;" class="logo">
                DocKosha
              </td>
            </tr>
            <tr>
              <td>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="${styles.cardTable}" class="card">
                  <tr>
                    <td style="${styles.headerCell}" class="header">
                      ${safeTitle}
                    </td>
                  </tr>
                  <tr>
                    <td style="${styles.contentCell}" class="content">
                      ${bodyHtml}
                    </td>
                  </tr>
                  <tr>
                    <td style="${styles.footerCell}" class="footer">
                      ${finalFooter}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};
