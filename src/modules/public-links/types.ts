export const PUBLIC_LANGUAGE_VALUES = ["en", "fr", "es", "de"] as const;

export type PublicLanguage = (typeof PUBLIC_LANGUAGE_VALUES)[number];

export const DEFAULT_PUBLIC_LANGUAGE: PublicLanguage = "en";

const isPublicLanguage = (value: unknown): value is PublicLanguage =>
  typeof value === "string" &&
  (PUBLIC_LANGUAGE_VALUES as readonly string[]).includes(value);

export const normalizePublicLanguage = (value: unknown): PublicLanguage => {
  return isPublicLanguage(value) ? value : DEFAULT_PUBLIC_LANGUAGE;
};

export const normalizePublicLanguageOverride = (
  value: unknown,
): PublicLanguage | null => {
  return value === null ? null : isPublicLanguage(value) ? value : null;
};

export const getPublicLanguageLabel = (value: PublicLanguage): string => {
  switch (value) {
    case "es":
      return "Spanish";
    case "de":
      return "German";
    case "fr":
      return "French";
    case "en":
    default:
      return "English";
  }
};
