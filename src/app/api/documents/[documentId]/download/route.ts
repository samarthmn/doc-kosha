import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  DATA_ROOM_STORAGE_BUCKET_NAME,
  STORAGE_BUCKET_NAME,
} from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { getMimeType, sanitizeFileName } from "@/server/storage/downloadUtils";
import { downloadToBuffer, type LogicalBucket } from "@/server/storage";

const ParamsSchema = z.object({
  documentId: z.string().uuid(),
});

const bufferToArrayBuffer = (buffer: Buffer): ArrayBuffer => {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
};

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const params = await context.params;
    const parseResult = ParamsSchema.safeParse(params);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid document id" },
        { status: 400 },
      );
    }

    const { documentId } = parseResult.data;
    const supabase = await createSupabaseServerClient();

    const { data: doc, error } = await supabase
      .from("documents")
      .select(
        "id, title, file_type, storage_path, converted_storage_path, conversion_status, data_room_id",
      )
      .eq("id", documentId)
      .maybeSingle();

    if (error || !doc || !doc.storage_path) {
      const status = error?.code === "PGRST116" ? 404 : 403;
      return NextResponse.json(
        { error: "Document not accessible" },
        { status },
      );
    }

    const logicalBucket: LogicalBucket = doc.data_room_id
      ? DATA_ROOM_STORAGE_BUCKET_NAME
      : STORAGE_BUCKET_NAME;

    const downloadResult = await downloadToBuffer({
      logicalBucket,
      path: doc.storage_path,
    });

    if (!downloadResult.ok) {
      console.error("[Document Download] Storage download failed", {
        status: downloadResult.status,
        message: downloadResult.message,
      });
      return NextResponse.json(
        { error: "Unable to download file" },
        { status: 500 },
      );
    }

    const buffer = downloadResult.buffer;

    const extension = (
      doc.file_type ||
      doc.storage_path.split(".").pop() ||
      "bin"
    ).toLowerCase();
    const contentType = getMimeType(extension);
    const fileName = sanitizeFileName(doc.title || "document", extension);

    const responseBody = bufferToArrayBuffer(buffer);
    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.byteLength.toString(),
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[Document Download] Unexpected error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
