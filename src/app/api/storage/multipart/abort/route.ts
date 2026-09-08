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
import { abortMultipartUpload, type LogicalBucket } from "@/server/storage";
import { resolveMultipartAccessWithRetry } from "@/server/storage/multipartAccess";
import {
  assertMultipartIntentMatches,
  verifyMultipartUploadIntent,
} from "@/server/storage/multipartIntent";
import { trackWorkspaceBandwidth } from "@/server/workspaceUsage";

const LogicalBucketSchema = z.enum([
  STORAGE_BUCKET_NAME,
  CONVERTED_STORAGE_BUCKET_NAME,
  BRANDING_ASSETS_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  DATA_ROOM_CONVERTED_BUCKET_NAME,
]);

const RequestSchema = z.object({
  workspaceId: z.string().uuid(),
  logicalBucket: LogicalBucketSchema,
  storagePath: z.string().min(1).max(2048),
  uploadId: z.string().min(1).max(2048),
  intentToken: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { workspaceId, logicalBucket, storagePath, uploadId, intentToken } =
      parsed.data;

    if (!storagePath.startsWith(`workspaces/${workspaceId}/`)) {
      return NextResponse.json(
        { error: "Invalid storagePath" },
        { status: 400 },
      );
    }

    if (storagePath.includes("..")) {
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

    const parts = storagePath.split("/");
    const brandingIdx = parts.indexOf("branding");
    const dataRoomsIdx = parts.indexOf("data-rooms");
    const dataRoomId =
      dataRoomsIdx >= 0 ? (parts[dataRoomsIdx + 1] ?? null) : null;

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
      console.error("[Storage Multipart Abort] permission check failed", {
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

    const result = await abortMultipartUpload({
      logicalBucket: logicalBucket as LogicalBucket,
      path: storagePath,
      uploadId,
    });

    if (!result.ok) {
      console.error("[Storage Multipart Abort] failed", {
        status: result.status,
        message: result.message,
      });
      return NextResponse.json(
        { error: "Failed to cancel upload" },
        { status: result.status },
      );
    }

    // Track R2 Class A ops: AbortMultipartUpload
    void trackWorkspaceBandwidth(workspaceId, 0, 0, { r2ClassAOps: 1 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Storage Multipart Abort] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
