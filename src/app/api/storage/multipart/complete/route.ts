import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import {
  BRANDING_ASSETS_BUCKET_NAME,
  CONVERTED_STORAGE_BUCKET_NAME,
  DATA_ROOM_CONVERTED_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  STORAGE_BUCKET_NAME,
} from "@/lib/constants";
import {
  completeMultipartUpload,
  deleteObject,
  headObject,
  type LogicalBucket,
} from "@/server/storage";
import { assertDocumentUploadAllowed } from "@/modules/billing/server/planGuards";
import {
  assertMultipartIntentMatches,
  isDocumentMultipartIntent,
  verifyMultipartUploadIntent,
} from "@/server/storage/multipartIntent";
import { resolveMultipartAccessWithRetry } from "@/server/storage/multipartAccess";
import { trackWorkspaceBandwidth } from "@/server/workspaceUsage";

const LogicalBucketSchema = z.enum([
  STORAGE_BUCKET_NAME,
  CONVERTED_STORAGE_BUCKET_NAME,
  BRANDING_ASSETS_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  DATA_ROOM_CONVERTED_BUCKET_NAME,
]);

const PartSchema = z.object({
  partNumber: z.number().int().min(1).max(10_000),
  etag: z.string().min(1).max(512),
});

const RequestSchema = z.object({
  workspaceId: z.string().uuid(),
  logicalBucket: LogicalBucketSchema,
  storagePath: z.string().min(1).max(2048),
  uploadId: z.string().min(1).max(2048),
  intentToken: z.string().min(1),
  parts: z.array(PartSchema).min(1).max(10_000),
});

const validateCompletedPartNumbers = (
  parts: Array<{ partNumber: number }>,
  totalParts: number,
): boolean => {
  if (parts.length !== totalParts) return false;
  const seen = new Set<number>();
  for (const part of parts) {
    if (part.partNumber < 1 || part.partNumber > totalParts) return false;
    seen.add(part.partNumber);
  }
  return seen.size === totalParts;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const {
      workspaceId,
      logicalBucket,
      storagePath,
      uploadId,
      intentToken,
      parts,
    } = parsed.data;

    if (!storagePath.startsWith(`workspaces/${workspaceId}/`)) {
      return NextResponse.json(
        { error: "Invalid storagePath" },
        { status: 400 },
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const intent = verifyMultipartUploadIntent(intentToken);
    if (!intent) {
      return NextResponse.json(
        { error: "Invalid or expired multipart upload intent" },
        { status: 400 },
      );
    }

    const intentMatch = assertMultipartIntentMatches(intent, {
      userId: user.id,
      workspaceId,
      logicalBucket: logicalBucket as LogicalBucket,
      storagePath,
      uploadId,
    });
    if (!intentMatch.ok) {
      return NextResponse.json(
        { error: intentMatch.message },
        { status: intentMatch.status },
      );
    }
    if (!validateCompletedPartNumbers(parts, intent.totalParts)) {
      return NextResponse.json(
        { error: "Completed parts do not match multipart upload intent" },
        { status: 400 },
      );
    }

    const pathParts = storagePath.split("/");
    const brandingIdx = pathParts.indexOf("branding");
    const dataRoomsIdx = pathParts.indexOf("data-rooms");
    const dataRoomId =
      dataRoomsIdx >= 0 ? (pathParts[dataRoomsIdx + 1] ?? null) : null;

    const access = await resolveMultipartAccessWithRetry(async () => {
      if (brandingIdx >= 0) {
        const { data: workspace, error } = await supabase
          .from("workspaces")
          .select("created_by")
          .eq("id", workspaceId)
          .maybeSingle();
        return {
          data: workspace ? workspace.created_by === user.id : false,
          error,
        };
      }
      if (dataRoomId) {
        return await supabase.rpc("can_edit_data_room", {
          ws: workspaceId,
          room_id: dataRoomId,
        });
      }
      return await supabase.rpc("can_edit_workspace_documents", {
        ws: workspaceId,
      });
    });

    if (access.status === "unavailable") {
      console.error("[Storage Multipart Complete] permission check failed", {
        workspaceId,
        error: access.error,
      });
      return NextResponse.json(
        { error: "Unable to verify upload permissions" },
        { status: 503 },
      );
    }
    if (access.status === "denied") {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions" },
        { status: 403 },
      );
    }

    const completedParts = parts.map((p) => ({
      PartNumber: p.partNumber,
      ETag: p.etag,
    }));

    const result = await completeMultipartUpload({
      logicalBucket: logicalBucket as LogicalBucket,
      path: storagePath,
      uploadId,
      parts: completedParts,
    });

    if (!result.ok) {
      console.error("[Storage Multipart Complete] failed", {
        status: result.status,
        message: result.message,
      });
      return NextResponse.json(
        { error: "Failed to complete upload" },
        { status: result.status },
      );
    }

    if (isDocumentMultipartIntent(intent)) {
      const headResult = await headObject({
        logicalBucket: logicalBucket as LogicalBucket,
        path: storagePath,
      });

      if (!headResult.ok || headResult.contentLength !== intent.sizeBytes) {
        await deleteObject({
          logicalBucket: logicalBucket as LogicalBucket,
          path: storagePath,
        });
        return NextResponse.json(
          { error: "Uploaded object size does not match expected size" },
          { status: 400 },
        );
      }

      const uploadCheck = await assertDocumentUploadAllowed({
        workspaceId,
        filename: intent.filename,
        sizeBytes: headResult.contentLength,
        currentDocumentSizeBytes: intent.currentDocumentSizeBytes,
      });
      if (!uploadCheck.ok) {
        await deleteObject({
          logicalBucket: logicalBucket as LogicalBucket,
          path: storagePath,
        });
        return NextResponse.json(
          { error: uploadCheck.message, code: uploadCheck.code },
          { status: uploadCheck.status },
        );
      }
    }

    // Track UploadPart operations plus CompleteMultipartUpload operation.
    await trackWorkspaceBandwidth(workspaceId, 0, 0, {
      r2ClassAOps: parts.length + 1,
    });

    return NextResponse.json({ ok: true, etag: result.etag ?? null });
  } catch (err) {
    console.error("[Storage Multipart Complete] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
