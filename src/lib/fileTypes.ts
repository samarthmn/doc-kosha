const normalizeExt = (ext: string): string => (ext || "").toLowerCase();

const ACTIVE_CONVERTIBLE_EXTENSIONS: ReadonlySet<string> = new Set([
  "pptx",
  "docx",
  "xlsx",
  "xlsm",
  "csv",
  "md",
]);

const LEGACY_COMPLETED_CONVERSION_EXTENSIONS: ReadonlySet<string> = new Set([
  "doc",
  "ppt",
  "xls",
]);

const COMPLETED_CONVERSION_ELIGIBLE_EXTENSIONS: ReadonlySet<string> = new Set([
  ...ACTIVE_CONVERTIBLE_EXTENSIONS,
  ...LEGACY_COMPLETED_CONVERSION_EXTENSIONS,
]);

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "avi", "mkv"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "aac"]);

export const isActiveConvertibleExtension = (ext: string): boolean => {
  const e = normalizeExt(ext);
  return ACTIVE_CONVERTIBLE_EXTENSIONS.has(e);
};

export const isCompletedConversionEligibleExtension = (
  ext: string,
): boolean => {
  const e = normalizeExt(ext);
  return COMPLETED_CONVERSION_ELIGIBLE_EXTENSIONS.has(e);
};

export const isPdfExtension = (ext: string): boolean =>
  normalizeExt(ext) === "pdf";

export const isImageExtension = (ext: string): boolean => {
  return IMAGE_EXTENSIONS.has(normalizeExt(ext));
};

export const isVideoExtension = (ext: string): boolean => {
  return VIDEO_EXTENSIONS.has(normalizeExt(ext));
};

export const isAudioExtension = (ext: string): boolean => {
  return AUDIO_EXTENSIONS.has(normalizeExt(ext));
};

type FileTypeDescriptor = {
  category: "doc" | "image" | "audio" | "video";
  label: string;
  nounLower: string;
  actionVerb: string;
};

const FILE_TYPE_COPY: Record<
  FileTypeDescriptor["category"],
  Pick<FileTypeDescriptor, "label" | "nounLower" | "actionVerb">
> = {
  doc: {
    label: "Document",
    nounLower: "document",
    actionVerb: "view",
  },
  image: {
    label: "Image",
    nounLower: "image",
    actionVerb: "view",
  },
  video: {
    label: "Video",
    nounLower: "video",
    actionVerb: "watch",
  },
  audio: {
    label: "Audio",
    nounLower: "audio",
    actionVerb: "listen to",
  },
};

export const describeFileType = (
  ext: string | null | undefined,
): FileTypeDescriptor => {
  const normalized = normalizeExt(ext ?? "");
  const category: FileTypeDescriptor["category"] = IMAGE_EXTENSIONS.has(
    normalized,
  )
    ? "image"
    : VIDEO_EXTENSIONS.has(normalized)
      ? "video"
      : AUDIO_EXTENSIONS.has(normalized)
        ? "audio"
        : "doc";
  const copy = FILE_TYPE_COPY[category];
  return { category, ...copy };
};
