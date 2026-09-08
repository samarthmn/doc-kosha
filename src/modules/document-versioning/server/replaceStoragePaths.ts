import { validatePathBelongsToWorkspace } from "@/server/storage/storagePaths";

type ValidatedReplaceStoragePaths =
  | {
      ok: true;
      storagePath: string;
      convertedStoragePath: string | null;
    }
  | { ok: false };

export const validateVersioningReplaceStoragePaths = (params: {
  workspaceId: string;
  storagePath: string;
  convertedStoragePath: string | null;
}): ValidatedReplaceStoragePaths => {
  const original = validatePathBelongsToWorkspace(
    params.storagePath,
    params.workspaceId,
  );
  if (!original.ok) return { ok: false };

  if (!params.convertedStoragePath) {
    return {
      ok: true,
      storagePath: original.normalizedPath,
      convertedStoragePath: null,
    };
  }

  const converted = validatePathBelongsToWorkspace(
    params.convertedStoragePath,
    params.workspaceId,
  );
  if (!converted.ok) return { ok: false };

  return {
    ok: true,
    storagePath: original.normalizedPath,
    convertedStoragePath: converted.normalizedPath,
  };
};
