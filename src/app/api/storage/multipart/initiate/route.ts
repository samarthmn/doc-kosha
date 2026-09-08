import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import {
  BRANDING_ASSETS_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  STORAGE_BUCKET_NAME,
} from "@/lib/constants";
import { assertDocumentUploadAllowed } from "@/modules/billing/server/planGuards";
import {
  buildStoragePath,
  buildUniqueUploadFilename,
  fitStorageFilename,
} from "@/server/storage/storagePaths";
import { createMultipartUpload, type LogicalBucket } from "@/server/storage";
import { resolveMultipartAccessWithRetry } from "@/server/storage/multipartAccess";
import { signMultipartUploadIntent } from "@/server/storage/multipartIntent";
import { trackWorkspaceBandwidth } from "@/server/workspaceUsage";

const AssetKindSchema = z.enum(["document", "data-room-document", "branding"]);

const safePathSegment = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (val) => {
      if (val.includes("\0")) return false;
      if (val.includes("..")) return false;
      if (val.includes("/")) return false;
      if (val.includes("\\")) return false;
      return true;
    },
    { message: "Invalid characters in path segment" },
  );

const RequestSchema = z.object({
  assetKind: AssetKindSchema,
  workspaceId: z.string().uuid(),
  filename: safePathSegment,
  contentType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().optional(),
  // For document uploads
  folderId: z.string().uuid().nullable().optional(),
  dataRoomId: z.string().uuid().nullable().optional(),
  replaceDocumentId: z.string().uuid().nullable().optional(),
  // For branding uploads
  brandingSubpath: z
    .string()
    .max(255)
    .refine(
      (val) => {
        if (val.includes("\0")) return false;
        if (val.includes("..")) return false;
        if (val.includes("\\")) return false;
        return true;
      },
      { message: "Invalid characters in path" },
    )
    .optional(),
});

type AssetKind = z.infer<typeof AssetKindSchema>;

const getLogicalBucket = (assetKind: AssetKind): LogicalBucket => {
  switch (assetKind) {
    case "document":
      return STORAGE_BUCKET_NAME;
    case "data-room-document":
      return DATA_ROOM_STORAGE_BUCKET_NAME;
    case "branding":
      return BRANDING_ASSETS_BUCKET_NAME;
    default: {
      const exhaustive: never = assetKind;
      throw new Error(`Unknown asset kind: ${exhaustive}`);
    }
  }
};

const MiB = 1024 * 1024;
const DEFAULT_PART_SIZE_BYTES = 8 * MiB;
const MIN_PART_SIZE_BYTES = 5 * MiB;
const MAX_PARTS = 10_000;

const computePartSizeBytes = (sizeBytes: number): number => {
  const minForMaxParts = Math.ceil(sizeBytes / MAX_PARTS);
  const roundedToMiB = Math.ceil(minForMaxParts / MiB) * MiB;
  return Math.max(DEFAULT_PART_SIZE_BYTES, MIN_PART_SIZE_BYTES, roundedToMiB);
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const {
      assetKind,
      workspaceId,
      filename,
      contentType,
      sizeBytes,
      folderId,
      dataRoomId,
      replaceDocumentId,
      brandingSubpath,
    } = parsed.data;

    // Validate data-room-document requires dataRoomId
    if (assetKind === "data-room-document" && !dataRoomId) {
      return NextResponse.json(
        { error: "dataRoomId is required for data-room-document uploads" },
        { status: 400 },
      );
    }

    if (typeof sizeBytes !== "number" || sizeBytes <= 0) {
      return NextResponse.json(
        { error: "sizeBytes is required for multipart uploads" },
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

    const access = await resolveMultipartAccessWithRetry(async () => {
      if (assetKind === "branding") {
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
      if (assetKind === "data-room-document") {
        return await supabase.rpc("can_edit_data_room", {
          ws: workspaceId,
          room_id: dataRoomId as string,
        });
      }
      return await supabase.rpc("can_edit_workspace_documents", {
        ws: workspaceId,
      });
    });

    if (access.status === "unavailable") {
      console.error("[Storage Multipart Initiate] permission check failed", {
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

    // If data room, verify it belongs to workspace
    if (dataRoomId) {
      const { data: dataRoom, error: dataRoomError } = await supabase
        .from("data_rooms")
        .select("id, workspace_id")
        .eq("id", dataRoomId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (dataRoomError || !dataRoom) {
        return NextResponse.json(
          { error: "Data room not found or does not belong to workspace" },
          { status: 404 },
        );
      }
    }

    let currentDocumentSizeBytes: number | null = null;
    if (
      replaceDocumentId &&
      (assetKind === "document" || assetKind === "data-room-document")
    ) {
      const { data: document, error: documentError } = await supabase
        .from("documents")
        .select("id, workspace_id, data_room_id, size_bytes")
        .eq("id", replaceDocumentId)
        .maybeSingle();

      if (documentError || !document) {
        return NextResponse.json(
          { error: "Replacement document not found" },
          { status: 404 },
        );
      }

      const scopeMatches =
        document.workspace_id === workspaceId &&
        (document.data_room_id ?? null) === (dataRoomId ?? null);
      if (!scopeMatches) {
        return NextResponse.json(
          { error: "Replacement document scope mismatch" },
          { status: 400 },
        );
      }

      currentDocumentSizeBytes = document.size_bytes ?? 0;
    }

    if (assetKind === "document" || assetKind === "data-room-document") {
      const uploadCheck = await assertDocumentUploadAllowed({
        workspaceId,
        filename,
        sizeBytes: sizeBytes ?? null,
        currentDocumentSizeBytes,
      });
      if (!uploadCheck.ok) {
        return NextResponse.json(
          { error: uploadCheck.message, code: uploadCheck.code },
          { status: uploadCheck.status },
        );
      }
    }

    const token = (() => {
      try {
        return globalThis.crypto.randomUUID().slice(0, 12);
      } catch {
        const randomSuffix = (() => {
          try {
            const crypto = globalThis.crypto as
              undefined | { getRandomValues?: (arr: Uint8Array) => Uint8Array };
            if (crypto?.getRandomValues) {
              const bytes = new Uint8Array(6);
              crypto.getRandomValues(bytes);
              const hex = Array.from(bytes, (b) =>
                b.toString(16).padStart(2, "0"),
              ).join("");
              return hex.slice(0, 12);
            }
          } catch {
            // ignore
          }

          return `${Math.floor(Math.random() * 1e9)}`;
        })();

        return `${Date.now()}-${randomSuffix}`;
      }
    })();

    const uniqueFilename = (() => {
      if (assetKind !== "document" && assetKind !== "data-room-document") {
        return fitStorageFilename(filename);
      }

      return buildUniqueUploadFilename(filename, token);
    })();

    const storagePath = buildStoragePath({
      assetKind,
      workspaceId,
      filename: uniqueFilename,
      folderId,
      dataRoomId,
      brandingSubpath,
    });

    const logicalBucket = getLogicalBucket(assetKind);
    const initResult = await createMultipartUpload({
      logicalBucket,
      path: storagePath,
      contentType,
      cacheControl: "3600",
    });

    if (!initResult.ok) {
      console.error("[Storage Multipart Initiate] failed", {
        status: initResult.status,
        message: initResult.message,
      });
      return NextResponse.json(
        { error: "Failed to start upload" },
        { status: initResult.status },
      );
    }

    const partSizeBytes = computePartSizeBytes(sizeBytes);
    const totalParts = Math.max(1, Math.ceil(sizeBytes / partSizeBytes));
    const intentToken = signMultipartUploadIntent({
      userId: user.id,
      workspaceId,
      assetKind,
      logicalBucket,
      storagePath,
      uploadId: initResult.uploadId,
      filename,
      sizeBytes,
      partSizeBytes,
      totalParts,
      replaceDocumentId: replaceDocumentId ?? null,
      currentDocumentSizeBytes,
    });

    // Track R2 Class A ops: CreateMultipartUpload
    void trackWorkspaceBandwidth(workspaceId, 0, 0, { r2ClassAOps: 1 });

    return NextResponse.json({
      uploadId: initResult.uploadId,
      logicalBucket,
      storagePath,
      partSizeBytes,
      totalParts,
      intentToken,
    });
  } catch (err) {
    console.error("[Storage Multipart Initiate] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
