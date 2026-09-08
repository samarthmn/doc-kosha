import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  BRANDING_ASSETS_BUCKET_NAME,
  BRANDING_LOGO_MAX_FILE_SIZE_BYTES,
  DATA_ROOM_CONVERTED_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  DATA_ROOM_ZIP_MAX_DOCUMENTS,
  DATA_ROOM_ZIP_MAX_INPUT_BYTES,
  DATA_ROOM_ZIP_MAX_STAGED_TRANSFORM_BYTES,
  DOCUMENT_CONVERSION_MAX_INPUT_BYTES,
  PDF_PROCESSING_MAX_INPUT_BYTES,
  ZIP_DOWNLOAD_FINALIZE_RESERVE_MS,
  ZIP_DOWNLOAD_OPERATION_TIMEOUT_MS,
} from "@/lib/constants";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import {
  resolveRequiredWatermarkDefinition,
  type BrandingRecord,
  type WatermarkDefinition,
} from "@/lib/branding";
import {
  materializeWatermark,
  type WatermarkTemplateRow,
} from "@/lib/watermarks";
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
import { sanitizeFileName } from "@/server/storage/downloadUtils";
import { extractClientIp } from "@/server/requestIp";
import { convertToPdfDirect } from "@/server/conversionService";
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
import { applyWatermarkToPdf } from "@/server/watermarkService";
import { hasWorkspaceEntitlement } from "@/server/workspaceEntitlement";
import { getPublicLinkAvailabilityError } from "@/server/publicLinkAvailability";
import {
  downloadToBufferBounded,
  getObjectByteLength,
  openExactObjectStream,
  type LogicalBucket,
} from "@/server/storage";
import { applyRequiredWatermark } from "@/server/requiredWatermark";
import { isWatermarkEligibleDocument } from "@/server/watermarkPolicy";
import {
  prepareZipEntries,
  createStreamingZip,
  createZipTempWorkspace,
  computeZipFilename,
  type ZipFolder,
  type ZipDocument,
  type ZipScope,
  type StreamingZipEntry,
} from "@/server/dataRoomZip";
import {
  createOperationDeadline,
  createOperationDeadlineSignal,
  remainingOperationTimeMs,
  runWithinOperationDeadline,
  type OperationDeadline,
} from "@/server/operationDeadline";
import {
  engineFailureSchema,
  toPublicEngineErrorResponse,
  type EngineFailureResult,
} from "@/server/engineErrors";

export const maxDuration = 300;

type DocumentRecord = {
  id: string;
  title: string | null;
  file_type: string | null;
  storage_path: string | null;
  converted_storage_path: string | null;
  conversion_status: string | null;
  workspace_id: string | null;
  data_room_id: string | null;
  folder_id: string | null;
};

type FolderRecord = {
  id: string;
  name: string | null;
  parent_folder_id: string | null;
};

type BufferResult =
  | { ok: true; buffer: Buffer }
  | { ok: false; status: number; message: string }
  | (EngineFailureResult & { status: number });

const downloadFileBuffer = async (
  _client: ReturnType<typeof createSupabaseServiceClient>,
  bucket: LogicalBucket,
  path: string,
  maxBytes: number,
  deadline: OperationDeadline,
): Promise<BufferResult> => {
  const result = await runWithinOperationDeadline(deadline, {
    operation: "conversion",
    reserveMs: ZIP_DOWNLOAD_FINALIZE_RESERVE_MS,
    run: async () =>
      downloadToBufferBounded({
        logicalBucket: bucket,
        path,
        maxBytes,
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

const ensurePdfBuffer = async (
  client: ReturnType<typeof createSupabaseServiceClient>,
  doc: DocumentRecord,
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
      DATA_ROOM_STORAGE_BUCKET_NAME,
      doc.storage_path,
      PDF_PROCESSING_MAX_INPUT_BYTES,
      deadline,
    );
  }

  if (doc.converted_storage_path && doc.conversion_status === "completed") {
    const converted = await downloadFileBuffer(
      client,
      DATA_ROOM_CONVERTED_BUCKET_NAME,
      doc.converted_storage_path,
      PDF_PROCESSING_MAX_INPUT_BYTES,
      deadline,
    );
    if (converted.ok) {
      return converted;
    }
  }

  if (!doc.storage_path) {
    return { ok: false, status: 500, message: "Document storage path missing" };
  }

  const original = await downloadFileBuffer(
    client,
    DATA_ROOM_STORAGE_BUCKET_NAME,
    doc.storage_path,
    DOCUMENT_CONVERSION_MAX_INPUT_BYTES,
    deadline,
  );
  if (!original.ok) return original;

  const pdfResult = await convertToPdfDirect({
    bytes: bufferToArrayBuffer(original.buffer),
    fileExtension: originalExt || "bin",
    fileName: doc.title || `document.${originalExt || "bin"}`,
    timeoutMs: remainingOperationTimeMs(
      deadline,
      Date.now(),
      ZIP_DOWNLOAD_FINALIZE_RESERVE_MS,
    ),
  });

  if (!pdfResult.ok) {
    return pdfResult;
  }
  if (pdfResult.pdfBytes.byteLength > PDF_PROCESSING_MAX_INPUT_BYTES) {
    return {
      ok: false,
      status: 413,
      message: "Converted PDF exceeds the 100 MiB PDF processing limit",
    };
  }
  return { ok: true, buffer: Buffer.from(pdfResult.pdfBytes) };
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
    reserveMs: ZIP_DOWNLOAD_FINALIZE_RESERVE_MS,
    run: async () =>
      downloadToBufferBounded({
        logicalBucket: BRANDING_ASSETS_BUCKET_NAME,
        path,
        maxBytes: BRANDING_LOGO_MAX_FILE_SIZE_BYTES,
      }),
  });

  if (!result.ok) {
    return { bytes: null };
  }

  const bytes = bufferToArrayBuffer(result.buffer);

  return {
    bytes,
    contentType: result.contentType || undefined,
    name: path.split("/").pop() ?? "watermark-image",
  };
};

const resolveWatermarkForLink = async (params: {
  client: ReturnType<typeof createSupabaseServiceClient>;
  link: {
    workspace_id: string;
    watermark_id?: string | null;
  };
  deadline: OperationDeadline;
}) => {
  const { client, link, deadline } = params;
  if (link.watermark_id) {
    const { data: tplRow } = await client
      .from("watermarks")
      .select("*")
      .eq("id", link.watermark_id)
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

  const { data: brandingRow } = await client
    .from("branding")
    .select("*")
    .eq("workspace_id", link.workspace_id)
    .maybeSingle();
  const definition = resolveRequiredWatermarkDefinition(
    (brandingRow as BrandingRecord | null) ?? null,
  );
  return { definition };
};

const RequestSchema = z.object({
  linkId: z.string().uuid(),
  dataRoomId: z.string().uuid(),
  scope: z.enum(["room", "folder"]),
  folderId: z.string().uuid().nullable().optional(),
});

const createBandwidthLimitResponse = () =>
  NextResponse.json(
    { error: "Bandwidth limit reached", code: "BANDWIDTH_LIMIT_REACHED" },
    { status: 403 },
  );

export async function POST(req: NextRequest) {
  const deadline = createOperationDeadline(ZIP_DOWNLOAD_OPERATION_TIMEOUT_MS);
  let zipTempWorkspace: Awaited<
    ReturnType<typeof createZipTempWorkspace>
  > | null = null;
  let tempCleanupOwnedByStream = false;
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { linkId, dataRoomId, scope, folderId } = parsed.data;
    const resourceType: PublicResourceType = "data_room";
    const resourceId = dataRoomId;
    const resourceColumn = "data_room_id";

    // Validate folder scope
    if (scope === "folder" && !folderId) {
      return NextResponse.json(
        { error: "folderId required for folder scope" },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServiceClient();
    const { data: link } = await supabase
      .from("links")
      .select(
        "id, workspace_id, can_download, apply_watermark, email_verification, nda_gate, dynamic_watermark_email, dynamic_watermark_ip, dynamic_watermark_datetime, watermark_id, open_once, revoked_at, expires_at",
      )
      .eq("id", linkId)
      .eq(resourceColumn, resourceId)
      .maybeSingle();

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
    const alcActive = await isLinkAlcActive(supabase, linkId);
    const requiresVerifiedEmail = Boolean(
      link.email_verification ||
      link.nda_gate ||
      allowlistStatus.isActive ||
      alcActive ||
      (link.apply_watermark && link.dynamic_watermark_email),
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

    // Fetch room data
    const { data: room } = await supabase
      .from("data_rooms")
      .select("id, name")
      .eq("id", dataRoomId)
      .maybeSingle();

    if (!room) {
      return NextResponse.json(
        { error: "Data room not found" },
        { status: 404 },
      );
    }

    // Fetch folders and documents
    const [foldersResult, docsResult] = await Promise.all([
      supabase
        .from("folders")
        .select("id, name, parent_folder_id")
        .eq("data_room_id", dataRoomId),
      supabase
        .from("documents")
        .select(
          "id, title, file_type, storage_path, converted_storage_path, conversion_status, workspace_id, data_room_id, folder_id",
        )
        .eq("data_room_id", dataRoomId),
    ]);

    if (foldersResult.error) {
      return NextResponse.json(
        { error: "Unable to load folders" },
        { status: 500 },
      );
    }

    if (docsResult.error) {
      return NextResponse.json(
        { error: "Unable to load documents" },
        { status: 500 },
      );
    }

    const folders = (foldersResult.data ?? []) as FolderRecord[];
    const documentsUnfiltered = (docsResult.data ?? []) as DocumentRecord[];

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
        console.error("[Public ZIP Download] Failed to evaluate ALC", {
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

      const filtered = filterDataRoomContentByAlc({
        folders,
        documents: documentsUnfiltered,
        roomAllowed: alcSeeds.roomAllowed,
        allowedFolderSeedIds: alcSeeds.allowedFolderSeedIds,
        allowedDocumentSeedIds: alcSeeds.allowedDocumentSeedIds,
      });

      // Reassign to filtered content for zip generation.
      folders.splice(
        0,
        folders.length,
        ...(filtered.filteredFolders as FolderRecord[]),
      );
      documentsUnfiltered.splice(
        0,
        documentsUnfiltered.length,
        ...(filtered.filteredDocuments as DocumentRecord[]),
      );
    }

    const documents = documentsUnfiltered
      .filter((d) => d.id && d.storage_path)
      .sort((a, b) => (a.title || "").localeCompare(b.title || ""));

    const watermarkedDocumentIds = new Set(
      link.apply_watermark
        ? documents
            .filter((document) =>
              isWatermarkEligibleDocument({
                fileType: document.file_type,
                storagePath: document.storage_path,
              }),
            )
            .map((document) => document.id)
        : [],
    );

    if (documents.length === 0) {
      return NextResponse.json(
        { error: "No documents to download" },
        { status: 404 },
      );
    }

    const workspaceId = link.workspace_id;
    const currentBandwidthEvaluation = await evaluateWorkspaceBandwidthLimit(
      workspaceId,
      0,
    );
    if (currentBandwidthEvaluation.shouldBlock) {
      return createBandwidthLimitResponse();
    }

    // Prepare ZIP entries
    const zipScope: ZipScope =
      scope === "folder" && folderId
        ? { kind: "folder", folderId }
        : { kind: "room" };

    const zipFolders: ZipFolder[] = folders.map((f) => ({
      id: f.id,
      name: f.name,
      parent_folder_id: f.parent_folder_id,
    }));

    const zipDocuments: ZipDocument[] = documents.map((d) => ({
      id: d.id,
      title: d.title,
      file_type: d.file_type,
      storage_path: d.storage_path,
      folder_id: d.folder_id,
    }));

    const { entries, skipped } = prepareZipEntries({
      folders: zipFolders,
      documents: zipDocuments,
      scope: zipScope,
      forcePdfDocumentIds: watermarkedDocumentIds,
    });

    if (entries.length === 0) {
      return NextResponse.json(
        { error: "No documents in the selected scope" },
        { status: 404 },
      );
    }
    if (entries.length > DATA_ROOM_ZIP_MAX_DOCUMENTS) {
      return NextResponse.json(
        {
          error: `Too many documents to zip (max ${DATA_ROOM_ZIP_MAX_DOCUMENTS})`,
        },
        { status: 413 },
      );
    }

    const selectedDocumentIds = new Set(
      entries.map((entry) => entry.document.id),
    );
    for (const documentId of watermarkedDocumentIds) {
      if (!selectedDocumentIds.has(documentId)) {
        watermarkedDocumentIds.delete(documentId);
      }
    }

    if (skipped.length > 0) {
      console.warn(
        `[Public ZIP Download] Skipped ${skipped.length} documents without storage_path`,
      );
    }

    // Resolve watermark settings if needed
    let watermarkDefinition: WatermarkDefinition | null = null;
    let imageBytes: ArrayBuffer | undefined;
    let imageContentType: string | undefined;
    let imageFileName: string | undefined;

    if (watermarkedDocumentIds.size > 0) {
      const resolved = await resolveWatermarkForLink({
        client: supabase,
        link: {
          workspace_id: link.workspace_id,
          watermark_id: link.watermark_id ?? null,
        },
        deadline,
      });
      watermarkDefinition = resolved.definition ?? null;
      imageBytes = resolved.imageBytes;
      imageContentType = resolved.imageContentType;
      imageFileName = resolved.imageFileName;

      if (!watermarkDefinition) {
        console.error(
          "[Public ZIP Download] Required watermark is not configured",
          { linkId, dataRoomId },
        );
        return NextResponse.json(
          { error: "Unable to prepare secure download" },
          { status: 503 },
        );
      }
    }

    const dynamicValues: Record<string, string> = {};
    if (link.dynamic_watermark_email && verifiedEmail) {
      dynamicValues.email = verifiedEmail;
    }
    if (link.dynamic_watermark_ip) {
      const clientIp = extractClientIp(req);
      if (clientIp) dynamicValues.ip = clientIp;
    }
    if (
      (link as { dynamic_watermark_datetime?: boolean })
        .dynamic_watermark_datetime
    ) {
      dynamicValues.datetime = new Date().toISOString();
    }

    // Preflight immutable storage objects before starting a streaming response.
    // Only one admitted object is opened at a time by createStreamingZip.
    const streamEntries: StreamingZipEntry[] = [];
    const omittedZipPaths: string[] = [];
    let totalBytes = 0;
    let stagedTransformBytes = 0;

    // Create a map of document ID to document record for quick lookup
    const docMap = new Map<string, DocumentRecord>();
    for (const doc of documents) {
      docMap.set(doc.id, doc);
    }

    const preflightResults = await Promise.all(
      entries.map(async (entry) => {
        const doc = docMap.get(entry.document.id);
        if (!doc?.storage_path) {
          return {
            entry,
            doc,
            estimatedBytes: null,
            message: "Storage path missing",
          };
        }
        const storagePath = doc.storage_path;

        if (!watermarkedDocumentIds.has(doc.id)) {
          const originalSize = await runWithinOperationDeadline(deadline, {
            operation: "conversion",
            format: "zip",
            reserveMs: ZIP_DOWNLOAD_FINALIZE_RESERVE_MS,
            run: async () =>
              getObjectByteLength({
                logicalBucket: DATA_ROOM_STORAGE_BUCKET_NAME,
                path: storagePath,
              }),
          });
          return originalSize.ok
            ? {
                entry,
                doc,
                estimatedBytes: originalSize.byteLength,
                message: null,
              }
            : {
                entry,
                doc,
                estimatedBytes: null,
                message: originalSize.message,
              };
        }

        const originalExt = (
          doc.file_type ||
          storagePath.split(".").pop() ||
          ""
        ).toLowerCase();
        if (
          originalExt !== "pdf" &&
          doc.conversion_status === "completed" &&
          doc.converted_storage_path
        ) {
          const convertedStoragePath = doc.converted_storage_path;
          const convertedSize = await runWithinOperationDeadline(deadline, {
            operation: "conversion",
            format: "zip",
            reserveMs: ZIP_DOWNLOAD_FINALIZE_RESERVE_MS,
            run: async () =>
              getObjectByteLength({
                logicalBucket: DATA_ROOM_CONVERTED_BUCKET_NAME,
                path: convertedStoragePath,
              }),
          });
          if (
            convertedSize.ok &&
            convertedSize.byteLength <= PDF_PROCESSING_MAX_INPUT_BYTES
          ) {
            return {
              entry,
              doc,
              estimatedBytes: convertedSize.byteLength,
              message: null,
            };
          }
        }

        const originalSize = await runWithinOperationDeadline(deadline, {
          operation: "conversion",
          format: "zip",
          reserveMs: ZIP_DOWNLOAD_FINALIZE_RESERVE_MS,
          run: async () =>
            getObjectByteLength({
              logicalBucket: DATA_ROOM_STORAGE_BUCKET_NAME,
              path: storagePath,
            }),
        });
        if (!originalSize.ok) {
          return {
            entry,
            doc,
            estimatedBytes: null,
            message: originalSize.message,
          };
        }
        const originalLimit =
          originalExt === "pdf"
            ? PDF_PROCESSING_MAX_INPUT_BYTES
            : DOCUMENT_CONVERSION_MAX_INPUT_BYTES;
        if (originalSize.byteLength > originalLimit) {
          return {
            entry,
            doc,
            estimatedBytes: null,
            message:
              originalExt === "pdf"
                ? "PDF exceeds the 100 MiB processing limit"
                : "Document exceeds the 50 MiB conversion limit",
          };
        }
        return {
          entry,
          doc,
          estimatedBytes: originalSize.byteLength,
          message: null,
        };
      }),
    );

    for (const result of preflightResults) {
      if (result.estimatedBytes === null || !result.doc?.storage_path) {
        if (result.doc && watermarkedDocumentIds.has(result.doc.id)) {
          console.error(
            `[Public ZIP Download] Required watermark source failed preflight for ${result.doc.id}: ${result.message}`,
          );
          return NextResponse.json(
            { error: "Unable to prepare secure download" },
            { status: 503 },
          );
        }
        console.warn(
          `[Public ZIP Download] Failed to preflight ${result.doc?.id ?? result.entry.document.id}: ${result.message}`,
        );
        omittedZipPaths.push(result.entry.zipPath);
        continue;
      }

      const doc = result.doc;
      if (watermarkedDocumentIds.has(doc.id)) {
        const pdfResult = await ensurePdfBuffer(supabase, doc, deadline);
        if (!pdfResult.ok) {
          console.error(
            `[Public ZIP Download] Unable to prepare PDF ${doc.id}: ${pdfResult.message}`,
          );
          if ("code" in pdfResult) {
            const publicFailure = toPublicEngineErrorResponse(pdfResult);
            return NextResponse.json(publicFailure.body, {
              status: publicFailure.status,
            });
          }
          return NextResponse.json(
            { error: "Unable to prepare secure download" },
            { status: 503 },
          );
        }

        const watermarked = await applyRequiredWatermark({
          definition: watermarkDefinition,
          apply: async (requiredDefinition) => {
            const applied = await applyWatermarkToPdf({
              sourcePdf: pdfResult.buffer,
              definition: requiredDefinition,
              dynamicValues:
                Object.keys(dynamicValues).length > 0
                  ? dynamicValues
                  : undefined,
              imageBytes,
              imageContentType,
              imageFileName,
              timeoutMs: remainingOperationTimeMs(
                deadline,
                Date.now(),
                ZIP_DOWNLOAD_FINALIZE_RESERVE_MS,
              ),
            });
            return applied.ok
              ? { ok: true, value: Buffer.from(applied.pdf) }
              : applied;
          },
        });
        if (!watermarked.ok) {
          console.error(
            `[Public ZIP Download] Required watermark failed for ${doc.id}`,
            { code: watermarked.code, operation: watermarked.operation },
          );
          const publicFailure = toPublicEngineErrorResponse(watermarked);
          return NextResponse.json(publicFailure.body, {
            status: publicFailure.status,
          });
        }
        if (watermarked.value.byteLength > PDF_PROCESSING_MAX_INPUT_BYTES) {
          console.error(
            `[Public ZIP Download] Watermarked PDF ${doc.id} exceeds the 100 MiB processing limit`,
          );
          return NextResponse.json(
            { error: "Unable to prepare secure download" },
            { status: 503 },
          );
        }

        totalBytes += watermarked.value.byteLength;
        if (totalBytes > DATA_ROOM_ZIP_MAX_INPUT_BYTES) {
          return NextResponse.json(
            {
              error: `ZIP file too large (max ${DATA_ROOM_ZIP_MAX_INPUT_BYTES} bytes)`,
            },
            { status: 413 },
          );
        }
        stagedTransformBytes += watermarked.value.byteLength;
        if (stagedTransformBytes > DATA_ROOM_ZIP_MAX_STAGED_TRANSFORM_BYTES) {
          return NextResponse.json(
            {
              error:
                "Secure ZIP transforms are too large to prepare safely (max 450 MiB)",
            },
            { status: 413 },
          );
        }

        zipTempWorkspace ??= await runWithinOperationDeadline(deadline, {
          operation: "watermark",
          format: "pdf",
          reserveMs: ZIP_DOWNLOAD_FINALIZE_RESERVE_MS,
          run: async () =>
            createZipTempWorkspace({
              maxStagedBytes: DATA_ROOM_ZIP_MAX_STAGED_TRANSFORM_BYTES,
            }),
        });
        const tempWorkspace = zipTempWorkspace;
        const staged = await runWithinOperationDeadline(deadline, {
          operation: "watermark",
          format: "pdf",
          reserveMs: ZIP_DOWNLOAD_FINALIZE_RESERVE_MS,
          run: async () =>
            tempWorkspace.stageBuffer(result.entry.zipPath, watermarked.value),
        });
        streamEntries.push(staged.entry);
        continue;
      }

      totalBytes += result.estimatedBytes;
      if (totalBytes > DATA_ROOM_ZIP_MAX_INPUT_BYTES) {
        return NextResponse.json(
          {
            error: `ZIP file too large (max ${DATA_ROOM_ZIP_MAX_INPUT_BYTES} bytes)`,
          },
          { status: 413 },
        );
      }

      const storagePath = doc.storage_path;
      if (!storagePath) {
        omittedZipPaths.push(result.entry.zipPath);
        continue;
      }
      const expectedBytes = result.estimatedBytes;
      streamEntries.push({
        zipPath: result.entry.zipPath,
        open: async (signal) => {
          const opened = await openExactObjectStream({
            logicalBucket: DATA_ROOM_STORAGE_BUCKET_NAME,
            path: storagePath,
            expectedBytes,
            signal,
          });
          if (!opened.ok) {
            throw new Error(`Unable to stream ${doc.id}: ${opened.message}`);
          }
          return { chunks: opened.chunks, close: opened.close };
        },
      });
    }

    if (streamEntries.length === 0) {
      return NextResponse.json(
        { error: "No files could be processed for download" },
        { status: 500 },
      );
    }

    // Surface partial failures: list omitted files inside the ZIP itself
    if (omittedZipPaths.length > 0) {
      const missingNote = [
        "These files could not be included in this download. Please try again or contact the document owner.",
        "",
        ...omittedZipPaths,
        "",
      ].join("\n");
      const missingNoteBytes = new TextEncoder().encode(missingNote);
      if (
        totalBytes + missingNoteBytes.byteLength >
        DATA_ROOM_ZIP_MAX_INPUT_BYTES
      ) {
        return NextResponse.json(
          {
            error: `ZIP file too large (max ${DATA_ROOM_ZIP_MAX_INPUT_BYTES} bytes)`,
          },
          { status: 413 },
        );
      }
      totalBytes += missingNoteBytes.byteLength;
      streamEntries.push({
        zipPath: "_MISSING_FILES.txt",
        open: async () => ({
          chunks: (async function* () {
            yield missingNoteBytes;
          })(),
        }),
      });
    }

    const projectedBandwidthEvaluation = await evaluateWorkspaceBandwidthLimit(
      workspaceId,
      totalBytes,
    );
    if (projectedBandwidthEvaluation.shouldBlock) {
      return createBandwidthLimitResponse();
    }

    const deadlineSignal = createOperationDeadlineSignal(deadline, {
      operation: "conversion",
      format: "zip",
    });
    const archive = createStreamingZip(streamEntries, {
      maxUncompressedBytes: DATA_ROOM_ZIP_MAX_INPUT_BYTES,
      signal: deadlineSignal.signal,
    });
    const streamCleanupWorkspace = zipTempWorkspace;
    void archive.completion
      .then(({ archiveBytes }) =>
        trackWorkspaceBandwidth(workspaceId, archiveBytes, 1),
      )
      .catch((error) => {
        console.warn(
          "[Public ZIP Download] Stream ended before completion",
          error,
        );
      })
      .finally(async () => {
        deadlineSignal.dispose();
        await streamCleanupWorkspace?.cleanup();
      });

    // Compute filename
    const zipFilename = computeZipFilename(room.name, zipScope, zipFolders);
    const safeFilename = sanitizeFileName(
      zipFilename.replace(/\.zip$/, ""),
      "zip",
    );

    const response = new NextResponse(archive.stream, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Cache-Control": "no-store",
      },
    });

    // Refresh cookies
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

    tempCleanupOwnedByStream = streamCleanupWorkspace !== null;
    return response;
  } catch (err) {
    const parsedFailure = engineFailureSchema.safeParse(err);
    if (parsedFailure.success) {
      const publicFailure = toPublicEngineErrorResponse(parsedFailure.data);
      return NextResponse.json(publicFailure.body, {
        status: publicFailure.status,
      });
    }
    console.error("[Public ZIP Download] Unexpected error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  } finally {
    if (zipTempWorkspace && !tempCleanupOwnedByStream) {
      await zipTempWorkspace.cleanup();
    }
  }
}
