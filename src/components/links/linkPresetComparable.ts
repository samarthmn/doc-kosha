import { normalizeEmail } from "@/lib/email";
import { normalizePublicLanguageOverride } from "@/modules/public-links/types";

export type PresetComparable = {
  settingsJson: Record<string, unknown>;
  allowedEmails: string[];
  blockedEmails: string[];
  allowedGroupIds: string[];
  blockedGroupIds: string[];
};

type PresetComparableInput = {
  settingsJson: Record<string, unknown>;
  allowedEmails: string[];
  blockedEmails: string[];
  allowedGroupIds: string[];
  blockedGroupIds: string[];
};

const dedupeSortedEmails = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => normalizeEmail(value))))
    .filter((value) => value.length > 0)
    .sort();

const dedupeSortedStrings = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => value.trim())))
    .filter((value) => value.length > 0)
    .sort();

const parseComparableQAPairs = (
  value: unknown,
): Array<{ question: string; answer: string }> => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as { question?: unknown; answer?: unknown };
    const question =
      typeof row.question === "string" ? row.question.trim() : "";
    const answer = typeof row.answer === "string" ? row.answer.trim() : "";
    if (!question || !answer) return [];
    return [{ question, answer }];
  });
};

/**
 * Normalize a settings JSON blob to the canonical field list used for
 * preset-dirty comparisons. Raw preset JSONB can carry extra keys and does not
 * preserve key order, so both the preset side and the current-settings side
 * must go through this exact shape.
 */
const buildComparableSettingsJson = (
  source: Record<string, unknown>,
  options: { includeNda: boolean },
): Record<string, unknown> => {
  const ndaRequired = Boolean(source.ndaRequired);
  const json: Record<string, unknown> = {
    passwordEnabled: Boolean(source.passwordEnabled),
    emailNotifications: Boolean(source.emailNotifications),
    downloadEnabled: Boolean(source.downloadEnabled),
    collectEmailsForAnalytics: Boolean(source.collectEmailsForAnalytics),
    screenshotProtection: Boolean(source.screenshotProtection),
    watermark: Boolean(source.watermark),
    watermarkTemplateId:
      typeof source.watermarkTemplateId === "string"
        ? source.watermarkTemplateId
        : null,
    dynamicWatermarkEmail: Boolean(source.dynamicWatermarkEmail),
    dynamicWatermarkIp: Boolean(source.dynamicWatermarkIp),
    dynamicWatermarkDateTime: Boolean(source.dynamicWatermarkDateTime),
    showQnA: Boolean(source.showQnA),
    showFeedback: Boolean(source.showFeedback),
    commentsEnabled: Boolean(source.commentsEnabled),
    publicLanguageOverride: normalizePublicLanguageOverride(
      source.publicLanguageOverride,
    ),
    qaPairs: parseComparableQAPairs(source.qaPairs),
  };
  if (options.includeNda) {
    json.ndaRequired = ndaRequired;
    json.ndaTemplateId =
      ndaRequired && typeof source.ndaTemplateId === "string"
        ? source.ndaTemplateId
        : null;
  }
  return json;
};

export const buildPresetComparable = (
  input: PresetComparableInput,
  options: { includeNda: boolean },
): PresetComparable => {
  const blockedEmails = dedupeSortedEmails(input.blockedEmails);
  const allowedEmails = dedupeSortedEmails(input.allowedEmails).filter(
    (email) => !blockedEmails.includes(email),
  );
  const blockedGroupIds = dedupeSortedStrings(input.blockedGroupIds);
  const allowedGroupIds = dedupeSortedStrings(input.allowedGroupIds).filter(
    (groupId) => !blockedGroupIds.includes(groupId),
  );
  return {
    settingsJson: buildComparableSettingsJson(input.settingsJson, options),
    allowedEmails,
    blockedEmails,
    allowedGroupIds,
    blockedGroupIds,
  };
};

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const aKeys = Object.keys(aRecord).sort();
    const bKeys = Object.keys(bRecord).sort();
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(
      (key, index) =>
        key === bKeys[index] && deepEqual(aRecord[key], bRecord[key]),
    );
  }
  return false;
};

/** Key-order-insensitive comparison (JSONB does not preserve key order). */
export const presetComparablesEqual = (
  a: PresetComparable,
  b: PresetComparable,
): boolean => deepEqual(a, b);
