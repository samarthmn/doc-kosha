export const STORAGE_BUCKET_NAME = "documents";
export const CONVERTED_STORAGE_BUCKET_NAME = "converted-documents";
export const BRANDING_ASSETS_BUCKET_NAME = "branding-assets";
export const DATA_ROOM_STORAGE_BUCKET_NAME = "data-room";
export const DATA_ROOM_CONVERTED_BUCKET_NAME = "converted-data-room";

// Supported file extensions per product docs
const SUPPORTED_TEXT_EXTENSIONS = [
  "pdf",
  "pptx",
  "docx",
  "xlsx",
  "xlsm",
  "csv",
  "md",
] as const;

const SUPPORTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;

const SUPPORTED_VIDEO_EXTENSIONS = [
  "mp4",
  "mov",
  "avi",
  "mkv",
  "webm",
] as const;

const SUPPORTED_AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "aac"] as const;

export const ALL_SUPPORTED_EXTENSIONS = [
  ...SUPPORTED_TEXT_EXTENSIONS,
  ...SUPPORTED_IMAGE_EXTENSIONS,
  ...SUPPORTED_VIDEO_EXTENSIONS,
  ...SUPPORTED_AUDIO_EXTENSIONS,
] as const;

const SUPPORTED_UPLOAD_EXTENSION_SET: ReadonlySet<string> = new Set(
  ALL_SUPPORTED_EXTENSIONS,
);

export const isSupportedUploadExtension = (extension: string): boolean =>
  SUPPORTED_UPLOAD_EXTENSION_SET.has(
    extension.trim().toLowerCase().replace(/^\./, ""),
  );

export const BRANDING_LOGO_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
export const TESTIMONIAL_HEADSHOT_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

export const PUBLIC_FEEDBACK_SUBMISSION_MAX_CHARS = 10_000;
export const PUBLIC_QA_QUESTION_MAX_CHARS = 500;
export const PUBLIC_QA_ANSWER_MAX_CHARS = 2_000;

// office-core wasm guards inputs at 50 MiB before copying into wasm memory.
// pdf-core permits larger csv/md inputs, but 50 MiB is the uniform product cap.
export const DOCUMENT_CONVERSION_MAX_INPUT_BYTES = 50 * 1024 * 1024;
// Match office-core's 50 MiB pre-copy guard. This intentionally replaces the
// former 20 MiB rollout setting now that the engine is always enabled.
export const OFFICE_ENGINE_MAX_INPUT_BYTES = 50 * 1024 * 1024;
// Existing PDFs and completed converted assets can be processed one at a time
// within the larger app/package PDF envelope. New conversion inputs use the
// uniform product limit above.
export const PDF_PROCESSING_MAX_INPUT_BYTES = 100 * 1024 * 1024;
export const PDF_MERGE_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
export const DATA_ROOM_ZIP_MAX_DOCUMENTS = 100;
export const DATA_ROOM_ZIP_MAX_INPUT_BYTES = 500 * 1024 * 1024;
// Vercel's writable /tmp is at most 500 MB. Only pre-response transforms use
// it; raw assets stream directly and retain the larger overall ZIP envelope.
export const DATA_ROOM_ZIP_MAX_STAGED_TRANSFORM_BYTES = 450 * 1024 * 1024;
// One app instance admits at most 32 distinct pending document jobs. With two
// active workers this allows a short burst without permitting unbounded memory
// growth or multi-minute queue latency.
export const DOCUMENT_PROCESSING_MAX_PENDING_TASKS = 32;
// Aggregate attempt budget includes claim, source IO, conversion, publication,
// validation, and cleanup while remaining below the 180-second route ceiling.
export const DOCUMENT_PROCESSING_OPERATION_TIMEOUT_MS = 165_000;
// Keep cleanup/final-state persistence out of the engine's conversion budget.
export const DOCUMENT_PROCESSING_CLEANUP_RESERVE_MS = 10_000;
// Overall deadline for one in-process engine call when no larger operation owns
// an absolute deadline.
export const DOCUMENT_CONVERSION_TIMEOUT_MS = 150_000;
// Redaction is one page-count + transform operation, including its source read.
export const REDACTION_OPERATION_TIMEOUT_MS = 90_000;
// Single and merged public PDF downloads stay inside their route ceilings.
export const PUBLIC_DOWNLOAD_OPERATION_TIMEOUT_MS = 165_000;
export const MERGED_DOWNLOAD_OPERATION_TIMEOUT_MS = 270_000;
export const MERGED_DOWNLOAD_FINALIZE_RESERVE_MS = 20_000;
// ZIP preflight, transforms, staging, and archive construction share this cap.
export const ZIP_DOWNLOAD_OPERATION_TIMEOUT_MS = 270_000;
export const ZIP_DOWNLOAD_FINALIZE_RESERVE_MS = 20_000;
// Developer diagnostics bound explicit engine smoke checks; startup stays lazy.
export const ENGINE_BOOT_PROBE_TIMEOUT_MS = 10_000;

// Role options for user profiles
export const ROLE_OPTIONS = [
  "Founder / Executive",
  "Sales",
  "Marketing",
  "Customer Success",
  "Product",
  "Engineering / IT",
  "Data / Analytics",
  "Finance",
  "Legal",
  "Operations",
  "Procurement / Vendor Mgmt",
  "Security / Compliance",
  "Design / Creative",
  "Other",
] as const;

export const INDUSTRY_OPTIONS = [
  "Software / SaaS",
  "Finance / Fintech",
  "Legal",
  "Healthcare / Life Sciences",
  "Education",
  "Manufacturing / Industrial",
  "Real Estate / Construction",
  "Consulting / Agency",
  "Media / Entertainment",
  "Government / Public Sector",
  "Nonprofit",
  "Energy / Utilities",
  "Retail / Ecommerce",
  "Other",
] as const;
