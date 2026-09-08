import { NextRequest, NextResponse } from "next/server";
import {
  replaceWithVersioning,
  versioningReplaceSchema,
} from "@/modules/document-versioning";
import {
  canEditDocumentsScope,
  requireAuthenticatedUser,
} from "@/modules/document-versioning/server/access";
import {
  isDocumentVersioningError,
  VersioningPreMutationConflictError,
} from "@/modules/document-versioning/server/errors";
import { validateVersioningReplaceStoragePaths } from "@/modules/document-versioning/server/replaceStoragePaths";

export async function POST(req: NextRequest) {
  try {
    await requireAuthenticatedUser();

    const body = await req.json().catch(() => ({}));
    const parsed = versioningReplaceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const storagePaths = validateVersioningReplaceStoragePaths({
      workspaceId: parsed.data.workspaceId,
      storagePath: parsed.data.uploaded.storagePath,
      convertedStoragePath: parsed.data.uploaded.convertedStoragePath ?? null,
    });
    if (!storagePaths.ok) {
      return NextResponse.json(
        { error: "Invalid storagePath" },
        { status: 400 },
      );
    }

    const canEdit = await canEditDocumentsScope({
      workspaceId: parsed.data.workspaceId,
      dataRoomId: parsed.data.uploaded.dataRoomId ?? null,
    });

    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await replaceWithVersioning({
      workspaceId: parsed.data.workspaceId,
      documentId: parsed.data.documentId,
      uploaded: {
        storagePath: storagePaths.storagePath,
        convertedStoragePath: storagePaths.convertedStoragePath,
        conversionStatus: parsed.data.uploaded.conversionStatus,
        sizeBytes: parsed.data.uploaded.sizeBytes,
        numPages: parsed.data.uploaded.numPages ?? null,
        title: parsed.data.uploaded.title,
        fileType: parsed.data.uploaded.fileType,
        folderId: parsed.data.uploaded.folderId,
        dataRoomId: parsed.data.uploaded.dataRoomId ?? null,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    if (isDocumentVersioningError(error) && error.code === "unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.name === "STORAGE_QUOTA_EXCEEDED") {
      return NextResponse.json(
        {
          error:
            "Replacing this file would exceed your included storage limit.",
          code: "STORAGE_LIMIT_EXCEEDED",
        },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.name === "FREE_PLAN_PDF_ONLY") {
      return NextResponse.json(
        {
          error: error.message,
          code: "FREE_PLAN_PDF_ONLY",
        },
        { status: 403 },
      );
    }
    if (error instanceof VersioningPreMutationConflictError) {
      return NextResponse.json(
        {
          error: "This document is currently being deleted.",
          code: "DOCUMENT_DELETION_IN_PROGRESS",
        },
        { status: 409 },
      );
    }
    if (
      isDocumentVersioningError(error) &&
      (error.code === "document_not_found" ||
        error.code === "document_scope_mismatch")
    ) {
      console.error("[documents.versioning.replace] not found/mismatch", {
        message: error.message,
      });
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    console.error("[documents.versioning.replace] unexpected error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
