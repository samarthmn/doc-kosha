const colors = {
  background: "#f3f4f6",
  card: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  buttonBg: "#111827",
  buttonText: "#ffffff",
  link: "#2563eb",
  codeBg: "#f3f4f6",
};

const fontFamily =
  "'Inter','Segoe UI','Helvetica Neue',Arial,'Noto Sans',sans-serif";
const monoFontFamily =
  "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

export const styles = {
  body: `margin:0; padding:0; width:100%; background-color:${colors.background}; color:${colors.text}; font-family:${fontFamily};`,
  preheader:
    "display:none !important; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all;",
  outerTable: `width:100%; background-color:${colors.background};`,
  containerTable: "width:600px; max-width:600px;",
  cardTable: `width:100%; background-color:${colors.card}; border:1px solid ${colors.border}; border-radius:12px;`,
  headerCell:
    "padding:28px 32px 0 32px; font-size:20px; font-weight:600; letter-spacing:-0.2px;",
  contentCell: "padding:20px 32px 8px 32px;",
  footerCell: `padding:16px 32px 24px 32px; font-size:12px; line-height:1.5; color:${colors.muted};`,
  paragraph:
    "margin:0 0 16px 0; font-size:16px; line-height:1.6; color:inherit;",
  paragraphTight: "margin:0 0 8px 0; font-size:15px; line-height:1.6;",
  mutedText: `margin:0 0 16px 0; font-size:14px; line-height:1.6; color:${colors.muted};`,
  link: `color:${colors.link}; text-decoration:underline;`,
  buttonTable: "margin:16px 0 20px 0;",
  buttonCell: `background-color:${colors.buttonBg}; border-radius:8px;`,
  buttonLink: `display:inline-block; padding:12px 20px; color:${colors.buttonText}; text-decoration:none; font-weight:600; font-size:15px;`,
  codeChip: `display:inline-block; padding:10px 16px; background-color:${colors.codeBg}; border:1px solid ${colors.border}; border-radius:8px; font-family:${monoFontFamily}; font-size:20px; letter-spacing:2px;`,
  dividerTable: "width:100%;",
  dividerCell: `border-top:1px solid ${colors.border}; padding-top:12px;`,
  sectionHeading:
    "margin:0 0 12px 0; font-size:18px; font-weight:600; line-height:1.4;",
  kvTable: "width:100%; border-collapse:collapse;",
  kvLabel:
    "padding:8px 0; font-weight:600; font-size:14px; vertical-align:top;",
  kvValue:
    "padding:8px 0; font-size:14px; line-height:1.5; white-space:pre-wrap;",
};
