const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroenabled.12",
  csv: "text/csv",
  md: "text/markdown",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  aac: "audio/aac",
};

export const getMimeType = (extension: string): string => {
  const normalized = extension.toLowerCase();
  return MIME_TYPES[normalized] || "application/octet-stream";
};

export const sanitizeFileName = (name: string, ext: string): string => {
  const base = name
    .trim()
    .replace(/[^a-zA-Z0-9-_. ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);

  const normalizedExt = ext ? ext.replace(/^[.]+/, "") : "";

  if (!base) {
    return normalizedExt ? `document.${normalizedExt}` : "document";
  }

  if (normalizedExt && base.toLowerCase().endsWith(`.${normalizedExt}`)) {
    return base;
  }

  return normalizedExt ? `${base}.${normalizedExt}` : base;
};
