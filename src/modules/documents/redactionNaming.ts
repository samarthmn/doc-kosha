const DEFAULT_DOCUMENT_BASENAME = "document";

export const normalizeNameForConflict = (value: string): string =>
  value.trim().toLowerCase();

const splitFileName = (value: string): { base: string; ext: string } => {
  const trimmed = value.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0) return { base: trimmed || DEFAULT_DOCUMENT_BASENAME, ext: "" };
  return {
    base: trimmed.slice(0, dot) || DEFAULT_DOCUMENT_BASENAME,
    ext: trimmed.slice(dot + 1).toLowerCase(),
  };
};

export const ensurePdfFileName = (value: string): string => {
  const { base } = splitFileName(value);
  return `${base}.pdf`;
};

export const makeRedactedBaseName = (value: string): string => {
  const { base } = splitFileName(value);
  return `${base} redacted`;
};

export const buildNextRedactedFilename = (
  originalTitle: string,
  existingTitles: string[],
): string => {
  const base = makeRedactedBaseName(originalTitle);
  const ext = "pdf";
  const existing = new Set(existingTitles.map(normalizeNameForConflict));

  const baseCandidate = `${base}.${ext}`;
  if (!existing.has(normalizeNameForConflict(baseCandidate))) {
    return baseCandidate;
  }

  let index = 1;
  while (index < 10000) {
    const next = `${base} (${index}).${ext}`;
    if (!existing.has(normalizeNameForConflict(next))) {
      return next;
    }
    index += 1;
  }

  return `${base} ${Date.now()}.${ext}`;
};
