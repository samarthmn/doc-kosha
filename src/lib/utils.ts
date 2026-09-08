import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]): string => {
  return twMerge(clsx(inputs));
};

export const extractFilenameFromContentDisposition = (
  header: string | null,
): string | null => {
  if (!header) return null;
  const utfMatch = header.match(/filename\*\s*=\s*([^;]+)/i);
  if (utfMatch) {
    const raw = utfMatch[1].trim().replace(/^"|"$/g, "");
    // RFC 5987: charset'lang'encoded-value
    const match = raw.match(/^[^']*'[^']*'(.*)$/);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
    // Fallback for malformed format
    return raw;
  }

  const quotedMatch = header.match(/filename\s*=\s*"([^"]+)"/i);
  if (quotedMatch) {
    return quotedMatch[1];
  }

  const unquotedMatch = header.match(/filename\s*=\s*([^;]+)/i);
  if (unquotedMatch) {
    return unquotedMatch[1].trim().replace(/^"|"$|^'|'$/g, "");
  }

  return null;
};
