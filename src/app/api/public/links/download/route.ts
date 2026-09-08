import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CONVERTED_STORAGE_BUCKET_NAME,
  STORAGE_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  DATA_ROOM_CONVERTED_BUCKET_NAME,
  BRANDING_ASSETS_BUCKET_NAME,
  BRANDING_LOGO_MAX_FILE_SIZE_BYTES,
  PDF_PROCESSING_MAX_INPUT_BYTES,
  PUBLIC_DOWNLOAD_OPERATION_TIMEOUT_MS,
} from "@/lib/constants";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import {
  signCookie,
  signVerifiedEmailCookie,
  verifyCookie,
  verifyVerifiedEmailCookie,
} from "@/server/cookieHelper";
import {
  getAccessCookieKey,
  getEmailCookieKey,
  type AccessCookiePayload,
  type PublicResourceType,
} from "@/server/cookieConstants";
import { getMimeType, sanitizeFileName } from "@/server/storage/downloadUtils";
import {
  resolveRequiredWatermarkDefinition,
  type BrandingRecord,
  type WatermarkDynamicValues,
} from "@/lib/branding";
import { applyWatermarkToPdf } from "@/server/watermarkService";
import { extractClientIp } from "@/server/requestIp";
import { processDocumentProcessingJob } from "@/server/documentProcessingQueue";
import { TrackerResourceType } from "@/lib/analytics/publicTracker";
import {
  evaluateWorkspaceBandwidthLimit,
  trackWorkspaceBandwidth,
} from "@/server/workspaceUsage";
import { fetchLinkAllowlistStatus } from "@/server/linkAllowlist";
import {
  fetchLinkAlcViewerSeeds,
  filterDataRoomContentByAlc,
  isAlcSeedEmpty,
  isLinkAlcActive,
} from "@/server/linkAlc";
import { hasWorkspaceEntitlement } from "@/server/workspaceEntitlement";
import { getPublicLinkAvailabilityError } from "@/server/publicLinkAvailability";
import {
  materializeWatermark,
  type WatermarkTemplateRow,
} from "@/lib/watermarks";
import type { WatermarkDefinition } from "@/lib/branding";
import type { Tables } from "@/types/generated/supabase";
import {
  downloadToBufferBounded,
  presignGetObject,
  type LogicalBucket,
} from "@/server/storage";
import { applyRequiredWatermark } from "@/server/requiredWatermark";
import { isWatermarkEligibleDocument } from "@/server/watermarkPolicy";
import { resolvePublicDirectAsset } from "@/server/publicDirectAsset";
import {
  createOperationDeadline,
  remainingOperationTimeMs,
  runWithinOperationDeadline,
  type OperationDeadline,
} from "@/server/operationDeadline";
import {
  engineFailureSchema,
  toPublicEngineErrorResponse,
} from "@/server/engineErrors";

export const maxDuration = 180;

type DocumentRecord = {
  id: string;
  title: string | null;
  file_type: string | null;
  storage_path: string | null;
  converted_storage_path: string | null;
  conversion_status: string | null;
  workspace_id: string | null;
  data_room_id: string | null;
  size_bytes: number | null;
};

type BufferResult =
  { ok: true; buffer: Buffer } | { ok: false; status: number; message: string };

const downloadFileBuffer = async (
  _client: ReturnType<typeof createSupabaseServiceClient>,
  bucket: string,
  path: string,
  deadline: OperationDeadline,
): Promise<BufferResult> => {
  const result = await runWithinOperationDeadline(deadline, {
    operation: "conversion",
    run: async () =>
      downloadToBufferBounded({
        logicalBucket: bucket as LogicalBucket,
        path,
        maxBytes: PDF_PROCESSING_MAX_INPUT_BYTES,
      }),
  });

  if (!result.ok) {
    return { ok: false, status: result.status, message: result.message };
  }

  return { ok: true, buffer: result.buffer };
};

const bufferToArrayBuffer = (buffer: Buffer): ArrayBuffer => {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
};

const downloadWatermarkImage = async (
  _client: ReturnType<typeof createSupabaseServiceClient>,
  path: string | null | undefined,
  deadline: OperationDeadline,
): Promise<{
  bytes: ArrayBuffer | null;
  contentType?: string;
  name?: string;
}> => {
  if (!path) return { bytes: null };

  const result = await runWithinOperationDeadline(deadline, {
    operation: "watermark",
    format: "pdf",
    run: async () =>
      downloadToBufferBounded({
        logicalBucket: BRANDING_ASSETS_BUCKET_NAME,
        path,
        maxBytes: BRANDING_LOGO_MAX_FILE_SIZE_BYTES,
      }),
  });

  if (!result.ok) {
    console.error(
      "[Public Download] watermark image download failed",
      result.message,
    );
    return { bytes: null };
  }

  // Convert Buffer to ArrayBuffer
  const bytes = bufferToArrayBuffer(result.buffer);

  return {
    bytes,
    contentType: result.contentType || undefined,
    name: path.split("/").pop() ?? "watermark-image",
  };
};

const resolveWatermarkForLink = async (params: {
  client: ReturnType<typeof createSupabaseServiceClient>;
  link: Tables<"links">;
  deadline: OperationDeadline;
}): Promise<{
  definition: WatermarkDefinition | null;
  imageBytes?: ArrayBuffer | null;
  imageContentType?: string;
  imageFileName?: string;
}> => {
  const { client, link, deadline } = params;
  const targetWorkspaceId = link.workspace_id;

  // Prefer per-link watermark template
  const watermarkId = (link as { watermark_id?: string | null }).watermark_id;
  if (watermarkId) {
    const { data: tplRow } = await client
      .from("watermarks" as never)
      .select("*")
      .eq("id", watermarkId)
      .maybeSingle();
    const materialized = tplRow
      ? materializeWatermark(tplRow as WatermarkTemplateRow)
      : null;
    if (materialized) {
      const downloaded = await downloadWatermarkImage(
        client,
        materialized.imageStoragePath ?? undefined,
        deadline,
      );
      return {
        definition: {
          ...materialized.definition,
          pattern: materialized.pattern,
          rotationDeg: materialized.rotationDeg,
          xSpacing: materialized.xSpacing,
          ySpacing: materialized.ySpacing,
          mode: materialized.mode,
          imageWidthPt: materialized.imageWidthPt ?? undefined,
          imageHeightPt: materialized.imageHeightPt ?? undefined,
          imagePath: materialized.imageStoragePath ?? undefined,
        },
        imageBytes: downloaded.bytes ?? undefined,
        imageContentType: downloaded.contentType,
        imageFileName: downloaded.name,
      };
    }
    // Template was deleted — do not fall back to branding; treat as
    // "no watermark available".
    return { definition: null };
  }

  // Fallback to branding watermark
  if (targetWorkspaceId) {
    const { data: brandingRow } = await client
      .from("branding")
      .select("*")
      .eq("workspace_id", targetWorkspaceId)
      .maybeSingle();
    const definition = resolveRequiredWatermarkDefinition(
      (brandingRow as BrandingRecord | null) ?? null,
    );
    return { definition };
  }

  return { definition: null };
};

type DownloadSuccess = {
  ok: true;
  buffer: Buffer;
  extension: string;
  wasConverted: boolean;
  warning?: string;
};

type DownloadError = { ok: false; status: number; message: string };

type DownloadResult = DownloadSuccess | DownloadError;

const ensurePdfBuffer = async (
  client: ReturnType<typeof createSupabaseServiceClient>,
  doc: DocumentRecord,
  buckets: { original: string; converted: string },
  deadline: OperationDeadline,
): Promise<BufferResult> => {
  const originalExt = (
    doc.file_type ||
    doc.storage_path?.split(".").pop() ||
    ""
  ).toLowerCase();

  if (originalExt === "pdf" && doc.storage_path) {
    return downloadFileBuffer(
      client,
      buckets.original,
      doc.storage_path,
      deadline,
    );
  }

  if (doc.converted_storage_path && doc.conversion_status === "completed") {
    const converted = await downloadFileBuffer(
      client,
      buckets.converted,
      doc.converted_storage_path,
      deadline,
    );
    if (converted.ok) {
      return converted;
    }
    if (!converted.ok && converted.status !== 404) {
      return converted;
    }
    console.warn("[Public Download] Converted file missing, reconverting", {
      documentId: doc.id,
      message: converted.message,
    });
  }

  if (!doc.storage_path) {
    return { ok: false, status: 404, message: "Source file unavailable" };
  }
  if (!originalExt) {
    return { ok: false, status: 500, message: "Unknown file type" };
  }
  if (!doc.workspace_id) {
    return {
      ok: false,
      status: 500,
      message: "Document workspace unavailable",
    };
  }
  const workspaceId = doc.workspace_id;

  // Public requests never publish conversion bytes themselves. They reuse the
  // same claim-scoped processor as authenticated uploads, then re-read the
  // current document generation before selecting any output. `force` also
  // covers in_progress so a crashed worker's stale lease can be reclaimed
  // (the runner refuses forced work on a live, non-stale claim).
  await runWithinOperationDeadline(deadline, {
    operation: "conversion",
    format: originalExt,
    run: async () =>
      processDocumentProcessingJob(
        { documentId: doc.id, workspaceId },
        {
          force:
            doc.conversion_status === "completed" ||
            doc.conversion_status === "in_progress",
          deadlineAt: deadline.deadlineAt,
        },
      ),
  });

  const { data: current, error: currentError } = await client
    .from("documents")
    .select(
      "id, file_type, storage_path, converted_storage_path, conversion_status, workspace_id, data_room_id",
    )
    .eq("id", doc.id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (currentError || !current) {
    return {
      ok: false,
      status: currentError ? 500 : 404,
      message: "Document changed during conversion",
    };
  }

  const currentExtension = (
    current.file_type ||
    current.storage_path?.split(".").pop() ||
    ""
  ).toLowerCase();
  if (currentExtension === "pdf" && current.storage_path) {
    return downloadFileBuffer(
      client,
      buckets.original,
      current.storage_path,
      deadline,
    );
  }
  if (
    current.conversion_status === "completed" &&
    current.converted_storage_path
  ) {
    return downloadFileBuffer(
      client,
      buckets.converted,
      current.converted_storage_path,
      deadline,
    );
  }

  return {
    ok: false,
    status:
      current.conversion_status === "pending" ||
      current.conversion_status === "in_progress"
        ? 409
        : 503,
    message:
      current.conversion_status === "failed"
        ? "Document conversion failed"
        : "Document conversion is still processing",
  };
};

const resolveDownload = async (
  client: ReturnType<typeof createSupabaseServiceClient>,
  doc: DocumentRecord,
  link: { apply_watermark: boolean },
  variant: "original" | "converted",
  buckets: { original: string; converted: string },
  deadline: OperationDeadline,
): Promise<DownloadResult> => {
  const shouldServePdf = link.apply_watermark || variant === "converted";
  const originalExtension =
    (doc.file_type || doc.storage_path?.split(".").pop() || "").toLowerCase() ||
    "bin";

  let warning: string | undefined;

  const downloadOriginal = async (): Promise<DownloadResult> => {
    if (!doc.storage_path) {
      return { ok: false, status: 404, message: "File not available" };
    }
    const originalDownload = await downloadFileBuffer(
      client,
      buckets.original,
      doc.storage_path,
      deadline,
    );
    if (!originalDownload.ok) {
      return {
        ok: false,
        status: originalDownload.status,
        message: originalDownload.message,
      };
    }
    return {
      ok: true,
      buffer: originalDownload.buffer,
      extension: originalExtension,
      wasConverted: false,
    };
  };

  if (shouldServePdf) {
    const pdfResult = await ensurePdfBuffer(client, doc, buckets, deadline);
    if (pdfResult.ok) {
      return {
        ok: true,
        buffer: pdfResult.buffer,
        extension: "pdf",
        wasConverted: true,
      };
    }
    const failureMessage =
      pdfResult.message || "Converted PDF unavailable for download";
    warning = failureMessage;
    if (link.apply_watermark) {
      return { ok: false, status: pdfResult.status, message: failureMessage };
    }
  }

  if (
    variant === "converted" &&
    doc.converted_storage_path &&
    doc.conversion_status === "completed"
  ) {
    const convertedDownload = await downloadFileBuffer(
      client,
      buckets.converted,
      doc.converted_storage_path,
      deadline,
    );
    if (convertedDownload.ok) {
      return {
        ok: true,
        buffer: convertedDownload.buffer,
        extension: "pdf",
        wasConverted: true,
        warning,
      };
    }
    warning ??= convertedDownload.message;
  }

  const originalResult = await downloadOriginal();
  if (!originalResult.ok) {
    return originalResult;
  }

  if (warning) {
    return { ...originalResult, warning };
  }

  return originalResult;
};

const RequestSchema = z.object({
  linkId: z.string().uuid(),
  documentId: z.string().uuid(),
  dataRoomId: z.string().uuid().optional(),
  variant: z.enum(["original", "converted"]).default("original"),
});

const createBandwidthLimitResponse = () =>
  NextResponse.json(
    { error: "Bandwidth limit reached", code: "BANDWIDTH_LIMIT_REACHED" },
    { status: 403 },
  );

export async function POST(req: NextRequest) {
  const deadline = createOperationDeadline(
    PUBLIC_DOWNLOAD_OPERATION_TIMEOUT_MS,
  );
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { linkId, documentId, dataRoomId, variant } = parsed.data;
    const resourceType: PublicResourceType = dataRoomId
      ? TrackerResourceType.DataRoom
      : TrackerResourceType.Document;
    const resourceId = dataRoomId ?? documentId;
    const resourceColumn = dataRoomId ? "data_room_id" : "document_id";
    const supabase = createSupabaseServiceClient();

    const { data: linkRow } = await supabase
      .from("links" as never)
      .select(
        "id, document_id, workspace_id, email_verification, nda_gate, can_download, apply_watermark, dynamic_watermark_variables, dynamic_watermark_email, dynamic_watermark_ip, dynamic_watermark_datetime, watermark_id, open_once, revoked_at, expires_at",
      )
      .eq("id", linkId)
      .eq(resourceColumn, resourceId)
      .maybeSingle();

    const link =
      (linkRow as
        | {
            id: string;
            document_id: string | null;
            workspace_id: string;
            email_verification: boolean;
            nda_gate: boolean;
            can_download: boolean;
            apply_watermark: boolean;
            dynamic_watermark_variables: boolean;
            dynamic_watermark_email?: boolean | null;
            dynamic_watermark_ip?: boolean | null;
            dynamic_watermark_datetime?: boolean | null;
            watermark_id?: string | null;
            revoked_at: string | null;
            expires_at: string | null;
            open_once: boolean;
          }
        | null
        | undefined) ?? null;

    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    const availabilityError = getPublicLinkAvailabilityError(link);
    if (availabilityError) {
      const { status, ...payload } = availabilityError;
      return NextResponse.json(payload, { status });
    }

    const hasEntitlement = await hasWorkspaceEntitlement(link.workspace_id);
    if (!hasEntitlement) {
      return NextResponse.json(
        { error: "Link not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (!link.can_download) {
      return NextResponse.json(
        { error: "Downloads disabled" },
        { status: 403 },
      );
    }

    const accessCookieName = getAccessCookieKey(
      resourceType,
      resourceId,
      linkId,
    );
    const accessCookieValue = req.cookies.get(accessCookieName)?.value;
    if (!accessCookieValue) {
      return NextResponse.json(
        { error: "Access confirmation required" },
        { status: 401 },
      );
    }

    const accessPayload =
      accessCookieValue && verifyCookie<AccessCookiePayload>(accessCookieValue);

    if (
      !accessPayload ||
      accessPayload.resourceId !== resourceId ||
      accessPayload.resourceType !== resourceType ||
      accessPayload.linkId !== linkId ||
      (typeof accessPayload.exp === "number" && accessPayload.exp < Date.now())
    ) {
      return NextResponse.json({ error: "Access expired" }, { status: 401 });
    }

    const emailCookieName = getEmailCookieKey(resourceType, resourceId, linkId);
    const emailCookieValue = req.cookies.get(emailCookieName)?.value;
    const emailPayload = emailCookieValue
      ? verifyVerifiedEmailCookie(emailCookieValue, {
          resourceType,
          resourceId,
          linkId,
        })
      : null;
    const allowlistStatus = await fetchLinkAllowlistStatus(
      supabase,
      linkId,
      emailPayload?.email ?? null,
    );
    const alcActive =
      Boolean(dataRoomId) && (await isLinkAlcActive(supabase, linkId));
    const requiresVerifiedEmail = Boolean(
      link.email_verification ||
      link.nda_gate ||
      allowlistStatus.isActive ||
      alcActive ||
      (link.apply_watermark &&
        (link as { dynamic_watermark_email?: boolean })
          .dynamic_watermark_email),
    );
    let verifiedEmail: string | null =
      allowlistStatus.normalizedEmail ?? emailPayload?.email ?? null;

    if (requiresVerifiedEmail) {
      if (!emailPayload || !emailPayload.email) {
        return NextResponse.json(
          { error: "Email verification required" },
          { status: 401 },
        );
      }
      if (
        typeof emailPayload.exp === "number" &&
        emailPayload.exp < Date.now()
      ) {
        return NextResponse.json(
          { error: "Email verification expired" },
          { status: 401 },
        );
      }
      if (allowlistStatus.isActive && allowlistStatus.emailBlocked === true) {
        return NextResponse.json(
          { error: "Email not allowed", code: "EMAIL_NOT_ALLOWED" },
          { status: 403 },
        );
      }
      if (
        !alcActive &&
        allowlistStatus.isActive &&
        allowlistStatus.emailAllowed === false
      ) {
        return NextResponse.json(
          { error: "Email not allowed", code: "EMAIL_NOT_ALLOWED" },
          { status: 403 },
        );
      }
      verifiedEmail =
        allowlistStatus.normalizedEmail ?? emailPayload.email ?? null;
    }

    if (link.nda_gate) {
      if (!verifiedEmail) {
        return NextResponse.json(
          { error: "Email verification required" },
          { status: 401 },
        );
      }
      const { data: signature } = await supabase
        .from("nda_signatures")
        .select("id, signed_pdf_path")
        .eq("link_id", linkId)
        .eq("email", verifiedEmail)
        .maybeSingle();

      if (!signature) {
        return NextResponse.json(
          { error: "NDA signature required" },
          { status: 403 },
        );
      }
      if (!signature.signed_pdf_path) {
        return NextResponse.json(
          { error: "Signed NDA is being prepared", code: "NDA_PDF_PENDING" },
          { status: 403 },
        );
      }
    }

    const { data: doc } = await supabase
      .from("documents")
      .select(
        "id, title, file_type, storage_path, converted_storage_path, conversion_status, workspace_id, data_room_id, folder_id, size_bytes",
      )
      .eq("id", documentId)
      .maybeSingle();

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    if (dataRoomId && doc.data_room_id !== dataRoomId) {
      return NextResponse.json(
        { error: "Document not part of data room" },
        { status: 403 },
      );
    }

    if (alcActive) {
      if (!verifiedEmail) {
        return NextResponse.json(
          { error: "Email verification required", code: "EMAIL_OTP_REQUIRED" },
          { status: 401 },
        );
      }

      const alcSeeds = await fetchLinkAlcViewerSeeds(supabase, {
        linkId,
        workspaceId: link.workspace_id,
        viewerEmail: verifiedEmail,
      }).catch((error) => {
        console.error("[Public Download] Failed to evaluate ALC", {
          linkId,
          workspaceId: link.workspace_id,
          error,
        });
        return null;
      });

      if (!alcSeeds || isAlcSeedEmpty(alcSeeds)) {
        return NextResponse.json(
          { error: "Access denied", code: "ALC_NOT_ALLOWED" },
          { status: 403 },
        );
      }

      if (!alcSeeds.roomAllowed) {
        const docAllowedExplicitly =
          alcSeeds.allowedDocumentSeedIds.has(documentId);

        if (!docAllowedExplicitly) {
          const docFolderId =
            (doc as { folder_id?: string | null }).folder_id ?? null;
          const shouldCheckFolderRules =
            alcSeeds.allowedFolderSeedIds.size > 0 && Boolean(docFolderId);

          if (!shouldCheckFolderRules) {
            return NextResponse.json(
              { error: "Access denied", code: "ALC_NOT_ALLOWED" },
              { status: 403 },
            );
          }

          const { data: folders, error: foldersError } = await supabase
            .from("folders")
            .select("id, parent_folder_id")
            .eq("data_room_id", dataRoomId as string);

          if (foldersError) {
            console.error("[Public Download] Failed to load folders for ALC", {
              linkId,
              dataRoomId,
              error: foldersError,
            });
            return NextResponse.json(
              { error: "Access denied", code: "ALC_NOT_ALLOWED" },
              { status: 403 },
            );
          }

          const { allowedDocumentIds } = filterDataRoomContentByAlc({
            folders: (folders ?? []) as Array<{
              id: string;
              parent_folder_id: string | null;
            }>,
            documents: [{ id: documentId, folder_id: docFolderId }],
            roomAllowed: alcSeeds.roomAllowed,
            allowedFolderSeedIds: alcSeeds.allowedFolderSeedIds,
            allowedDocumentSeedIds: alcSeeds.allowedDocumentSeedIds,
          });

          if (!allowedDocumentIds.has(documentId)) {
            return NextResponse.json(
              { error: "Access denied", code: "ALC_NOT_ALLOWED" },
              { status: 403 },
            );
          }
        }
      }
    }

    const docRecord = doc as DocumentRecord;
    const originalBucket = docRecord.data_room_id
      ? DATA_ROOM_STORAGE_BUCKET_NAME
      : STORAGE_BUCKET_NAME;
    const convertedBucket = docRecord.data_room_id
      ? DATA_ROOM_CONVERTED_BUCKET_NAME
      : CONVERTED_STORAGE_BUCKET_NAME;
    const targetWorkspaceId = docRecord.workspace_id ?? link.workspace_id;
    const currentBandwidthEvaluation = await evaluateWorkspaceBandwidthLimit(
      targetWorkspaceId,
      0,
    );
    if (currentBandwidthEvaluation.shouldBlock) {
      return createBandwidthLimitResponse();
    }
    const watermarkEligible = isWatermarkEligibleDocument({
      fileType: docRecord.file_type,
      storagePath: docRecord.storage_path,
    });
    const watermarkRequired = Boolean(
      link.apply_watermark && watermarkEligible,
    );

    // Determine if we can use a 303 redirect for direct R2 delivery (no proxy bytes)
    // Media formats have no PDF watermark representation, so legacy links
    // retain direct original delivery even when their link flag is enabled.
    const canUseRedirect = !watermarkRequired;
    const directAsset = canUseRedirect
      ? await resolvePublicDirectAsset({
          client: supabase,
          document: docRecord,
          requestedVariant: variant,
          allowConverted: watermarkEligible,
          fallbackWorkspaceId: link.workspace_id,
          deadlineAt: deadline.deadlineAt,
        })
      : null;

    // If redirect-eligible, issue 303 redirect to presigned R2 URL
    if (canUseRedirect && directAsset) {
      const directDeliveryBytes = directAsset.document.size_bytes ?? 0;
      const redirectBandwidthEvaluation = await evaluateWorkspaceBandwidthLimit(
        targetWorkspaceId,
        directDeliveryBytes,
      );
      if (redirectBandwidthEvaluation.shouldBlock) {
        return createBandwidthLimitResponse();
      }

      const baseTitle =
        directAsset.extension === "pdf" && docRecord.title
          ? docRecord.title.replace(/\.[^/.]+$/, "")
          : docRecord.title || "document";
      const fileName = sanitizeFileName(baseTitle, directAsset.extension);

      let signedUrl: string;
      try {
        signedUrl = await presignGetObject({
          logicalBucket: directAsset.logicalBucket,
          path: directAsset.path,
          expiresInSeconds: 5 * 60,
          responseContentDisposition: `attachment; filename="${fileName}"`,
        });
      } catch (signError) {
        console.error(
          "[Public Download] Signing failed for redirect",
          signError,
        );
        return NextResponse.json(
          { error: "Unable to prepare download" },
          { status: 500 },
        );
      }

      // Track R2 Class B op + download count (best-effort, async)
      void trackWorkspaceBandwidth(targetWorkspaceId, directDeliveryBytes, 1, {
        r2ClassBOps: 1,
      });

      // Build 303 redirect response with cookie refresh
      const refreshedAccessValue = signCookie({
        resourceType,
        resourceId,
        linkId,
        exp: Date.now() + 60 * 60 * 1000,
      });

      const headers = new Headers();
      headers.set("Location", signedUrl);
      headers.set("Cache-Control", "private, no-store");
      headers.append(
        "Set-Cookie",
        `${accessCookieName}=${refreshedAccessValue}; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
      );

      if (verifiedEmail) {
        const refreshedEmailValue = signVerifiedEmailCookie({
          email: verifiedEmail,
          resourceType,
          resourceId,
          linkId,
          exp: Date.now() + 60 * 60 * 1000,
        });
        headers.append(
          "Set-Cookie",
          `${emailCookieName}=${refreshedEmailValue}; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
        );
      }

      // 303 See Other: instructs browser to follow with GET
      return new Response(null, { status: 303, headers });
    }

    // Fallback: proxy path (watermarking required or on-demand conversion needed)
    const downloadResult = await resolveDownload(
      supabase,
      docRecord,
      { apply_watermark: watermarkRequired },
      variant,
      {
        original: originalBucket,
        converted: convertedBucket,
      },
      deadline,
    );

    if (!downloadResult.ok) {
      const logMethod =
        downloadResult.status >= 500 ? console.error : console.warn;
      logMethod("[Public Download] Download preparation failed", {
        documentId: docRecord.id,
        message: downloadResult.message,
      });
      return NextResponse.json(
        {
          error:
            downloadResult.status === 404
              ? "File not available"
              : "Unable to prepare download",
        },
        { status: downloadResult.status },
      );
    }

    if (downloadResult.warning) {
      console.warn("[Public Download] Download fallback", {
        documentId: docRecord.id,
        warning: downloadResult.warning,
      });
    }

    let { buffer } = downloadResult;
    const { extension } = downloadResult;

    const contentType = getMimeType(extension);
    const baseTitle =
      extension === "pdf" && docRecord.title
        ? docRecord.title.replace(/\.[^/.]+$/, "")
        : docRecord.title || "document";
    const fileName = sanitizeFileName(baseTitle, extension);

    if (watermarkRequired) {
      if (extension !== "pdf" || !targetWorkspaceId) {
        console.error(
          "[Public Download] Required watermark has no eligible PDF source",
          { documentId: docRecord.id, extension },
        );
        return NextResponse.json(
          { error: "Unable to prepare secure download" },
          { status: 503 },
        );
      }

      const linkForWatermark = link as unknown as Tables<"links">;
      const { definition, imageBytes, imageContentType, imageFileName } =
        await resolveWatermarkForLink({
          client: supabase,
          link: linkForWatermark,
          deadline,
        });

      let dynamicValues: WatermarkDynamicValues | undefined;
      if (
        (link as { dynamic_watermark_email?: boolean }).dynamic_watermark_email
      ) {
        dynamicValues = dynamicValues ?? {};
        if (verifiedEmail) {
          dynamicValues.email = verifiedEmail;
        }
      }
      if ((link as { dynamic_watermark_ip?: boolean }).dynamic_watermark_ip) {
        dynamicValues = dynamicValues ?? {};
        const clientIp = extractClientIp(req);
        if (clientIp) {
          dynamicValues.ip = clientIp;
        }
      }
      if (
        (link as { dynamic_watermark_datetime?: boolean })
          .dynamic_watermark_datetime
      ) {
        dynamicValues = dynamicValues ?? {};
        dynamicValues.datetime = new Date();
      }

      const watermarked = await applyRequiredWatermark({
        definition,
        apply: async (requiredDefinition) => {
          const result = await applyWatermarkToPdf({
            sourcePdf: buffer,
            definition: requiredDefinition,
            dynamicValues,
            imageBytes: imageBytes ?? undefined,
            imageContentType,
            imageFileName,
            timeoutMs: remainingOperationTimeMs(deadline),
          });
          return result.ok
            ? { ok: true, value: Buffer.from(result.pdf) }
            : result;
        },
      });

      if (!watermarked.ok) {
        console.error("[Public Download] Required watermark failed", {
          documentId: docRecord.id,
          code: watermarked.code,
          operation: watermarked.operation,
        });
        const publicFailure = toPublicEngineErrorResponse(watermarked);
        return NextResponse.json(publicFailure.body, {
          status: publicFailure.status,
        });
      }

      buffer = watermarked.value;
    }

    const proxyBandwidthEvaluation = await evaluateWorkspaceBandwidthLimit(
      targetWorkspaceId,
      buffer.byteLength,
    );
    if (proxyBandwidthEvaluation.shouldBlock) {
      return createBandwidthLimitResponse();
    }

    if (targetWorkspaceId) {
      // Proxy path: track bytes + download count + R2 Class B op (1 object downloaded)
      void trackWorkspaceBandwidth(targetWorkspaceId, buffer.byteLength, 1, {
        r2ClassBOps: 1,
      });
    }

    const responseBody = bufferToArrayBuffer(buffer);
    const response = new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.byteLength.toString(),
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });

    const refreshedAccessValue = signCookie({
      resourceType,
      resourceId,
      linkId,
      exp: Date.now() + 60 * 60 * 1000,
    });

    response.cookies.set(accessCookieName, refreshedAccessValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60,
      path: "/",
    });

    if (verifiedEmail) {
      const emailCookieName = getEmailCookieKey(
        resourceType,
        resourceId,
        linkId,
      );
      const refreshedEmailValue = signVerifiedEmailCookie({
        email: verifiedEmail,
        resourceType,
        resourceId,
        linkId,
        exp: Date.now() + 60 * 60 * 1000,
      });
      response.cookies.set(emailCookieName, refreshedEmailValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60,
        path: "/",
      });
    }

    return response;
  } catch (err) {
    const parsedFailure = engineFailureSchema.safeParse(err);
    if (parsedFailure.success) {
      const publicFailure = toPublicEngineErrorResponse(parsedFailure.data);
      return NextResponse.json(publicFailure.body, {
        status: publicFailure.status,
      });
    }
    console.error("[Public Download] Unexpected error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
