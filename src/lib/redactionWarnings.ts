export const REDACTION_WARNING_CODES = ["over_redaction"] as const;

export type RedactionWarningCode = (typeof REDACTION_WARNING_CODES)[number];

export const REDACTION_WARNING_KINDS = [
  "text",
  "inline_image",
  "image_xobject",
  "form_xobject",
  "vector_path",
  "shading",
  "annotation",
  "widget",
] as const;

export type RedactionWarningKindCounts = Partial<
  Record<(typeof REDACTION_WARNING_KINDS)[number] | "unknown", number>
>;

export const REDACTION_WARNINGS_HEADER =
  "X-DocKosha-Redaction-Warnings" as const;
