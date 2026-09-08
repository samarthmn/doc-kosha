import { NextRequest } from "next/server";
import { z } from "zod";
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
  downloadToBufferBounded,
  presignGetObject,
  type LogicalBucket,
} from "@/server/storage";
import { extractClientIp } from "@/server/requestIp";
import {
  resolveRequiredWatermarkDefinition,
  type BrandingRecord,
  type WatermarkDefinition,
  type WatermarkDynamicValues,
} from "@/lib/branding";
import {
  materializeWatermark,
  type WatermarkTemplateRow,
} from "@/lib/watermarks";
import { applyWatermarkToPdf } from "@/server/watermarkService";
import { isWatermarkEligibleDocument } from "@/server/watermarkPolicy";
import { processDocumentProcessingJob } from "@/server/documentProcessingQueue";
import { resolvePublicDirectAsset } from "@/server/publicDirectAsset";
import {
  createOperationDeadline,
  remainingOperationTimeMs,
  runWithinOperationDeadline,
} from "@/server/operationDeadline";
import {
  createEngineFailure,
  engineFailureSchema,
  toPublicEngineErrorResponse,
  type EngineFailure,
} from "@/server/engineErrors";
import { requiresVerifiedViewerEmail } from "@/lib/publicLinkEmailPolicy";
import { logEngineRuntimeFailure } from "@/server/engineRuntimeDiagnostics";
import { createPublicFileInfrastructureFailureResponse } from "@/server/publicFileRouteDiagnostics";

export const maxDuration = 180;
export const runtime = "nodejs";

const QuerySchema = z.object({
  linkId: z.string().uuid(),
  documentId: z.string().uuid(),
  dataRoomId: z.string().uuid().optional(),
  variant: z.enum(["original", "converted"]).default("converted"),
});

const createBandwidthLimitResponse = (): Response =>
  new Response(
    JSON.stringify({
      error: "Bandwidth limit reached",
      code: "BANDWIDTH_LIMIT_REACHED",
    }),
    {
      status: 403,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/json",
        "X-DocKosha-Error-Code": "BANDWIDTH_LIMIT_REACHED",
      },
    },
  );

const bufferToArrayBuffer = (buffer: Buffer): ArrayBuffer => {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
};

const downloadWatermarkImage = async (
  path: string | null | undefined,
): Promise<{
  bytes: ArrayBuffer | null;
  contentType?: string;
  name?: string;
}> => {
  if (!path) return { bytes: null };

  const result = await downloadToBufferBounded({
    logicalBucket: BRANDING_ASSETS_BUCKET_NAME,
    path,
    maxBytes: BRANDING_LOGO_MAX_FILE_SIZE_BYTES,
  });

  if (!result.ok) {
    return { bytes: null };
  }

  return {
    bytes: bufferToArrayBuffer(result.buffer),
    contentType: result.contentType || undefined,
    name: path.split("/").pop() ?? "watermark-image",
  };
};

const resolveWatermarkForLink = async (params: {
  client: ReturnType<typeof createSupabaseServiceClient>;
  workspaceId: string;
  watermarkId?: string | null;
}): Promise<{
  definition: WatermarkDefinition | null;
  imageBytes?: ArrayBuffer | null;
  imageContentType?: string;
  imageFileName?: string;
}> => {
  const { client, workspaceId, watermarkId } = params;

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
        materialized.imageStoragePath ?? undefined,
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
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const definition = resolveRequiredWatermarkDefinition(
    (brandingRow as BrandingRecord | null) ?? null,
  );
  return { definition };
};

const handleFileRequest = async (
  req: NextRequest,
  options: { isHead?: boolean } = {},
): Promise<Response> => {
  const requestId = crypto.randomUUID();
  const engineFailureResponse = (failure: EngineFailure): Response => {
    logEngineRuntimeFailure({ requestId, failure });
    const publicFailure = toPublicEngineErrorResponse(failure);
    return Response.json(publicFailure.body, {
      status: publicFailure.status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-DocKosha-Request-Id": requestId,
        ...publicFailure.headers,
      },
    });
  };
  const deadline = createOperationDeadline(
    PUBLIC_DOWNLOAD_OPERATION_TIMEOUT_MS,
  );
  try {
    const isHead = options.isHead === true;
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      linkId: url.searchParams.get("linkId"),
      documentId: url.searchParams.get("documentId"),
      dataRoomId: url.searchParams.get("dataRoomId") || undefined,
      variant:
        (url.searchParams.get("variant") as "original" | "converted") ??
        "converted",
    });
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const { linkId, documentId, dataRoomId, variant } = parsed.data;
    const resourceType: PublicResourceType = dataRoomId
      ? TrackerResourceType.DataRoom
      : TrackerResourceType.Document;
    const resourceId = dataRoomId ?? documentId;
    const resourceColumn = dataRoomId ? "data_room_id" : "document_id";

    const supabase = createSupabaseServiceClient();

    const { data: link } = await supabase
      .from("links")
      .select(
        "id, document_id, workspace_id, email_verification, nda_gate, collect_email_for_analytics, can_download, apply_watermark, dynamic_watermark_email, dynamic_watermark_ip, dynamic_watermark_datetime, watermark_id, open_once, revoked_at, expires_at",
      )
      .eq("id", linkId)
      .eq(resourceColumn, resourceId)
      .maybeSingle();
    if (!link) {
      return new Response(JSON.stringify({ error: "Link not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const availabilityError = getPublicLinkAvailabilityError(link);
    if (availabilityError) {
      const { status, ...payload } = availabilityError;
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const linkSettings = link as {
      can_download?: boolean;
      apply_watermark?: boolean;
      dynamic_watermark_email?: boolean;
      dynamic_watermark_ip?: boolean;
      dynamic_watermark_datetime?: boolean;
      collect_email_for_analytics?: boolean;
      watermark_id?: string | null;
    };

    const hasEntitlement = await hasWorkspaceEntitlement(link.workspace_id);
    if (!hasEntitlement) {
      return new Response(JSON.stringify({ error: "Link not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate access cookie (set by resolve)
    const accessCookieName = getAccessCookieKey(
      resourceType,
      resourceId,
      linkId,
    );
    const accessCookieValue = req.cookies.get(accessCookieName)?.value;
    if (!accessCookieValue) {
      return new Response(JSON.stringify({ error: "Access required" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "Access expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
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
    const requiresVerifiedEmail = requiresVerifiedViewerEmail({
      emailVerification: link.email_verification,
      ndaGate: link.nda_gate,
      collectEmailForAnalytics: linkSettings.collect_email_for_analytics,
      dynamicWatermarkEmail:
        linkSettings.apply_watermark && linkSettings.dynamic_watermark_email,
      allowlistActive: allowlistStatus.isActive || alcActive,
    });
    let verifiedEmail: string | null = null;

    if (requiresVerifiedEmail) {
      if (!emailPayload || !emailPayload.email) {
        return new Response(
          JSON.stringify({ error: "Email verification required" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        typeof emailPayload.exp === "number" &&
        emailPayload.exp < Date.now()
      ) {
        return new Response(
          JSON.stringify({ error: "Email verification expired" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      if (allowlistStatus.isActive && allowlistStatus.emailBlocked === true) {
        return new Response(
          JSON.stringify({
            error: "Email not allowed",
            code: "EMAIL_NOT_ALLOWED",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        !alcActive &&
        allowlistStatus.isActive &&
        allowlistStatus.emailAllowed === false
      ) {
        return new Response(
          JSON.stringify({
            error: "Email not allowed",
            code: "EMAIL_NOT_ALLOWED",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
      verifiedEmail =
        allowlistStatus.normalizedEmail ?? emailPayload.email ?? null;
    }

    if (link.nda_gate) {
      const emailForNda = verifiedEmail ?? emailPayload?.email ?? null;
      if (!emailForNda) {
        return new Response(
          JSON.stringify({ error: "Email verification required" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      const { data: signature } = await supabase
        .from("nda_signatures")
        .select("id, signed_pdf_path")
        .eq("link_id", linkId)
        .eq("email", emailForNda)
        .maybeSingle();
      if (!signature) {
        return new Response(
          JSON.stringify({ error: "NDA signature required" }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
      if (!signature.signed_pdf_path) {
        return new Response(
          JSON.stringify({
            error: "Signed NDA is being prepared",
            code: "NDA_PDF_PENDING",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // Lookup document path
    const { data: doc } = await supabase
      .from("documents")
      .select(
        "id, storage_path, converted_storage_path, conversion_status, workspace_id, file_type, title, data_room_id, folder_id, size_bytes",
      )
      .eq("id", documentId)
      .maybeSingle();
    if (!doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const targetWorkspaceId = doc.workspace_id ?? link.workspace_id;
    const currentBandwidthEvaluation = await evaluateWorkspaceBandwidthLimit(
      targetWorkspaceId,
      0,
    );
    if (currentBandwidthEvaluation.shouldBlock) {
      return createBandwidthLimitResponse();
    }

    const watermarkEligible = isWatermarkEligibleDocument({
      fileType: doc.file_type,
      storagePath: doc.storage_path,
    });
    const watermarkRequired = Boolean(
      linkSettings.apply_watermark && watermarkEligible,
    );

    const useConverted =
      watermarkEligible &&
      variant === "converted" &&
      !!doc.converted_storage_path &&
      doc.conversion_status === "completed";
    if (dataRoomId && doc.data_room_id !== dataRoomId) {
      return new Response(
        JSON.stringify({ error: "Document not part of data room" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (alcActive) {
      if (!verifiedEmail) {
        return new Response(
          JSON.stringify({
            error: "Email verification required",
            code: "EMAIL_OTP_REQUIRED",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }

      const alcSeedsResult = await fetchLinkAlcViewerSeeds(supabase, {
        linkId,
        workspaceId: link.workspace_id,
        viewerEmail: verifiedEmail,
      })
        .then((seeds) => ({ ok: true as const, seeds }))
        .catch(() => ({ ok: false as const }));

      if (!alcSeedsResult.ok) {
        return createPublicFileInfrastructureFailureResponse({
          requestId,
          operation: "alc_seed_lookup",
          reasonCode: "alc_seed_lookup_failed",
          status: 503,
          code: "ACCESS_EVALUATION_UNAVAILABLE",
          message: "Access evaluation is temporarily unavailable",
        });
      }

      const alcSeeds = alcSeedsResult.seeds;

      if (isAlcSeedEmpty(alcSeeds)) {
        return new Response(
          JSON.stringify({ error: "Access denied", code: "ALC_NOT_ALLOWED" }),
          { status: 403, headers: { "Content-Type": "application/json" } },
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
            return new Response(
              JSON.stringify({
                error: "Access denied",
                code: "ALC_NOT_ALLOWED",
              }),
              { status: 403, headers: { "Content-Type": "application/json" } },
            );
          }

          const { data: folders, error: foldersError } = await supabase
            .from("folders")
            .select("id, parent_folder_id")
            .eq("data_room_id", dataRoomId as string);

          if (foldersError) {
            return createPublicFileInfrastructureFailureResponse({
              requestId,
              operation: "alc_folder_lookup",
              reasonCode: "alc_folder_lookup_failed",
              status: 503,
              code: "ACCESS_EVALUATION_UNAVAILABLE",
              message: "Access evaluation is temporarily unavailable",
            });
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
            return new Response(
              JSON.stringify({
                error: "Access denied",
                code: "ALC_NOT_ALLOWED",
              }),
              { status: 403, headers: { "Content-Type": "application/json" } },
            );
          }
        }
      }
    }

    const originalBucket = doc.data_room_id
      ? DATA_ROOM_STORAGE_BUCKET_NAME
      : STORAGE_BUCKET_NAME;
    const convertedBucket = doc.data_room_id
      ? DATA_ROOM_CONVERTED_BUCKET_NAME
      : CONVERTED_STORAGE_BUCKET_NAME;

    const bucket = useConverted ? convertedBucket : originalBucket;
    const path = useConverted ? doc.converted_storage_path : doc.storage_path;
    if (!path) {
      return new Response(JSON.stringify({ error: "File not available" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const extension = (
      useConverted ? "pdf" : doc.file_type || path.split(".").pop() || "bin"
    ).toLowerCase();
    const isPdf = extension === "pdf";

    // Watermark document formats only. Legacy image/audio/video links keep
    // their original direct-delivery behavior because those assets have no
    // PDF watermark representation.
    if (watermarkRequired && (!isPdf || !targetWorkspaceId)) {
      return engineFailureResponse(
        createEngineFailure({
          code: "unsupported_format",
          message: "Required watermark has no eligible PDF source.",
          operation: "watermark",
          format: extension,
        }),
      );
    }

    if (watermarkRequired && isPdf && targetWorkspaceId) {
      const watermarkId = linkSettings.watermark_id;
      const resolved = await resolveWatermarkForLink({
        client: supabase,
        workspaceId: targetWorkspaceId,
        watermarkId,
      });

      if (!resolved.definition) {
        return engineFailureResponse(
          createEngineFailure({
            code: "missing_asset",
            message: "Required watermark definition is missing.",
            operation: "watermark",
            format: "pdf",
          }),
        );
      }

      {
        let downloadResult = await runWithinOperationDeadline(deadline, {
          operation: "watermark",
          format: "pdf",
          run: async () =>
            downloadToBufferBounded({
              logicalBucket: bucket as LogicalBucket,
              path,
              maxBytes: PDF_PROCESSING_MAX_INPUT_BYTES,
            }),
        });

        if (
          !downloadResult.ok &&
          downloadResult.status === 404 &&
          useConverted &&
          targetWorkspaceId
        ) {
          await runWithinOperationDeadline(deadline, {
            operation: "conversion",
            run: async () =>
              processDocumentProcessingJob(
                { documentId, workspaceId: targetWorkspaceId },
                { force: true, deadlineAt: deadline.deadlineAt },
              ),
          });

          const { data: repaired } = await supabase
            .from("documents")
            .select(
              "converted_storage_path, conversion_status, workspace_id, data_room_id",
            )
            .eq("id", documentId)
            .eq("workspace_id", targetWorkspaceId)
            .maybeSingle();
          if (
            repaired?.conversion_status === "completed" &&
            repaired.converted_storage_path
          ) {
            const repairedPath = repaired.converted_storage_path;
            downloadResult = await runWithinOperationDeadline(deadline, {
              operation: "watermark",
              format: "pdf",
              run: async () =>
                downloadToBufferBounded({
                  logicalBucket: (repaired.data_room_id
                    ? DATA_ROOM_CONVERTED_BUCKET_NAME
                    : CONVERTED_STORAGE_BUCKET_NAME) as LogicalBucket,
                  path: repairedPath,
                  maxBytes: PDF_PROCESSING_MAX_INPUT_BYTES,
                }),
            });
          } else if (
            repaired?.conversion_status === "pending" ||
            repaired?.conversion_status === "in_progress"
          ) {
            return new Response(
              JSON.stringify({
                error: "Document is being repaired",
                code: "DOCUMENT_PROCESSING",
              }),
              {
                status: 409,
                headers: {
                  "Cache-Control": "private, no-store",
                  "Content-Type": "application/json",
                  "Retry-After": "3",
                  "X-DocKosha-Error-Code": "DOCUMENT_PROCESSING",
                  "X-DocKosha-Retryable": "false",
                  "X-DocKosha-Request-Id": requestId,
                },
              },
            );
          } else {
            // A failed (or vanished) repair is recoverable server state — the
            // document and its original still exist, and the next request
            // retries with force. Don't fall through to the stale 404, whose
            // client copy reads as permanently gone.
            return new Response(
              JSON.stringify({
                error: "Unable to render this document securely",
                code: "CONVERSION_FAILED",
              }),
              {
                status: 503,
                headers: {
                  "Cache-Control": "private, no-store",
                  "Content-Type": "application/json",
                  "X-DocKosha-Error-Code": "CONVERSION_FAILED",
                  "X-DocKosha-Retryable": "false",
                  "X-DocKosha-Request-Id": requestId,
                },
              },
            );
          }
        }

        if (!downloadResult.ok) {
          const retryable =
            downloadResult.status === 409 || downloadResult.status >= 500;
          return createPublicFileInfrastructureFailureResponse({
            requestId,
            operation: "storage_download",
            reasonCode: "storage_download_failed",
            status: downloadResult.status,
            code: retryable ? "FILE_STORAGE_UNAVAILABLE" : "FILE_NOT_AVAILABLE",
            message: retryable
              ? "File storage is temporarily unavailable"
              : "File not available",
            retryable,
          });
        }

        let dynamicValues: WatermarkDynamicValues | undefined;
        if (linkSettings.dynamic_watermark_email) {
          dynamicValues = dynamicValues ?? {};
          if (verifiedEmail) {
            dynamicValues.email = verifiedEmail;
          }
        }
        if (linkSettings.dynamic_watermark_ip) {
          dynamicValues = dynamicValues ?? {};
          const clientIp = extractClientIp(req);
          if (clientIp) {
            dynamicValues.ip = clientIp;
          }
        }
        if (
          (linkSettings as { dynamic_watermark_datetime?: boolean })
            .dynamic_watermark_datetime
        ) {
          dynamicValues = dynamicValues ?? {};
          dynamicValues.datetime = new Date();
        }

        const watermarkRes = await applyWatermarkToPdf({
          sourcePdf: downloadResult.buffer,
          definition: resolved.definition,
          dynamicValues,
          imageBytes: resolved.imageBytes ?? undefined,
          imageContentType: resolved.imageContentType,
          imageFileName: resolved.imageFileName,
          timeoutMs: remainingOperationTimeMs(deadline),
        });

        if (!watermarkRes.ok) {
          return engineFailureResponse(watermarkRes);
        }

        const watermarkedBuffer = Buffer.from(watermarkRes.pdf);

        const bandwidthEvaluation = await evaluateWorkspaceBandwidthLimit(
          targetWorkspaceId,
          isHead ? 0 : watermarkedBuffer.byteLength,
        );
        if (bandwidthEvaluation.shouldBlock) {
          return createBandwidthLimitResponse();
        }

        // Refresh cookies
        const refreshedAccessValue = signCookie({
          resourceType,
          resourceId,
          linkId,
          exp: Date.now() + 60 * 60 * 1000,
        });

        const headers = new Headers();
        headers.set("Content-Type", "application/pdf");
        headers.set("Content-Length", watermarkedBuffer.byteLength.toString());
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

        // Proxy path: track bytes + R2 Class B op (1 object downloaded)
        void trackWorkspaceBandwidth(
          targetWorkspaceId,
          isHead ? 0 : watermarkedBuffer.byteLength,
          0,
          { r2ClassBOps: 1 },
        );

        if (isHead) {
          return new Response(null, { status: 200, headers });
        }

        return new Response(bufferToArrayBuffer(watermarkedBuffer), {
          status: 200,
          headers,
        });
      }
    }

    const directAsset = await resolvePublicDirectAsset({
      client: supabase,
      document: doc,
      requestedVariant: variant,
      allowConverted: watermarkEligible,
      fallbackWorkspaceId: link.workspace_id,
      deadlineAt: deadline.deadlineAt,
    });
    if (!directAsset) {
      return new Response(JSON.stringify({ error: "File not available" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create short-lived signed URL for direct R2 delivery (no proxy bytes)
    const directDeliveryBytes = isHead
      ? 0
      : (directAsset.document.size_bytes ?? 0);
    const redirectBandwidthEvaluation = await evaluateWorkspaceBandwidthLimit(
      targetWorkspaceId,
      directDeliveryBytes,
    );
    if (redirectBandwidthEvaluation.shouldBlock) {
      return createBandwidthLimitResponse();
    }

    let signedUrl: string;
    try {
      signedUrl = await presignGetObject({
        logicalBucket: directAsset.logicalBucket,
        path: directAsset.path,
        expiresInSeconds: 5 * 60,
      });
    } catch {
      return createPublicFileInfrastructureFailureResponse({
        requestId,
        operation: "storage_signing",
        reasonCode: "storage_signing_failed",
        status: 503,
        code: "FILE_SIGNING_UNAVAILABLE",
        message: "File signing is temporarily unavailable",
      });
    }

    // Refresh access cookie window
    const refreshedAccessValue = signCookie({
      resourceType,
      resourceId,
      linkId,
      exp: Date.now() + 60 * 60 * 1000,
    });

    // Track R2 Class B op (best-effort, async)
    void trackWorkspaceBandwidth(targetWorkspaceId, directDeliveryBytes, 0, {
      r2ClassBOps: 1,
    });

    // Return 307 redirect to R2 signed URL (preserves method/headers for Range requests)
    const headers = new Headers();
    headers.set("Location", signedUrl);
    headers.set("Cache-Control", "private, no-store");
    headers.set(
      "Set-Cookie",
      `${accessCookieName}=${refreshedAccessValue}; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );

    return new Response(null, {
      status: isHead ? 307 : 307,
      headers,
    });
  } catch (err) {
    const parsedFailure = engineFailureSchema.safeParse(err);
    if (parsedFailure.success) {
      return engineFailureResponse(parsedFailure.data);
    }
    return createPublicFileInfrastructureFailureResponse({
      requestId,
      operation: "route",
      reasonCode: "unexpected_route_failure",
      status: 500,
      code: "SERVER_ERROR",
      message: "Server error",
      retryable: false,
    });
  }
};

export async function GET(req: NextRequest) {
  return handleFileRequest(req);
}

export async function HEAD(req: NextRequest) {
  return handleFileRequest(req, { isHead: true });
}
