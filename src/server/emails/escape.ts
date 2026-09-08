const htmlEntityMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (match) => htmlEntityMap[match] ?? match);

export const escapeAttribute = (value: string): string => escapeHtml(value);

const allowedProtocols = new Set(["http:", "https:", "mailto:", "tel:"]);

export const sanitizeUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "#";
  }

  if (trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (allowedProtocols.has(url.protocol)) {
      return url.toString();
    }
  } catch {
    return "#";
  }

  return "#";
};

export const normalizeText = (value: string): string =>
  value.replace(/\r\n?/g, "\n");
