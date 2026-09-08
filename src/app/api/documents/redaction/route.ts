import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import {
  isCompletedConversionEligibleExtension,
  isPdfExtension,
} from "@/lib/fileTypes";
import {
  CONVERTED_STORAGE_BUCKET_NAME,
  DATA_ROOM_CONVERTED_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  PDF_PROCESSING_MAX_INPUT_BYTES,
  REDACTION_OPERATION_TIMEOUT_MS,
  STORAGE_BUCKET_NAME,
} from "@/lib/constants";
import { downloadToBufferBounded } from "@/server/storage";
import {
  buildRedactionWarningsHeader,
  REDACTION_WARNINGS_HEADER,
  redactPdf,
} from "@/server/redactionService";
import {
  createOperationDeadline,
  runWithinOperationDeadline,
} from "@/server/operationDeadline";
import {
  engineFailureSchema,
  toPublicEngineErrorResponse,
} from "@/server/engineErrors";
import {
  canEditDocumentsScope,
  requireAuthenticatedUser,
} from "@/modules/document-versioning/server/access";
import { isDocumentVersioningError } from "@/modules/document-versioning/server/errors";

const RedactionSchema = z.object({
  pageIndex: z.number().int().min(0),
  left: z.number().finite().min(0).max(100),
  top: z.number().finite().min(0).max(100),
  width: z.number().finite().gt(0).max(100),
  height: z.number().finite().gt(0).max(100),
});

const BodySchema = z.object({
  workspaceId: z.string().uuid(),
  documentId: z.string().uuid(),
  redactions: z
    .array(RedactionSchema)
    .min(1)
    .max(800)
    .refine(
      (items) => items.every((item) => item.left + item.width <= 100),
      "Redaction boxes must stay inside page bounds",
    )
    .refine(
      (items) => items.every((item) => item.top + item.height <= 100),
      "Redaction boxes must stay inside page bounds",
    ),
});

export async function POST(req: NextRequest) {
  const deadline = createOperationDeadline(REDACTION_OPERATION_TIMEOUT_MS);
  try {
    await requireAuthenticatedUser();

    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { workspaceId, documentId, redactions } = parsed.data;
    const supabase = await createSupabaseServerClient();

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select(
        "id,workspace_id,data_room_id,file_type,storage_path,converted_storage_path,conversion_status,num_pages",
      )
      .eq("id", documentId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (docError) {
      console.error("[documents.redaction] failed to load document", docError);
      return NextResponse.json(
        { error: "Failed to load document" },
        { status: 500 },
      );
    }

    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const canEdit = await canEditDocumentsScope({
      workspaceId,
      dataRoomId: doc.data_room_id ?? null,
    });
    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ext = (doc.file_type ?? "").toLowerCase();
    let sourcePath: string | null = null;
    let sourceBucket:
      | typeof STORAGE_BUCKET_NAME
      | typeof DATA_ROOM_STORAGE_BUCKET_NAME
      | typeof CONVERTED_STORAGE_BUCKET_NAME
      | typeof DATA_ROOM_CONVERTED_BUCKET_NAME
      | null = null;

    if (isPdfExtension(ext)) {
      sourcePath = doc.storage_path ?? null;
      sourceBucket = doc.data_room_id
        ? DATA_ROOM_STORAGE_BUCKET_NAME
        : STORAGE_BUCKET_NAME;
    } else if (isCompletedConversionEligibleExtension(ext)) {
      if (
        doc.conversion_status !== "completed" ||
        !doc.converted_storage_path?.trim()
      ) {
        return NextResponse.json(
          {
            error:
              "This file is still processing. Redaction is available after PDF conversion is complete.",
          },
          { status: 409 },
        );
      }
      sourcePath = doc.converted_storage_path;
      sourceBucket = doc.data_room_id
        ? DATA_ROOM_CONVERTED_BUCKET_NAME
        : CONVERTED_STORAGE_BUCKET_NAME;
    } else {
      return NextResponse.json(
        {
          error:
            "Redaction is currently available only for PDF and convertible document formats.",
        },
        { status: 400 },
      );
    }

    if (!sourcePath || !sourceBucket) {
      return NextResponse.json(
        { error: "Document source is not available" },
        { status: 409 },
      );
    }

    const source = await runWithinOperationDeadline(deadline, {
      operation: "redaction",
      format: "pdf",
      run: async () =>
        downloadToBufferBounded({
          logicalBucket: sourceBucket,
          path: sourcePath,
          maxBytes: PDF_PROCESSING_MAX_INPUT_BYTES,
        }),
    });

    if (!source.ok) {
      if (source.status === 413) {
        return NextResponse.json(
          { error: "This PDF is too large to redact." },
          { status: 413 },
        );
      }
      return NextResponse.json(
        { error: "Unable to load source PDF" },
        { status: source.status >= 400 ? source.status : 500 },
      );
    }

    const redacted = await redactPdf({
      sourcePdf: source.buffer,
      redactions,
      deadlineAt: deadline.deadlineAt,
    });

    if (!redacted.ok) {
      const publicFailure = toPublicEngineErrorResponse(redacted);
      return NextResponse.json(publicFailure.body, {
        status: publicFailure.status,
      });
    }

    const headers = new Headers({
      "Content-Type": "application/pdf",
      "Cache-Control": "private, max-age=0, no-store",
    });

    const fallbackPageCount =
      typeof doc.num_pages === "number" && doc.num_pages > 0
        ? doc.num_pages
        : null;
    const pageCount = redacted.pageCount ?? fallbackPageCount;
    if (pageCount) {
      headers.set("X-Redaction-Page-Count", String(pageCount));
    }
    // Stable enum codes only; never forward warning messages or document data.
    const warningHeader = buildRedactionWarningsHeader(redacted.warningCodes);
    if (warningHeader) {
      headers.set(REDACTION_WARNINGS_HEADER, warningHeader);
    }

    return new Response(redacted.pdfBytes, {
      status: 200,
      headers,
    });
  } catch (error) {
    const parsedFailure = engineFailureSchema.safeParse(error);
    if (parsedFailure.success) {
      const publicFailure = toPublicEngineErrorResponse(parsedFailure.data);
      return NextResponse.json(publicFailure.body, {
        status: publicFailure.status,
      });
    }
    if (isDocumentVersioningError(error) && error.code === "unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[documents.redaction] unexpected error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
