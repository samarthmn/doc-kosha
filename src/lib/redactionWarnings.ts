export const REDACTION_WARNING_CODES = ["over_redaction"] as const;

export type RedactionWarningCode = (typeof REDACTION_WARNING_CODES)[number];

export const REDACTION_WARNINGS_HEADER =
  "X-DocKosha-Redaction-Warnings" as const;
