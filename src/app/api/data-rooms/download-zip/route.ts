import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  DATA_ROOM_STORAGE_BUCKET_NAME,
  DATA_ROOM_ZIP_MAX_DOCUMENTS,
  DATA_ROOM_ZIP_MAX_INPUT_BYTES,
  ZIP_DOWNLOAD_OPERATION_TIMEOUT_MS,
} from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { getObjectByteLength, openExactObjectStream } from "@/server/storage";
import { sanitizeFileName } from "@/server/storage/downloadUtils";
import {
  prepareZipEntries,
  createStreamingZip,
  computeZipFilename,
  type ZipFolder,
  type ZipDocument,
  type ZipScope,
  type StreamingZipEntry,
} from "@/server/dataRoomZip";
import {
  createOperationDeadline,
  createOperationDeadlineSignal,
  runWithinOperationDeadline,
} from "@/server/operationDeadline";
import {
  engineFailureSchema,
  toPublicEngineErrorResponse,
} from "@/server/engineErrors";

export const maxDuration = 300;

type DocumentRecord = {
  id: string;
  title: string | null;
  file_type: string | null;
  storage_path: string | null;
  folder_id: string | null;
};

type FolderRecord = {
  id: string;
  name: string | null;
  parent_folder_id: string | null;
};

const RequestSchema = z.object({
  dataRoomId: z.string().uuid(),
  scope: z.enum(["room", "folder"]),
  folderId: z.string().uuid().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const deadline = createOperationDeadline(ZIP_DOWNLOAD_OPERATION_TIMEOUT_MS);
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { dataRoomId, scope, folderId } = parsed.data;

    // Validate folder scope
    if (scope === "folder" && !folderId) {
      return NextResponse.json(
        { error: "folderId required for folder scope" },
        { status: 400 },
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch room (RLS will enforce access)
    const { data: room, error: roomError } = await supabase
      .from("data_rooms")
      .select("id, name, workspace_id")
      .eq("id", dataRoomId)
      .maybeSingle();

    if (roomError || !room) {
      return NextResponse.json(
        { error: "Data room not found" },
        { status: 404 },
      );
    }

    // Fetch folders and documents (RLS will enforce access)
    const [foldersResult, docsResult] = await Promise.all([
      supabase
        .from("folders")
        .select("id, name, parent_folder_id")
        .eq("data_room_id", dataRoomId),
      supabase
        .from("documents")
        .select("id, title, file_type, storage_path, folder_id")
        .eq("data_room_id", dataRoomId),
    ]);

    if (foldersResult.error) {
      return NextResponse.json(
        { error: "Unable to load folders" },
        { status: 500 },
      );
    }

    if (docsResult.error) {
      return NextResponse.json(
        { error: "Unable to load documents" },
        { status: 500 },
      );
    }

    const folders = (foldersResult.data ?? []) as FolderRecord[];
    const documents = ((docsResult.data ?? []) as DocumentRecord[])
      .filter((d) => d.id && d.storage_path)
      .sort((a, b) => (a.title || "").localeCompare(b.title || ""));

    if (documents.length === 0) {
      return NextResponse.json(
        { error: "No documents to download" },
        { status: 404 },
      );
    }

    // Prepare ZIP entries
    const zipScope: ZipScope =
      scope === "folder" && folderId
        ? { kind: "folder", folderId }
        : { kind: "room" };

    const zipFolders: ZipFolder[] = folders.map((f) => ({
      id: f.id,
      name: f.name,
      parent_folder_id: f.parent_folder_id,
    }));

    const zipDocuments: ZipDocument[] = documents.map((d) => ({
      id: d.id,
      title: d.title,
      file_type: d.file_type,
      storage_path: d.storage_path,
      folder_id: d.folder_id,
    }));

    const { entries, skipped } = prepareZipEntries({
      folders: zipFolders,
      documents: zipDocuments,
      scope: zipScope,
    });

    if (entries.length > DATA_ROOM_ZIP_MAX_DOCUMENTS) {
      return NextResponse.json(
        {
          error: `Too many documents to zip (max ${DATA_ROOM_ZIP_MAX_DOCUMENTS})`,
        },
        { status: 413 },
      );
    }

    if (entries.length === 0) {
      return NextResponse.json(
        { error: "No documents in the selected scope" },
        { status: 404 },
      );
    }

    if (skipped.length > 0) {
      console.warn(
        `[Auth ZIP Download] Skipped ${skipped.length} documents without storage_path`,
      );
    }

    // HEAD every immutable source before GET so oversized archives fail before
    // a response begins and missing objects can be listed in the ZIP note.
    const streamEntries: StreamingZipEntry[] = [];
    const omittedZipPaths: string[] = [];
    let totalBytes = 0;

    // Create a map of document ID to document record for quick lookup
    const docMap = new Map<string, DocumentRecord>();
    for (const doc of documents) {
      docMap.set(doc.id, doc);
    }

    const preflightResults = await Promise.all(
      entries.map(async (entry) => {
        const doc = docMap.get(entry.document.id);
        if (!doc?.storage_path) {
          return { entry, doc, size: null, message: "Storage path missing" };
        }
        const storagePath = doc.storage_path;
        const sizeResult = await runWithinOperationDeadline(deadline, {
          operation: "conversion",
          format: "zip",
          run: async () =>
            getObjectByteLength({
              logicalBucket: DATA_ROOM_STORAGE_BUCKET_NAME,
              path: storagePath,
            }),
        });
        return sizeResult.ok
          ? { entry, doc, size: sizeResult.byteLength, message: null }
          : { entry, doc, size: null, message: sizeResult.message };
      }),
    );

    for (const result of preflightResults) {
      if (result.size === null || !result.doc?.storage_path) {
        console.warn(
          `[Auth ZIP Download] Failed to preflight ${result.doc?.id ?? result.entry.document.id}: ${result.message}`,
        );
        omittedZipPaths.push(result.entry.zipPath);
        continue;
      }

      totalBytes += result.size;
      if (totalBytes > DATA_ROOM_ZIP_MAX_INPUT_BYTES) {
        return NextResponse.json(
          {
            error: `ZIP file too large (max ${DATA_ROOM_ZIP_MAX_INPUT_BYTES} bytes)`,
          },
          { status: 413 },
        );
      }

      const storagePath = result.doc.storage_path;
      const expectedBytes = result.size;
      streamEntries.push({
        zipPath: result.entry.zipPath,
        open: async (signal) => {
          const opened = await openExactObjectStream({
            logicalBucket: DATA_ROOM_STORAGE_BUCKET_NAME,
            path: storagePath,
            expectedBytes,
            signal,
          });
          if (!opened.ok) {
            throw new Error(
              `Unable to stream ${result.doc.id}: ${opened.message}`,
            );
          }
          return { chunks: opened.chunks, close: opened.close };
        },
      });
    }

    if (streamEntries.length === 0) {
      return NextResponse.json(
        { error: "No files could be processed for download" },
        { status: 500 },
      );
    }

    // Surface partial failures: list omitted files inside the ZIP itself
    if (omittedZipPaths.length > 0) {
      const missingNote = [
        "These files could not be included in this download. Please try again or contact the document owner.",
        "",
        ...omittedZipPaths,
        "",
      ].join("\n");
      const missingNoteBytes = new TextEncoder().encode(missingNote);
      if (
        totalBytes + missingNoteBytes.byteLength >
        DATA_ROOM_ZIP_MAX_INPUT_BYTES
      ) {
        return NextResponse.json(
          {
            error: `ZIP file too large (max ${DATA_ROOM_ZIP_MAX_INPUT_BYTES} bytes)`,
          },
          { status: 413 },
        );
      }
      totalBytes += missingNoteBytes.byteLength;
      streamEntries.push({
        zipPath: "_MISSING_FILES.txt",
        open: async () => ({
          chunks: (async function* () {
            yield missingNoteBytes;
          })(),
        }),
      });
    }

    const deadlineSignal = createOperationDeadlineSignal(deadline, {
      operation: "conversion",
      format: "zip",
    });
    const archive = createStreamingZip(streamEntries, {
      maxUncompressedBytes: DATA_ROOM_ZIP_MAX_INPUT_BYTES,
      signal: deadlineSignal.signal,
    });
    void archive.completion
      .catch((error) => {
        console.warn(
          "[Auth ZIP Download] Stream ended before completion",
          error,
        );
      })
      .finally(() => deadlineSignal.dispose());

    // Compute filename
    const zipFilename = computeZipFilename(room.name, zipScope, zipFolders);
    const safeFilename = sanitizeFileName(
      zipFilename.replace(/\.zip$/, ""),
      "zip",
    );

    return new NextResponse(archive.stream, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const parsedFailure = engineFailureSchema.safeParse(err);
    if (parsedFailure.success) {
      const publicFailure = toPublicEngineErrorResponse(parsedFailure.data);
      return NextResponse.json(publicFailure.body, {
        status: publicFailure.status,
      });
    }
    console.error("[Auth ZIP Download] Unexpected error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
