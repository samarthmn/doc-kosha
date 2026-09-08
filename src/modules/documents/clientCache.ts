import type { Tables } from "@/types/generated/supabase";

type DocumentsClientCacheEntry = {
  atMs: number;
  documents: Tables<"documents">[];
  folders: Tables<"folders">[];
  workspaces: Tables<"workspaces">[];
};

const DOCUMENTS_CLIENT_CACHE_TTL_MS = 10 * 60_000;

const documentsClientCache = new Map<string, DocumentsClientCacheEntry>();

export const getDocumentsClientCacheKey = (
  dataRoomId: string | null,
): string | null => {
  if (!dataRoomId) return null;
  return `dataRoom:${dataRoomId}`;
};

export const readDocumentsClientCache = (
  key: string,
): DocumentsClientCacheEntry | null => {
  const hit = documentsClientCache.get(key) ?? null;
  if (!hit) return null;
  if (Date.now() - hit.atMs > DOCUMENTS_CLIENT_CACHE_TTL_MS) {
    documentsClientCache.delete(key);
    return null;
  }
  return hit;
};

export const writeDocumentsClientCache = (
  key: string,
  entry: Omit<DocumentsClientCacheEntry, "atMs">,
): void => {
  documentsClientCache.set(key, { atMs: Date.now(), ...entry });
};

export const invalidateDocumentsClientCache = (key: string): void => {
  documentsClientCache.delete(key);
};
