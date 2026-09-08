import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  BRANDING_ASSETS_BUCKET_NAME,
  BRANDING_LOGO_MAX_FILE_SIZE_BYTES,
  DATA_ROOM_CONVERTED_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  DOCUMENT_CONVERSION_MAX_INPUT_BYTES,
  MERGED_DOWNLOAD_FINALIZE_RESERVE_MS,
  MERGED_DOWNLOAD_OPERATION_TIMEOUT_MS,
  PDF_MERGE_MAX_TOTAL_BYTES,
} from "@/lib/constants";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import {
  resolveRequiredWatermarkDefinition,
  type BrandingRecord,
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
import { getMimeType, sanitizeFileName } from "@/server/storage/downloadUtils";
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
import { mergePdfs } from "@/server/watermarkService";
import { hasWorkspaceEntitlement } from "@/server/workspaceEntitlement";
import { getPublicLinkAvailabilityError } from "@/server/publicLinkAvailability";
import {
  downloadToBufferBounded,
  getObjectByteLength,
  type LogicalBucket,
} from "@/server/storage";
import { isWatermarkEligibleDocument } from "@/server/watermarkPolicy";
import {
  createOperationDeadline,
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

type BufferResult =
  | { ok: true; buffer: Buffer }
  | { ok: false; status: number; message: string }
  | (EngineFailureResult & { status: number });

type MergeInputPreflight =
  | { ok: true; document: DocumentRecord }
  | { ok: false; status: number; message: string; documentId: string };

const mapWithConcurrency = async <TInput, TOutput>(
  inputs: TInput[],
  concurrency: number,
  mapper: (input: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> => {
  const results = new Map<number, { value: TOutput }>();
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), inputs.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < inputs.length) {
        const index = nextIndex;
        nextIndex += 1;
        results.set(index, { value: await mapper(inputs[index], index) });
      }
    }),
  );
  return inputs.map((_input, index) => {
    const result = results.get(index);
    if (!result) throw new Error("Bounded map did not produce every result");
    return result.value;
  });
};

const preflightMergeInput = async (
  document: DocumentRecord,
  deadline: OperationDeadline,
): Promise<MergeInputPreflight> => {
  const extension = (
    document.file_type ||
    document.storage_path?.split(".").pop() ||
    ""
  ).toLowerCase();
  const useConverted = Boolean(
    extension !== "pdf" &&
    document.conversion_status === "completed" &&
    document.converted_storage_path,
  );
  const selectedPath = useConverted
    ? document.converted_storage_path
    : document.storage_path;
  if (!selectedPath) {
    return {
      ok: false,
      status: 404,
      message: "Document source is unavailable",
      documentId: document.id,
    };
  }
  let path: string = selectedPath;
  let logicalBucket: LogicalBucket = useConverted
    ? DATA_ROOM_CONVERTED_BUCKET_NAME
    : DATA_ROOM_STORAGE_BUCKET_NAME;
  let size = await runWithinOperationDeadline(deadline, {
    operation: "merge",
    format: "pdf",
    reserveMs: MERGED_DOWNLOAD_FINALIZE_RESERVE_MS,
    run: async () => getObjectByteLength({ logicalBucket, path }),
  });
  // A completed row can outlive a missing immutable conversion object. The
  // later materialization step already repairs/falls back, so preflight the
  // original here instead of failing an otherwise viewable document.
  if (
    useConverted &&
    !size.ok &&
    size.status === 404 &&
    document.storage_path
  ) {
    path = document.storage_path;
    logicalBucket = DATA_ROOM_STORAGE_BUCKET_NAME;
    size = await runWithinOperationDeadline(deadline, {
      operation: "merge",
      format: "pdf",
      reserveMs: MERGED_DOWNLOAD_FINALIZE_RESERVE_MS,
      run: async () => getObjectByteLength({ logicalBucket, path }),
    });
  }
  if (!size.ok) {
    return {
      ok: false,
      status: size.status,
      message: size.message,
      documentId: document.id,
    };
  }
  const maxBytes =
    logicalBucket === DATA_ROOM_CONVERTED_BUCKET_NAME || extension === "pdf"
      ? PDF_MERGE_MAX_TOTAL_BYTES
      : DOCUMENT_CONVERSION_MAX_INPUT_BYTES;
  if (size.byteLength > maxBytes) {
    return {
      ok: false,
      status: 413,
      message: "Document exceeds the merged-download input limit",
      documentId: document.id,
    };
  }
  return { ok: true, document };
};

const downloadFileBuffer = async (
  _client: ReturnType<typeof createSupabaseServiceClient>,
  bucket: LogicalBucket,
  path: string,
  maxBytes: number,
  deadline: OperationDeadline,
): Promise<BufferResult> => {
  const result = await runWithinOperationDeadline(deadline, {
    operation: "merge",
    format: "pdf",
    reserveMs: MERGED_DOWNLOAD_FINALIZE_RESERVE_MS,
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
  maxPdfBytes: number,
  deadline: OperationDeadline,
): Promise<BufferResult> => {
  if (maxPdfBytes <= 0) {
    return {
      ok: false,
      status: 413,
      message: "Merged PDF size limit reached",
    };
  }

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
      maxPdfBytes,
      deadline,
    );
  }

  if (doc.converted_storage_path && doc.conversion_status === "completed") {
    const converted = await downloadFileBuffer(
      client,
      DATA_ROOM_CONVERTED_BUCKET_NAME,
      doc.converted_storage_path,
      maxPdfBytes,
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
      MERGED_DOWNLOAD_FINALIZE_RESERVE_MS,
    ),
  });

  if (!pdfResult.ok) {
    return pdfResult;
  }
  if (pdfResult.pdfBytes.byteLength > maxPdfBytes) {
    return {
      ok: false,
      status: 413,
      message: "Converted PDF exceeds the remaining merged PDF size limit",
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
    reserveMs: MERGED_DOWNLOAD_FINALIZE_RESERVE_MS,
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
});

const MAX_MERGE_DOCS = 25;

const createBandwidthLimitResponse = () =>
  NextResponse.json(
    { error: "Bandwidth limit reached", code: "BANDWIDTH_LIMIT_REACHED" },
    { status: 403 },
  );

export async function POST(req: NextRequest) {
  const deadline = createOperationDeadline(
    MERGED_DOWNLOAD_OPERATION_TIMEOUT_MS,
  );
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { linkId, dataRoomId } = parsed.data;
    const resourceType: PublicResourceType = "data_room";
    const resourceId = dataRoomId;
    const resourceColumn = "data_room_id";

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

    const { data: docs, error: docsError } = await supabase
      .from("documents")
      .select(
        "id, title, file_type, storage_path, converted_storage_path, conversion_status, workspace_id, data_room_id, folder_id",
      )
      .eq("data_room_id", dataRoomId);

    if (docsError) {
      return NextResponse.json(
        { error: "Unable to load documents" },
        { status: 500 },
      );
    }

    let documents = ((docs ?? []) as DocumentRecord[])
      .filter((d) => d.id && d.storage_path)
      .sort((a, b) => (a.title || "").localeCompare(b.title || ""));

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
        console.error("[Public Download Merged] Failed to evaluate ALC", {
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

      const { data: folders, error: foldersError } = await supabase
        .from("folders")
        .select("id, parent_folder_id")
        .eq("data_room_id", dataRoomId);

      if (foldersError) {
        console.error(
          "[Public Download Merged] Failed to load folders for ALC",
          {
            linkId,
            dataRoomId,
            error: foldersError,
          },
        );
        return NextResponse.json(
          { error: "Access denied", code: "ALC_NOT_ALLOWED" },
          { status: 403 },
        );
      }

      const filtered = filterDataRoomContentByAlc({
        folders: (folders ?? []) as Array<{
          id: string;
          parent_folder_id: string | null;
        }>,
        documents,
        roomAllowed: alcSeeds.roomAllowed,
        allowedFolderSeedIds: alcSeeds.allowedFolderSeedIds,
        allowedDocumentSeedIds: alcSeeds.allowedDocumentSeedIds,
      });

      documents = (filtered.filteredDocuments ?? []) as DocumentRecord[];
    }

    // A merged PDF can represent only PDFs and convertible document formats.
    // Media remains available through its original file/ZIP download paths.
    documents = documents.filter((document) =>
      isWatermarkEligibleDocument({
        fileType: document.file_type,
        storagePath: document.storage_path,
      }),
    );

    if (documents.length === 0) {
      return NextResponse.json(
        { error: "No PDF-compatible documents to merge" },
        { status: 404 },
      );
    }
    if (documents.length > MAX_MERGE_DOCS) {
      return NextResponse.json(
        { error: `Too many documents to merge (max ${MAX_MERGE_DOCS})` },
        { status: 413 },
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

    let watermarkDefinition = null;
    let imageBytes: ArrayBuffer | undefined;
    let imageContentType: string | undefined;
    let imageFileName: string | undefined;

    if (link.apply_watermark) {
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
          "[Public Merged Download] Required watermark definition is missing",
          { linkId: link.id, workspaceId: link.workspace_id },
        );
        return NextResponse.json(
          { error: "Unable to prepare secure download" },
          { status: 503 },
        );
      }
    }

    // The watermark image and source PDFs share the wasm engine's aggregate
    // merge ceiling. Each storage read is bounded by the remaining budget.
    const mergeBudgetBytes =
      PDF_MERGE_MAX_TOTAL_BYTES - (imageBytes?.byteLength ?? 0);

    // Complete bounded HEAD/range preflight for every requested input before
    // downloading or converting any bytes. mapWithConcurrency preserves the
    // requested document order in its returned array.
    const preflight = await mapWithConcurrency(documents, 4, async (document) =>
      preflightMergeInput(document, deadline),
    );
    const preflightFailure = preflight.find((result) => !result.ok);
    if (preflightFailure && !preflightFailure.ok) {
      console.error("[Public Merged Download] input preflight failed", {
        documentId: preflightFailure.documentId,
        status: preflightFailure.status,
      });
      return NextResponse.json(
        { error: "Unable to prepare merged download" },
        { status: preflightFailure.status },
      );
    }

    const pdfBuffers: Buffer[] = [];
    let totalBytes = 0;
    for (const result of preflight) {
      if (!result.ok) continue;
      const doc = result.document;
      const remainingPdfBytes = mergeBudgetBytes - totalBytes;
      const pdfResult = await ensurePdfBuffer(
        supabase,
        doc,
        remainingPdfBytes,
        deadline,
      );
      if (!pdfResult.ok) {
        console.error("[Public Merged Download] PDF preparation failed", {
          documentId: doc.id,
          status: pdfResult.status,
          message: pdfResult.message,
        });
        if ("code" in pdfResult) {
          const publicFailure = toPublicEngineErrorResponse(pdfResult);
          return NextResponse.json(publicFailure.body, {
            status: publicFailure.status,
          });
        }
        return NextResponse.json(
          {
            error:
              pdfResult.status === 404
                ? "File not available"
                : "Unable to prepare merged download",
          },
          { status: pdfResult.status },
        );
      }
      pdfBuffers.push(pdfResult.buffer);
      totalBytes += pdfResult.buffer.byteLength;
      if (totalBytes > mergeBudgetBytes) {
        return NextResponse.json(
          { error: `Merged PDF too large (max ${mergeBudgetBytes} bytes)` },
          { status: 413 },
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

    const mergeResult = await mergePdfs({
      pdfs: pdfBuffers,
      definition: watermarkDefinition,
      dynamicValues:
        Object.keys(dynamicValues).length > 0 ? dynamicValues : undefined,
      imageBytes,
      imageContentType,
      imageFileName,
      timeoutMs: remainingOperationTimeMs(
        deadline,
        Date.now(),
        MERGED_DOWNLOAD_FINALIZE_RESERVE_MS,
      ),
    });

    if (!mergeResult.ok) {
      console.error("[Public Merged Download] merge failed", {
        status: mergeResult.status,
        message: mergeResult.message,
      });
      const publicFailure = toPublicEngineErrorResponse(mergeResult);
      return NextResponse.json(publicFailure.body, {
        status: publicFailure.status,
      });
    }

    const mergedBuffer = Buffer.from(mergeResult.pdf);
    const projectedBandwidthEvaluation = await evaluateWorkspaceBandwidthLimit(
      workspaceId,
      mergedBuffer.byteLength,
    );
    if (projectedBandwidthEvaluation.shouldBlock) {
      return createBandwidthLimitResponse();
    }

    void trackWorkspaceBandwidth(workspaceId, mergedBuffer.byteLength, 1);

    const contentType = getMimeType("pdf");
    const fileName = sanitizeFileName("data-room", "pdf");
    const response = new NextResponse(mergeResult.pdf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": mergedBuffer.byteLength.toString(),
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
    console.error("[Public Download Merged] Unexpected error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
