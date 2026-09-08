type StorageAssetKind = "document" | "data-room-document" | "branding";

type WorkspaceStoragePathValidation =
  | { ok: true; normalizedPath: string }
  | { ok: false; reason: "invalid_path" | "wrong_workspace" };

const normalizeStoragePath = (path: string): string => path.replace(/^\/+/, "");

export const validatePathBelongsToWorkspace = (
  path: string,
  workspaceId: string,
): WorkspaceStoragePathValidation => {
  const normalizedPath = normalizeStoragePath(path);

  if (
    normalizedPath.includes("..") ||
    normalizedPath.includes("//") ||
    normalizedPath.includes("\\") ||
    normalizedPath.includes("\0")
  ) {
    return { ok: false, reason: "invalid_path" };
  }

  if (!normalizedPath.startsWith(`workspaces/${workspaceId}/`)) {
    return { ok: false, reason: "wrong_workspace" };
  }

  return { ok: true, normalizedPath };
};

const truncateUtf8 = (value: string, maxBytes: number): string => {
  if (maxBytes <= 0) return "";
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;

  let result = "";
  let usedBytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (usedBytes + characterBytes > maxBytes) break;
    result += character;
    usedBytes += characterBytes;
  }
  return result;
};

export const fitStorageFilename = (
  filename: string,
  maxBytes = 255,
): string => {
  if (Buffer.byteLength(filename, "utf8") <= maxBytes) return filename;

  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? truncateUtf8(filename.slice(dot + 1), 64) : "";
  const suffix = extension ? `.${extension}` : "";
  const baseBudget = Math.max(1, maxBytes - Buffer.byteLength(suffix, "utf8"));
  return `${truncateUtf8(base, baseBudget) || "f"}${suffix}`;
};

/** Builds the private object-name segment while respecting filesystem bytes. */
export const buildUniqueUploadFilename = (
  filename: string,
  token: string,
  maxBytes = 255,
): string => {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot + 1) : "";
  const safeToken = truncateUtf8(token, 64) || "upload";
  const tokenSuffix = `__${safeToken}`;
  const extensionBudget = Math.max(
    0,
    maxBytes - Buffer.byteLength(tokenSuffix, "utf8") - 2,
  );
  const clippedExtension = truncateUtf8(extension, extensionBudget);
  const suffix = clippedExtension
    ? `${tokenSuffix}.${clippedExtension}`
    : tokenSuffix;
  const baseBudget = Math.max(1, maxBytes - Buffer.byteLength(suffix, "utf8"));
  const clippedBase = truncateUtf8(base, baseBudget) || "f";
  return `${clippedBase}${suffix}`;
};

/**
 * Build the logical storage path used across the app for R2 object keys.
 *
 * IMPORTANT:
 * - Callers must validate `workspaceId`, `filename`, and any ids with Zod in the API boundary.
 * - `filename` must be a *safe path segment* (no slashes/backslashes/null bytes/etc).
 */
export const buildStoragePath = (params: {
  assetKind: StorageAssetKind;
  workspaceId: string;
  filename: string;
  folderId?: string | null;
  dataRoomId?: string | null;
  brandingSubpath?: string;
}): string => {
  const {
    assetKind,
    workspaceId,
    filename,
    folderId = null,
    dataRoomId = null,
    brandingSubpath,
  } = params;

  switch (assetKind) {
    case "document":
      return `workspaces/${workspaceId}/folders/${folderId ?? "root"}/${filename}`;
    case "data-room-document":
      if (!dataRoomId) {
        throw new Error("dataRoomId is required for data-room-document");
      }
      return `workspaces/${workspaceId}/data-rooms/${dataRoomId}/folders/${folderId ?? "root"}/${filename}`;
    case "branding":
      if (brandingSubpath) {
        return `workspaces/${workspaceId}/${brandingSubpath}/${filename}`;
      }
      return `workspaces/${workspaceId}/${filename}`;
    default: {
      const exhaustive: never = assetKind;
      throw new Error(`Unknown asset kind: ${exhaustive}`);
    }
  }
};
