import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import {
  STORAGE_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  CONVERTED_STORAGE_BUCKET_NAME,
  DATA_ROOM_CONVERTED_BUCKET_NAME,
  BRANDING_ASSETS_BUCKET_NAME,
} from "@/lib/constants";
import { presignGetObject, type LogicalBucket } from "@/server/storage";

const LogicalBucketSchema = z.enum([
  STORAGE_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  CONVERTED_STORAGE_BUCKET_NAME,
  DATA_ROOM_CONVERTED_BUCKET_NAME,
  BRANDING_ASSETS_BUCKET_NAME,
]);

const QuerySchema = z.object({
  bucket: LogicalBucketSchema,
  path: z.string().min(1),
  workspaceId: z.string().uuid(),
  download: z.string().optional(),
});

const sanitizeFilename = (filename: string): string => {
  return filename
    .replace(/[\r\n]/g, "")
    .replace(/\0/g, "")
    .replace(/"/g, '\\"')
    .slice(0, 255);
};

const extractWorkspaceIdFromPath = (path: string): string | null => {
  // Paths follow pattern: workspaces/{workspaceId}/...
  const match = path.match(/^workspaces\/([a-f0-9-]{36})\//);
  return match?.[1] ?? null;
};

const normalizeStoragePath = (path: string): string => {
  // Keep behavior consistent with R2 key normalization (strip leading slashes).
  return path.replace(/^\/+/, "");
};

const isSafeStoragePath = (path: string): boolean => {
  // Reject traversal / ambiguous encodings
  if (path.includes("..")) return false;
  if (path.includes("\\")) return false;
  if (path.includes("\0")) return false;
  if (path.includes("//")) return false;
  return true;
};

const handleFileRequest = async (
  req: NextRequest,
  options: { isHead?: boolean } = {},
): Promise<Response> => {
  try {
    const isHead = options.isHead === true;
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      bucket: url.searchParams.get("bucket"),
      path: url.searchParams.get("path"),
      workspaceId: url.searchParams.get("workspaceId"),
      download: url.searchParams.get("download") || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { bucket, workspaceId, download } = parsed.data;
    const path = normalizeStoragePath(parsed.data.path);

    if (!isSafeStoragePath(path)) {
      return NextResponse.json(
        { error: "Invalid path format" },
        { status: 400 },
      );
    }

    // Validate path belongs to workspace
    const pathWorkspaceId = extractWorkspaceIdFromPath(path);
    if (!pathWorkspaceId) {
      return NextResponse.json(
        { error: "Invalid path format" },
        { status: 400 },
      );
    }
    if (pathWorkspaceId !== workspaceId) {
      return NextResponse.json(
        { error: "Path does not belong to workspace" },
        { status: 403 },
      );
    }

    // Authenticate user
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check workspace membership
    const { data: membership, error: memberError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError || !membership) {
      return NextResponse.json(
        { error: "Forbidden: Not a workspace member" },
        { status: 403 },
      );
    }

    // Generate presigned URL
    let signedUrl: string;
    try {
      signedUrl = await presignGetObject({
        logicalBucket: bucket as LogicalBucket,
        path,
        expiresInSeconds: 5 * 60, // 5 minutes
        responseContentDisposition: download
          ? `attachment; filename="${sanitizeFilename(download)}"`
          : undefined,
      });
    } catch (signError) {
      console.error("[Storage File Proxy] Signing failed", signError);
      return NextResponse.json(
        { error: "Unable to sign file" },
        { status: 500 },
      );
    }

    // Fetch and proxy the file
    const rangeHeader = req.headers.get("range");
    const upstream = await fetch(signedUrl, {
      method: isHead ? "HEAD" : "GET",
      headers: {
        Accept: "*/*",
        ...(rangeHeader && !isHead ? { Range: rangeHeader } : {}),
      },
      cache: "no-store",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "File not found" },
        { status: upstream.status },
      );
    }

    const headers = new Headers(upstream.headers);
    headers.set("Cache-Control", "private, max-age=0, no-store");
    headers.set("Access-Control-Allow-Origin", "*");

    if (isHead) {
      return new Response(null, {
        status: upstream.status,
        headers,
      });
    }

    if (!upstream.body) {
      return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (err) {
    console.error("[Storage File Proxy] Error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};

export async function GET(req: NextRequest) {
  return handleFileRequest(req);
}

export async function HEAD(req: NextRequest) {
  return handleFileRequest(req, { isHead: true });
}
