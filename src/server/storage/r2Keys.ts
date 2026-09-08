import {
  STORAGE_BUCKET_NAME,
  CONVERTED_STORAGE_BUCKET_NAME,
  BRANDING_ASSETS_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  DATA_ROOM_CONVERTED_BUCKET_NAME,
} from "@/lib/constants";

/**
 * Logical bucket names (matching Supabase bucket names in constants.ts).
 */
export type LogicalBucket =
  | typeof STORAGE_BUCKET_NAME
  | typeof CONVERTED_STORAGE_BUCKET_NAME
  | typeof BRANDING_ASSETS_BUCKET_NAME
  | typeof DATA_ROOM_STORAGE_BUCKET_NAME
  | typeof DATA_ROOM_CONVERTED_BUCKET_NAME;

/**
 * Mapping from logical Supabase bucket names to R2 key prefixes.
 * All objects go into a single R2 bucket with prefix "folders".
 */
const BUCKET_TO_PREFIX: Record<LogicalBucket, string> = {
  [STORAGE_BUCKET_NAME]: "documents",
  [CONVERTED_STORAGE_BUCKET_NAME]: "converted-documents",
  [BRANDING_ASSETS_BUCKET_NAME]: "branding",
  [DATA_ROOM_STORAGE_BUCKET_NAME]: "data-room",
  [DATA_ROOM_CONVERTED_BUCKET_NAME]: "converted-data-room",
};

/**
 * Normalize a path by removing leading slashes and collapsing multiple slashes.
 */
const normalizePath = (path: string): string =>
  path.replace(/^\/+/, "").replace(/\/+/g, "/");

/**
 * Convert a logical bucket + path to an R2 object key.
 * E.g., ("documents", "workspaces/abc/file.pdf") => "documents/workspaces/abc/file.pdf"
 */
export const toR2Key = (logicalBucket: LogicalBucket, path: string): string => {
  const prefix = BUCKET_TO_PREFIX[logicalBucket];
  if (!prefix) {
    throw new Error(`Unknown logical bucket: ${logicalBucket}`);
  }
  const normalizedPath = normalizePath(path);
  return `${prefix}/${normalizedPath}`;
};
