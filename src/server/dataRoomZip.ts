import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import { Zip, ZipDeflate } from "fflate";
import { engineFailureSchema } from "@/server/engineErrors";

/**
 * Minimal folder record needed for ZIP path building.
 */
export type ZipFolder = {
  id: string;
  name: string | null;
  parent_folder_id: string | null;
};

/**
 * Minimal document record needed for ZIP path building.
 */
export type ZipDocument = {
  id: string;
  title: string | null;
  file_type: string | null;
  storage_path: string | null;
  folder_id: string | null;
};

type StreamingZipSource = {
  /** Source chunks. Only one entry is consumed at a time. */
  chunks: AsyncIterable<Uint8Array>;
  /** Releases the active object/body when complete, cancelled, or failed. */
  close?: () => Promise<void> | void;
};

export type StreamingZipEntry = {
  /** Path inside ZIP (e.g., "folder1/subfolder2/document.pdf"). */
  zipPath: string;
  /** Lazily opens the source after the preceding entry has closed. */
  open: (signal: AbortSignal) => Promise<StreamingZipSource>;
};

type StreamingZipOptions = {
  maxUncompressedBytes: number;
  /** Cancels source reads and archive construction at the operation deadline. */
  signal?: AbortSignal;
};

type StreamingZipCompletion = {
  archiveBytes: number;
  sourceBytes: number;
};

type StreamingZipArchive = {
  stream: ReadableStream<Uint8Array>;
  completion: Promise<StreamingZipCompletion>;
};

type StagedZipEntry = {
  entry: StreamingZipEntry;
  byteLength: number;
};

type ZipTempWorkspace = {
  directoryPath: string;
  stageBuffer: (zipPath: string, bytes: Uint8Array) => Promise<StagedZipEntry>;
  cleanup: () => Promise<void>;
};

type ZipTempWorkspaceOptions = {
  maxStagedBytes?: number;
};

/**
 * Document metadata with computed ZIP path (bytes to be loaded later).
 */
type ZipDocumentMeta = {
  document: ZipDocument;
  zipPath: string;
};

/**
 * Sanitize a path segment for use in ZIP filenames.
 * Removes or replaces characters that may cause issues in file systems.
 */
const sanitizePathSegment = (segment: string | null): string => {
  if (!segment) return "Untitled";
  const unsafeChars = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"]);
  let sanitized = "";
  const trimmed = segment.trim();

  for (const char of trimmed) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || unsafeChars.has(char)) {
      sanitized += "_";
    } else {
      sanitized += char;
    }
  }

  return (
    sanitized
      .replace(/\s+/g, " ") // Normalize whitespace
      .slice(0, 200) // Reasonable length limit
      .trim() || "Untitled"
  );
};

/**
 * Builds a map of folder ID -> folder record for quick lookups.
 */
const buildFolderMap = (folders: ZipFolder[]): Map<string, ZipFolder> => {
  const map = new Map<string, ZipFolder>();
  for (const folder of folders) {
    map.set(folder.id, folder);
  }
  return map;
};

/**
 * Get all descendant folder IDs for a given folder (including itself).
 */
const getDescendantFolderIds = (
  folderId: string,
  folders: ZipFolder[],
): Set<string> => {
  const result = new Set<string>([folderId]);
  const childMap = new Map<string | null, ZipFolder[]>();

  // Build parent -> children map
  for (const folder of folders) {
    const parentKey = folder.parent_folder_id;
    if (!childMap.has(parentKey)) {
      childMap.set(parentKey, []);
    }
    childMap.get(parentKey)!.push(folder);
  }

  // BFS to collect all descendants
  const queue = [folderId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = childMap.get(current) || [];
    for (const child of children) {
      if (!result.has(child.id)) {
        result.add(child.id);
        queue.push(child.id);
      }
    }
  }

  return result;
};

/**
 * Build the folder path string for a document by walking up the folder tree.
 * Returns an array of folder name segments from root to leaf.
 */
const buildFolderPathSegments = (
  folderId: string | null,
  folderMap: Map<string, ZipFolder>,
): string[] => {
  if (!folderId) return [];

  const segments: string[] = [];
  let currentId: string | null = folderId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const folder = folderMap.get(currentId);
    if (!folder) break;
    segments.unshift(sanitizePathSegment(folder.name));
    currentId = folder.parent_folder_id;
  }

  return segments;
};

/**
 * Resolve filename collisions within the same ZIP directory.
 * If "document.pdf" already exists, returns "document (1).pdf", etc.
 */
const resolveFilenameCollision = (
  basePath: string,
  usedPaths: Set<string>,
): string => {
  if (!usedPaths.has(basePath.toLowerCase())) {
    return basePath;
  }

  // Split into directory, base name, and extension
  const lastSlash = basePath.lastIndexOf("/");
  const dirPart = lastSlash >= 0 ? basePath.slice(0, lastSlash + 1) : "";
  const fileName = lastSlash >= 0 ? basePath.slice(lastSlash + 1) : basePath;

  const lastDot = fileName.lastIndexOf(".");
  const namePart = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  const extPart = lastDot > 0 ? fileName.slice(lastDot) : "";

  let counter = 1;
  let candidate = basePath;
  while (usedPaths.has(candidate.toLowerCase())) {
    candidate = `${dirPart}${namePart} (${counter})${extPart}`;
    counter++;
    if (counter > 10000) {
      // Safety valve
      break;
    }
  }

  return candidate;
};

/**
 * Compute the ZIP path for a document, handling folder structure and collisions.
 */
const computeZipPath = (
  doc: ZipDocument,
  folderMap: Map<string, ZipFolder>,
  usedPaths: Set<string>,
  forceExtension?: string,
): string => {
  const folderSegments = buildFolderPathSegments(doc.folder_id, folderMap);

  // Determine filename
  let fileName = sanitizePathSegment(doc.title);
  const originalExt = doc.file_type?.toLowerCase() || "";

  // If forcing extension (e.g., for watermarked PDFs), update filename
  if (forceExtension) {
    // Remove existing extension if present
    const dotIndex = fileName.lastIndexOf(".");
    const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
    fileName = `${baseName}.${forceExtension}`;
  } else if (
    originalExt &&
    !fileName.toLowerCase().endsWith(`.${originalExt}`)
  ) {
    // Add original extension if missing
    fileName = `${fileName}.${originalExt}`;
  }

  // Build full path
  const fullPath =
    folderSegments.length > 0
      ? `${folderSegments.join("/")}/${fileName}`
      : fileName;

  // Resolve collisions
  const resolvedPath = resolveFilenameCollision(fullPath, usedPaths);
  usedPaths.add(resolvedPath.toLowerCase());

  return resolvedPath;
};

export type ZipScope = { kind: "room" } | { kind: "folder"; folderId: string };

type PrepareZipEntriesOptions = {
  folders: ZipFolder[];
  documents: ZipDocument[];
  scope: ZipScope;
  /** Selectively force only watermark-eligible documents to .pdf. */
  forcePdfDocumentIds?: ReadonlySet<string>;
};

type PrepareZipEntriesResult = {
  entries: ZipDocumentMeta[];
  /** Filtered documents that have no storage_path */
  skipped: ZipDocument[];
};

/**
 * Prepare ZIP entry metadata for documents based on scope.
 * Does not load file bytes - caller is responsible for that.
 */
export const prepareZipEntries = (
  options: PrepareZipEntriesOptions,
): PrepareZipEntriesResult => {
  const { folders, documents, scope, forcePdfDocumentIds } = options;
  const folderMap = buildFolderMap(folders);
  const usedPaths = new Set<string>();

  let filteredDocuments: ZipDocument[];

  if (scope.kind === "room") {
    // Include all documents
    filteredDocuments = documents;
  } else {
    // Include only documents in the folder subtree
    const descendantFolderIds = getDescendantFolderIds(scope.folderId, folders);
    // Include root folder (null folder_id) only if scope.folderId is root
    // For a specific folder, include docs directly in that folder + descendants
    filteredDocuments = documents.filter((doc) => {
      if (doc.folder_id === null) {
        // Root documents: only include if we're scoping to a folder that is at root level
        return false;
      }
      return descendantFolderIds.has(doc.folder_id);
    });

    // Also include documents directly in the target folder (folder_id matches)
    const directDocs = documents.filter(
      (doc) => doc.folder_id === scope.folderId,
    );
    for (const doc of directDocs) {
      if (!filteredDocuments.some((d) => d.id === doc.id)) {
        filteredDocuments.push(doc);
      }
    }
  }

  const entries: ZipDocumentMeta[] = [];
  const skipped: ZipDocument[] = [];

  // When scoping to a folder, we need to make paths relative to that folder
  let baseFolderDepth = 0;
  if (scope.kind === "folder") {
    const segments = buildFolderPathSegments(scope.folderId, folderMap);
    baseFolderDepth = segments.length;
  }

  for (const doc of filteredDocuments) {
    if (!doc.storage_path) {
      skipped.push(doc);
      continue;
    }

    let zipPath = computeZipPath(
      doc,
      folderMap,
      usedPaths,
      forcePdfDocumentIds?.has(doc.id) ? "pdf" : undefined,
    );

    // For folder scope, remove the base folder path prefix to make paths relative
    if (scope.kind === "folder" && baseFolderDepth > 0) {
      const pathParts = zipPath.split("/");
      if (pathParts.length > baseFolderDepth) {
        zipPath = pathParts.slice(baseFolderDepth).join("/");
        // Re-check collision with the new path
        if (usedPaths.has(zipPath.toLowerCase())) {
          zipPath = resolveFilenameCollision(zipPath, usedPaths);
        }
        usedPaths.add(zipPath.toLowerCase());
      }
    }

    entries.push({ document: doc, zipPath });
  }

  return { entries, skipped };
};

const abortError = (reason?: unknown): Error => {
  if (reason instanceof Error) return reason;
  const failure = engineFailureSchema.safeParse(reason);
  if (failure.success) {
    return Object.assign(new Error(failure.data.message), failure.data);
  }
  return new Error(
    typeof reason === "string" ? reason : "ZIP generation was cancelled",
  );
};

/**
 * Request-scoped staging for transformed files that must succeed before a
 * streaming 200 response begins. Raw R2 objects never pass through this dir.
 */
export const createZipTempWorkspace = async (
  options: ZipTempWorkspaceOptions = {},
): Promise<ZipTempWorkspace> => {
  const maxStagedBytes = options.maxStagedBytes ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(maxStagedBytes) || maxStagedBytes < 0) {
    throw new Error("maxStagedBytes must be a non-negative safe integer");
  }
  // Serverless runtimes expose a read-only filesystem apart from the OS temp
  // directory, so ZIP staging must live there — never under the project root.
  const directoryPath = await mkdtemp(path.join(tmpdir(), "doc-kosha-zip-"));
  let nextFileId = 0;
  let stagedBytes = 0;
  let cleaned = false;

  const cleanup = async (): Promise<void> => {
    if (cleaned) return;
    cleaned = true;
    await rm(directoryPath, { recursive: true, force: true });
  };

  const stageBuffer = async (
    zipPath: string,
    bytes: Uint8Array,
  ): Promise<StagedZipEntry> => {
    if (cleaned) throw new Error("ZIP temporary workspace is already closed");
    const nextStagedBytes = stagedBytes + bytes.byteLength;
    if (nextStagedBytes > maxStagedBytes) {
      throw new Error(
        `ZIP temporary storage exceeds the ${maxStagedBytes} byte limit`,
      );
    }
    stagedBytes = nextStagedBytes;
    const filePath = path.join(
      directoryPath,
      `${String(nextFileId).padStart(4, "0")}.bin`,
    );
    nextFileId += 1;
    try {
      await writeFile(filePath, bytes, { flag: "wx" });
    } catch (error) {
      stagedBytes -= bytes.byteLength;
      throw error;
    }

    return {
      byteLength: bytes.byteLength,
      entry: {
        zipPath,
        open: async (signal) => {
          const source = createReadStream(filePath, {
            highWaterMark: 64 * 1024,
          });
          let closed = false;
          const onAbort = (): void => {
            source.destroy(abortError(signal.reason));
          };
          if (signal.aborted) onAbort();
          else signal.addEventListener("abort", onAbort, { once: true });

          const close = async (): Promise<void> => {
            if (closed) return;
            closed = true;
            signal.removeEventListener("abort", onAbort);
            source.destroy();
          };
          const chunks = (async function* (): AsyncGenerator<Uint8Array> {
            try {
              for await (const chunk of source) {
                if (!(chunk instanceof Uint8Array)) {
                  throw new Error("Temporary ZIP file emitted invalid data");
                }
                yield chunk;
              }
            } finally {
              await close();
            }
          })();

          return { chunks, close };
        },
      },
    };
  };

  return { directoryPath, stageBuffer, cleanup };
};

/**
 * Build a ZIP as a bounded stream. Sources are opened sequentially, fflate
 * emits incremental output, and Node/Web stream backpressure prevents the
 * archive from accumulating in application memory.
 */
export const createStreamingZip = (
  entries: StreamingZipEntry[],
  options: StreamingZipOptions,
): StreamingZipArchive => {
  if (
    !Number.isSafeInteger(options.maxUncompressedBytes) ||
    options.maxUncompressedBytes < 0
  ) {
    throw new Error("maxUncompressedBytes must be a non-negative safe integer");
  }

  const abortController = new AbortController();
  const output = new PassThrough({ highWaterMark: 64 * 1024 });
  let outputNeedsDrain = false;
  let archiveBytes = 0;
  let sourceBytes = 0;
  let productionStarted = false;

  let resolveCompletion: (value: StreamingZipCompletion) => void;
  let rejectCompletion: (reason: Error) => void;
  const completion = new Promise<StreamingZipCompletion>((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });
  // Callers still receive the rejecting promise; this early observer prevents
  // a fast source failure from becoming an unhandled rejection before a route
  // attaches its completion/cancellation bookkeeping.
  void completion.catch(() => undefined);

  const cancel = (reason?: unknown): void => {
    if (!abortController.signal.aborted) {
      abortController.abort(abortError(reason));
    }
    if (!output.destroyed) output.destroy(abortError(reason));
  };

  const onExternalAbort = (): void => cancel(options.signal?.reason);
  if (options.signal?.aborted) onExternalAbort();
  else
    options.signal?.addEventListener("abort", onExternalAbort, {
      once: true,
    });
  void completion.then(
    () => options.signal?.removeEventListener("abort", onExternalAbort),
    () => options.signal?.removeEventListener("abort", onExternalAbort),
  );

  const waitForOutput = async (): Promise<void> => {
    if (!outputNeedsDrain) return;
    outputNeedsDrain = false;
    if (output.destroyed) throw abortError(abortController.signal.reason);
    // A writable never emits 'drain' once end() has been called; the consumer
    // empties the remaining buffer through the readable side instead.
    if (output.writableEnded) return;
    await once(output, "drain", { signal: abortController.signal });
  };

  const produce = async (): Promise<void> => {
    let zipFinalResolve: (() => void) | null = null;
    let zipFinalReject: ((reason: Error) => void) | null = null;
    const zipFinished = new Promise<void>((resolve, reject) => {
      zipFinalResolve = resolve;
      zipFinalReject = reject;
    });
    void zipFinished.catch(() => undefined);

    const zip = new Zip((error, data, final) => {
      if (error) {
        const normalized = abortError(error);
        zipFinalReject?.(normalized);
        if (!output.destroyed) output.destroy(normalized);
        return;
      }

      if (data.byteLength > 0) {
        archiveBytes += data.byteLength;
        // Copy fflate's callback buffer before returning it to the compressor.
        // The final (central directory) write must not arm waitForOutput:
        // end() below suppresses every future 'drain', so awaiting one would
        // hang completion even though the consumer still receives the bytes.
        if (!output.write(Buffer.from(data)) && !final) outputNeedsDrain = true;
      }

      if (final) {
        output.end();
        zipFinalResolve?.();
      }
    });

    try {
      for (const entry of entries) {
        if (abortController.signal.aborted) {
          throw abortError(abortController.signal.reason);
        }

        const source = await entry.open(abortController.signal);
        try {
          const file = new ZipDeflate(entry.zipPath, { level: 6 });
          zip.add(file);

          for await (const chunk of source.chunks) {
            if (abortController.signal.aborted) {
              throw abortError(abortController.signal.reason);
            }
            if (!(chunk instanceof Uint8Array)) {
              throw new Error(
                `ZIP source ${entry.zipPath} emitted invalid data`,
              );
            }

            const nextSourceBytes = sourceBytes + chunk.byteLength;
            if (nextSourceBytes > options.maxUncompressedBytes) {
              throw new Error(
                `ZIP source bytes exceed the ${options.maxUncompressedBytes} byte limit`,
              );
            }
            sourceBytes = nextSourceBytes;
            file.push(chunk);
            await waitForOutput();
          }

          file.push(new Uint8Array(), true);
          await waitForOutput();
        } finally {
          await source.close?.();
        }
      }

      zip.end();
      await waitForOutput();
      await zipFinished;
      resolveCompletion({ archiveBytes, sourceBytes });
    } catch (error) {
      const normalized = abortError(error);
      zip.terminate();
      if (!output.destroyed) output.destroy(normalized);
      rejectCompletion(normalized);
    }
  };

  let webStreamSettled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      output.on("data", (chunk: Buffer) => {
        if (webStreamSettled) return;
        controller.enqueue(
          new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength),
        );
        if ((controller.desiredSize ?? 0) <= 0) output.pause();
      });
      output.once("end", () => {
        if (webStreamSettled) return;
        webStreamSettled = true;
        controller.close();
      });
      output.once("error", (error: Error) => {
        if (webStreamSettled) return;
        webStreamSettled = true;
        controller.error(error);
      });

      if (!productionStarted) {
        productionStarted = true;
        queueMicrotask(() => {
          void produce();
        });
      }
    },
    pull() {
      output.resume();
    },
    async cancel(reason) {
      webStreamSettled = true;
      cancel(reason);
      await completion.catch(() => undefined);
    },
  });

  return { stream, completion };
};

/**
 * Compute the recommended filename for the ZIP download.
 */
export const computeZipFilename = (
  roomName: string | null,
  scope: ZipScope,
  folders: ZipFolder[],
): string => {
  const baseName = sanitizePathSegment(roomName || "data-room");

  if (scope.kind === "room") {
    return `${baseName}.zip`;
  }

  // For folder scope, include folder name
  const folderMap = buildFolderMap(folders);
  const folder = folderMap.get(scope.folderId);
  const folderName = sanitizePathSegment(folder?.name ?? "folder");

  return `${baseName} - ${folderName}.zip`;
};
