import { NextRequest, NextResponse } from "next/server";
import {
  getConflictResolution,
  versioningConflictsSchema,
} from "@/modules/document-versioning";
import {
  canEditDocumentsScope,
  requireAuthenticatedUser,
} from "@/modules/document-versioning/server/access";
import { isDocumentVersioningError } from "@/modules/document-versioning/server/errors";

export async function POST(req: NextRequest) {
  try {
    await requireAuthenticatedUser();

    const body = await req.json().catch(() => ({}));
    const parsed = versioningConflictsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const dataRoomId = parsed.data.dataRoomId ?? null;
    const canEdit = await canEditDocumentsScope({
      workspaceId: parsed.data.workspaceId,
      dataRoomId,
    });

    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await getConflictResolution({
      workspaceId: parsed.data.workspaceId,
      dataRoomId,
      baseFolderId: parsed.data.baseFolderId,
      files: parsed.data.files,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (isDocumentVersioningError(error) && error.code === "unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[documents.versioning.conflicts] unexpected error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
