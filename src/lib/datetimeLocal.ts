const pad2 = (value: number): string => String(value).padStart(2, "0");

/**
 * Formats a Date into a native <input type="datetime-local"> value string:
 * `YYYY-MM-DDTHH:mm` in the user's local time.
 */
export const toDatetimeLocalValue = (date: Date | null | undefined): string => {
  if (!date) return "";
  if (!(date instanceof Date)) return "";
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

/**
 * Parses a native <input type="datetime-local"> value string (`YYYY-MM-DDTHH:mm`)
 * into a Date in the user's local time. Returns null for empty/invalid values.
 */
export const fromDatetimeLocalValue = (value: string): Date | null => {
  const raw = (value || "").trim();
  if (!raw) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    raw,
  );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  const seconds = match[6] ? Number(match[6]) : null;

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    (seconds !== null && !Number.isFinite(seconds))
  ) {
    return null;
  }

  const date = new Date(year, month - 1, day, hours, minutes, seconds ?? 0, 0);
  if (Number.isNaN(date.getTime())) return null;

  // Guard against invalid dates like 2026-02-31 (Date() will roll over).
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hours ||
    date.getMinutes() !== minutes ||
    (seconds !== null && date.getSeconds() !== seconds)
  ) {
    return null;
  }

  return date;
};
