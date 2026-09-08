import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import {
  STORAGE_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  BRANDING_ASSETS_BUCKET_NAME,
  TESTIMONIAL_HEADSHOT_MAX_FILE_SIZE_BYTES,
} from "@/lib/constants";
import { assertDocumentUploadAllowed } from "@/modules/billing/server/planGuards";
import { presignPutObject, type LogicalBucket } from "@/server/storage";
import { trackWorkspaceBandwidth } from "@/server/workspaceUsage";
import {
  buildStoragePath,
  buildUniqueUploadFilename,
  fitStorageFilename,
} from "@/server/storage/storagePaths";

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
    {
      message: "Invalid characters in path segment",
    },
  );

const RequestSchema = z.object({
  assetKind: AssetKindSchema,
  workspaceId: z.string().uuid(),
  filename: safePathSegment,
  contentType: z.string().min(1).max(255),
  fileSizeBytes: z.number().int().nonnegative().optional(),
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
      {
        message: "Invalid characters in path",
      },
    )
    .optional(),
});

type AssetKind = z.infer<typeof AssetKindSchema>;

const testimonialImageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);

const getFileExtension = (filename: string): string =>
  (filename.split(".").pop() ?? "").toLowerCase();

const getLogicalBucket = (assetKind: AssetKind): LogicalBucket => {
  switch (assetKind) {
    case "document":
      return STORAGE_BUCKET_NAME;
    case "data-room-document":
      return DATA_ROOM_STORAGE_BUCKET_NAME;
    case "branding":
      return BRANDING_ASSETS_BUCKET_NAME;
    default:
      throw new Error(`Unknown asset kind: ${assetKind}`);
  }
};

const isTestimonialBrandingPathForUser = (
  brandingSubpath: string | undefined,
  userId: string,
): boolean =>
  Boolean(
    brandingSubpath &&
    brandingSubpath === `testimonials/${userId}` &&
    !brandingSubpath.endsWith("/") &&
    !brandingSubpath.includes("//"),
  );

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
      fileSizeBytes,
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

    if (
      (assetKind === "document" || assetKind === "data-room-document") &&
      (typeof fileSizeBytes !== "number" || fileSizeBytes <= 0)
    ) {
      return NextResponse.json(
        { error: "fileSizeBytes is required for document uploads" },
        { status: 400 },
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

    if (assetKind === "branding") {
      const testimonialUpload = isTestimonialBrandingPathForUser(
        brandingSubpath,
        user.id,
      );

      if (testimonialUpload) {
        const extension = getFileExtension(filename);
        if (!testimonialImageExtensions.has(extension)) {
          return NextResponse.json(
            { error: "Unsupported testimonial image type" },
            { status: 400 },
          );
        }

        if (
          typeof fileSizeBytes !== "number" ||
          fileSizeBytes > TESTIMONIAL_HEADSHOT_MAX_FILE_SIZE_BYTES
        ) {
          return NextResponse.json(
            {
              error: `Testimonial headshot must be ${Math.floor(TESTIMONIAL_HEADSHOT_MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB or smaller`,
            },
            { status: 400 },
          );
        }
      }

      if (testimonialUpload) {
        const [workspaceResult, membershipResult] = await Promise.all([
          supabase
            .from("workspaces")
            .select("created_by")
            .eq("id", workspaceId)
            .maybeSingle(),
          supabase
            .from("workspace_members")
            .select("workspace_id")
            .eq("workspace_id", workspaceId)
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

        if (workspaceResult.error || !workspaceResult.data) {
          return NextResponse.json(
            { error: "Forbidden: Insufficient permissions" },
            { status: 403 },
          );
        }

        const isOwner = workspaceResult.data.created_by === user.id;
        const isMember = Boolean(membershipResult.data);

        if (!isOwner && !isMember) {
          return NextResponse.json(
            { error: "Forbidden: Insufficient permissions" },
            { status: 403 },
          );
        }
      } else {
        const { data: workspace, error: workspaceError } = await supabase
          .from("workspaces")
          .select("created_by")
          .eq("id", workspaceId)
          .maybeSingle();

        if (workspaceError || !workspace || workspace.created_by !== user.id) {
          return NextResponse.json(
            { error: "Forbidden: Insufficient permissions" },
            { status: 403 },
          );
        }
      }
    } else if (assetKind === "data-room-document") {
      const { data: canEdit, error: canEditError } = await supabase.rpc(
        "can_edit_data_room",
        { ws: workspaceId, room_id: dataRoomId as string },
      );
      if (canEditError || !canEdit) {
        return NextResponse.json(
          { error: "Forbidden: Insufficient permissions" },
          { status: 403 },
        );
      }
    } else {
      const { data: canEdit, error: canEditError } = await supabase.rpc(
        "can_edit_workspace_documents",
        { ws: workspaceId },
      );
      if (canEditError || !canEdit) {
        return NextResponse.json(
          { error: "Forbidden: Insufficient permissions" },
          { status: 403 },
        );
      }
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
        sizeBytes: fileSizeBytes ?? null,
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
        const timePart = Date.now().toString(36).slice(-6).padStart(6, "0");

        const randomPart = (() => {
          try {
            const crypto = globalThis.crypto as
              undefined | { getRandomValues?: (arr: Uint8Array) => Uint8Array };
            if (crypto?.getRandomValues) {
              const bytes = new Uint8Array(4);
              crypto.getRandomValues(bytes);
              const hex = Array.from(bytes, (b) =>
                b.toString(16).padStart(2, "0"),
              ).join("");
              return hex.slice(0, 6);
            }
          } catch {
            // ignore
          }

          try {
            return randomBytes(4).toString("hex").slice(0, 6);
          } catch {
            // ignore
          }

          try {
            return Math.floor(Math.random() * 0xffffff)
              .toString(16)
              .padStart(6, "0")
              .slice(0, 6);
          } catch {
            // ignore
          }

          return null;
        })();

        if (!randomPart) {
          // Last resort: timestamp only (can collide under high concurrency)
          return Date.now().toString(36).padStart(12, "0").slice(-12);
        }

        return `${timePart}${randomPart}`;
      }
    })();

    const uniqueFilename = (() => {
      if (assetKind !== "document" && assetKind !== "data-room-document") {
        return fitStorageFilename(filename);
      }

      return buildUniqueUploadFilename(filename, token);
    })();

    // Build the storage path
    const storagePath = buildStoragePath({
      assetKind,
      workspaceId,
      filename: uniqueFilename,
      folderId,
      dataRoomId,
      brandingSubpath,
    });

    // Get the logical bucket
    const logicalBucket = getLogicalBucket(assetKind);

    // Generate presigned PUT URL
    const uploadUrl = await presignPutObject({
      logicalBucket,
      path: storagePath,
      contentType,
      contentLengthBytes: fileSizeBytes,
      cacheControl: "3600",
      expiresInSeconds: 60 * 60, // 1 hour
    });

    // Track R2 Class A op (best-effort, async) - presigned PUT counts as estimated Class A
    void trackWorkspaceBandwidth(workspaceId, 0, 0, { r2ClassAOps: 1 });

    return NextResponse.json({
      uploadUrl,
      logicalBucket,
      storagePath,
    });
  } catch (err) {
    console.error("[Storage Upload URL] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
