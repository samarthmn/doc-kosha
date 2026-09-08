import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { verifyVerifiedEmailCookie } from "@/server/cookieHelper";
import { sendAppEmail } from "@/server/emailHelper";
import {
  buildNdaSignedOwnerEmail,
  buildNdaSignedViewerEmail,
} from "@/server/emails/templates";
import {
  getEmailCookieKey,
  type PublicResourceType,
} from "@/server/cookieConstants";
import { z } from "zod";
import { TrackerResourceType } from "@/lib/analytics/publicTracker";
import { hasWorkspaceEntitlement } from "@/server/workspaceEntitlement";
import { STORAGE_BUCKET_NAME } from "@/lib/constants";
import { deleteObject, putBuffer } from "@/server/storage";
import { fetchLinkAllowlistStatus } from "@/server/linkAllowlist";
import {
  fetchLinkAlcViewerSeeds,
  isAlcSeedEmpty,
  isLinkAlcActive,
} from "@/server/linkAlc";
import { finalizeNdaSignature } from "@/modules/nda/server/finalizeSignature";
import { ensurePendingNdaSignatureRecord } from "@/modules/nda/server/signatureRecord";
import { resolveEffectivePublicLanguage } from "@/modules/public-links/server/settings";
import {
  parseDocumentArtifactCandidate,
  parseDocumentArtifactCandidateRows,
} from "@/server/documentArtifactCandidate";
import {
  MAX_NDA_SIGNATURE_DATA_URL_LENGTH,
  parseNdaSignatureImageDataUrl,
} from "@/modules/nda/server/signaturePayload";

const SignRequestSchema = z
  .object({
    linkId: z.string().uuid(),
    documentId: z.string().uuid().optional(),
    dataRoomId: z.string().uuid().optional(),
    fullName: z.string().min(1).max(255),
    signature: z
      .string()
      .min(1, "Invalid signature")
      .max(MAX_NDA_SIGNATURE_DATA_URL_LENGTH, "Invalid signature"),
  })
  .refine(
    (value) =>
      (value.documentId && !value.dataRoomId) ||
      (!value.documentId && value.dataRoomId),
    {
      message: "Provide exactly one resource identifier",
      path: ["documentId"],
    },
  );

const buildNdaPdfPath = (params: {
  workspaceId: string;
  resourceId: string;
  email: string;
  candidateToken: string;
}): string => {
  const sanitizedEmail = params.email.replace(/[^a-zA-Z0-9]/g, "_");
  const pdfFileName = `nda_${params.resourceId}_${sanitizedEmail}_${params.candidateToken}.pdf`;
  return `workspaces/${params.workspaceId}/ndas/${pdfFileName}`;
};

const listOwnerEmails = async (args: {
  supabase: ReturnType<typeof createSupabaseServiceClient>;
  workspaceId: string;
  signerEmail: string;
}): Promise<string[]> => {
  const { supabase, workspaceId, signerEmail } = args;
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("created_by")
    .eq("id", workspaceId)
    .maybeSingle();

  if (!workspace?.created_by) {
    return [];
  }

  const ownerIds = [workspace.created_by];

  const ownerEmailResults = await Promise.all(
    ownerIds.map(async (ownerId) => {
      try {
        const { data, error: ownerUserError } =
          await supabase.auth.admin.getUserById(ownerId);
        if (ownerUserError) {
          throw ownerUserError;
        }
        return data.user?.email ?? null;
      } catch (ownerErr) {
        console.error(`[NDA Sign] Failed to fetch owner ${ownerId}:`, ownerErr);
        return null;
      }
    }),
  );

  return [
    ...new Set(
      ownerEmailResults.filter(
        (addr): addr is string => Boolean(addr) && addr !== signerEmail,
      ),
    ),
  ];
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = SignRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const { linkId, documentId, dataRoomId, fullName, signature } = parsed.data;
    const resourceType: PublicResourceType = documentId
      ? TrackerResourceType.Document
      : TrackerResourceType.DataRoom;
    const resourceId = documentId ?? (dataRoomId as string);
    const resourceColumn = documentId ? "document_id" : "data_room_id";

    try {
      parseNdaSignatureImageDataUrl(signature);
    } catch {
      return NextResponse.json(
        { error: "Invalid signature payload" },
        { status: 400 },
      );
    }

    const cookieName = getEmailCookieKey(resourceType, resourceId, linkId);
    const cookieValue = req.cookies.get(cookieName)?.value;
    if (!cookieValue) {
      return NextResponse.json(
        { error: "Email verification required" },
        { status: 401 },
      );
    }

    const payload = verifyVerifiedEmailCookie(cookieValue, {
      resourceType,
      resourceId,
      linkId,
    });
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired verification" },
        { status: 401 },
      );
    }

    const { email } = payload;
    const supabase = createSupabaseServiceClient();

    // Get link and resource details
    const { data: link } = await supabase
      .from("links")
      .select(
        "workspace_id, nda_template_snapshot_html, public_language_override",
      )
      .eq("id", linkId)
      .eq(resourceColumn, resourceId)
      .maybeSingle();
    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }
    const locale = await resolveEffectivePublicLanguage({
      workspaceId: link.workspace_id,
      linkPublicLanguageOverride: link.public_language_override,
    });

    const hasEntitlement = await hasWorkspaceEntitlement(link.workspace_id);
    if (!hasEntitlement) {
      return NextResponse.json(
        { error: "Link not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const ndaTemplateSnapshotHtml = link.nda_template_snapshot_html?.trim();
    if (!ndaTemplateSnapshotHtml) {
      return NextResponse.json(
        { error: "NDA template is required" },
        { status: 400 },
      );
    }

    const alcActive =
      resourceType === "data_room"
        ? await isLinkAlcActive(supabase, linkId)
        : false;

    if (alcActive) {
      const allowlistStatus = await fetchLinkAllowlistStatus(
        supabase,
        linkId,
        email,
      );
      if (allowlistStatus.isActive && allowlistStatus.emailBlocked === true) {
        return NextResponse.json(
          { error: "Email not allowed", code: "EMAIL_NOT_ALLOWED" },
          { status: 403 },
        );
      }

      const seeds = await fetchLinkAlcViewerSeeds(supabase, {
        linkId,
        workspaceId: link.workspace_id,
        viewerEmail: allowlistStatus.normalizedEmail ?? email,
      }).catch((error) => {
        console.error("[NDA Sign] Failed to evaluate ALC", {
          linkId,
          workspaceId: link.workspace_id,
          error,
        });
        return null;
      });

      if (!seeds || isAlcSeedEmpty(seeds)) {
        return NextResponse.json(
          { error: "Access denied", code: "ALC_NOT_ALLOWED" },
          { status: 403 },
        );
      }
    }

    const context =
      resourceType === "document"
        ? await supabase
            .from("documents")
            .select("title, workspace_id")
            .eq("id", resourceId)
            .maybeSingle()
        : await supabase
            .from("data_rooms")
            .select("name, workspace_id, is_disabled")
            .eq("id", resourceId)
            .maybeSingle();

    if (!context.data) {
      return NextResponse.json(
        {
          error:
            resourceType === "document"
              ? "Document not found"
              : "Data room not found",
        },
        { status: 404 },
      );
    }
    const resourceWorkspaceId = (
      context.data as { workspace_id?: string | null }
    ).workspace_id;
    if (!resourceWorkspaceId) {
      return NextResponse.json(
        { error: "Resource has no workspace", code: "INVALID_STATE" },
        { status: 500 },
      );
    }
    if (resourceWorkspaceId !== link.workspace_id) {
      return NextResponse.json(
        { error: "Resource mismatch", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (
      resourceType === "data_room" &&
      (context.data as { is_disabled?: boolean }).is_disabled
    ) {
      return NextResponse.json(
        { error: "Data room disabled", code: "ROOM_DISABLED" },
        { status: 410 },
      );
    }

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", link.workspace_id)
      .maybeSingle();
    const workspaceName = workspace?.name || "The Workspace";

    // Check if already signed (and signed PDF is ready)
    const { data: existing } = await supabase
      .from("nda_signatures")
      .select("id, signed_pdf_path")
      .eq("link_id", linkId)
      .eq("email", email)
      .maybeSingle();
    if (existing?.signed_pdf_path) {
      return NextResponse.json({
        success: true,
        message: "Already signed",
      });
    }

    const resourceTitle =
      resourceType === "document"
        ? ((context.data as { title?: string | null }).title ?? "Document")
        : ((context.data as { name?: string | null }).name ?? "Data room");
    const contextLabel = resourceType === "document" ? "document" : "data room";
    const signedAt = new Date();
    const signedAtIso = signedAt.toISOString();

    let ensuredSignature;
    try {
      ensuredSignature = await ensurePendingNdaSignatureRecord(
        {
          updateExisting: async (input) => {
            const { data, error } = await supabase
              .from("nda_signatures")
              .update({
                workspace_id: input.workspaceId,
                document_id: input.documentId ?? null,
                data_room_id: input.dataRoomId ?? null,
                link_id: input.linkId,
                full_name: input.fullName,
                signed_at: input.signedAtIso,
              })
              .eq("id", input.existingSignatureId)
              .is("signed_pdf_path", null)
              .select("id, signed_at, signed_pdf_path")
              .maybeSingle();

            if (error) {
              console.error("[NDA Sign] Update signature error:", error);
              return null;
            }

            if (data) return data;

            const { data: finalized, error: finalizedError } = await supabase
              .from("nda_signatures")
              .select("id, signed_at, signed_pdf_path")
              .eq("id", input.existingSignatureId)
              .maybeSingle();
            if (finalizedError || !finalized?.signed_pdf_path) {
              console.error(
                "[NDA Sign] Signature changed during refresh:",
                finalizedError,
              );
              return null;
            }

            return finalized;
          },
          insertNew: async (input) => {
            const { data, error } = await supabase
              .from("nda_signatures")
              .insert({
                workspace_id: input.workspaceId,
                document_id: input.documentId ?? null,
                data_room_id: input.dataRoomId ?? null,
                link_id: input.linkId,
                full_name: input.fullName,
                email: input.email,
                signed_at: input.signedAtIso,
                signed_pdf_path: null,
              })
              .select("id, signed_at, signed_pdf_path")
              .single();

            if (error || !data) {
              console.error("[NDA Sign] Insert signature error:", error);
              return null;
            }

            return data;
          },
        },
        {
          existingSignatureId: existing?.id ?? null,
          workspaceId: link.workspace_id,
          documentId: documentId ?? null,
          dataRoomId: dataRoomId ?? null,
          linkId,
          fullName,
          email,
          signedAtIso,
        },
      );
    } catch (error) {
      console.error("[NDA Sign] Upsert error:", error);
      return NextResponse.json(
        { error: "Failed to record signature" },
        { status: 500 },
      );
    }

    if (ensuredSignature.alreadyPublished) {
      return NextResponse.json({
        success: true,
        message: "Already signed",
      });
    }

    const pathToken = randomUUID();
    const candidateToken = documentId ? pathToken : null;
    const candidatePath = documentId
      ? buildNdaPdfPath({
          workspaceId: link.workspace_id,
          resourceId,
          email,
          candidateToken: pathToken,
        })
      : null;

    const finalizeResult = await finalizeNdaSignature(
      {
        uploadPdf: async ({
          workspaceId,
          resourceId,
          email,
          pdfBytes,
          path,
        }) => {
          const pdfPath =
            path ??
            buildNdaPdfPath({
              workspaceId,
              resourceId,
              email,
              candidateToken: randomUUID(),
            });
          const uploadResult = await putBuffer({
            logicalBucket: STORAGE_BUCKET_NAME,
            path: pdfPath,
            body: Buffer.from(pdfBytes),
            contentType: "application/pdf",
          });
          if (!uploadResult.ok) {
            console.error(
              "[NDA Sign] PDF upload failed:",
              uploadResult.message,
            );
          }
          return { path: pdfPath, uploadResult };
        },
        listOutstandingArtifactCandidates: async ({ signatureId }) => {
          const { data } = await supabase
            .from("document_artifact_candidates")
            .select("*")
            .eq("nda_signature_id", signatureId)
            .in("phase", ["registered", "uploading", "cleanup_required"])
            .order("updated_at", { ascending: true })
            .throwOnError();
          return parseDocumentArtifactCandidateRows(data ?? []);
        },
        registerArtifactCandidate: async ({
          candidateToken: token,
          producerToken,
          workspaceId,
          documentId: candidateDocumentId,
          signatureId,
          path,
        }) => {
          const { data } = await supabase
            .rpc("register_document_artifact_candidate", {
              p_candidate_token: token,
              p_workspace_id: workspaceId,
              p_document_id: candidateDocumentId,
              p_artifact_kind: "nda",
              p_producer_token: producerToken,
              p_logical_bucket: STORAGE_BUCKET_NAME,
              p_storage_path: path,
              p_nda_signature_id: signatureId,
            })
            .throwOnError();
          return parseDocumentArtifactCandidate(data);
        },
        beginArtifactUpload: async (token) => {
          const { data } = await supabase
            .rpc("begin_document_artifact_upload", {
              p_candidate_token: token,
            })
            .throwOnError();
          return parseDocumentArtifactCandidate(data);
        },
        finishArtifactUpload: async (token) => {
          const { data } = await supabase
            .rpc("finish_document_artifact_upload", {
              p_candidate_token: token,
            })
            .throwOnError();
          return parseDocumentArtifactCandidate(data);
        },
        readArtifactCandidate: async (token) => {
          const { data } = await supabase
            .rpc("get_document_artifact_candidate", {
              p_candidate_token: token,
            })
            .throwOnError();
          return data == null ? null : parseDocumentArtifactCandidate(data);
        },
        publishNdaCandidate: async (token) => {
          const { data } = await supabase
            .rpc("publish_document_nda_candidate", {
              p_candidate_token: token,
            })
            .throwOnError();
          return parseDocumentArtifactCandidate(data);
        },
        deleteArtifactCandidate: deleteObject,
        acknowledgeArtifactCleanup: async (token) => {
          const { data } = await supabase
            .rpc("acknowledge_document_artifact_cleanup", {
              p_candidate_token: token,
            })
            .throwOnError();
          return parseDocumentArtifactCandidate(data);
        },
        markArtifactCleanupFailed: async ({
          candidateToken: token,
          message,
        }) => {
          const { data } = await supabase
            .rpc("mark_document_artifact_cleanup_failed", {
              p_candidate_token: token,
              p_error: message,
            })
            .throwOnError();
          return parseDocumentArtifactCandidate(data);
        },
        updateSignedPdfPath: async ({ signatureId, pdfPath }) => {
          const { error } = await supabase
            .from("nda_signatures")
            .update({ signed_pdf_path: pdfPath })
            .eq("id", signatureId);

          if (error) {
            console.error(
              "[NDA Sign] Failed to update signature record:",
              error,
            );
            throw new Error("Failed to store signed NDA");
          }
        },
        sendViewerEmail: async ({
          to,
          pdfBytes,
          resourceTitle,
          contextLabel,
          workspaceName,
          locale,
        }) => {
          const viewerEmail = buildNdaSignedViewerEmail({
            resourceTitle,
            contextLabel,
            workspaceName,
            locale,
          });
          await sendAppEmail({
            to,
            subject: viewerEmail.subject,
            html: viewerEmail.html,
            text: viewerEmail.text,
            attachments: [
              {
                filename: "NDA.pdf",
                content: Buffer.from(pdfBytes),
                contentType: "application/pdf",
              },
            ],
          });
        },
        getOwnerEmails: ({ workspaceId, signerEmail }) =>
          listOwnerEmails({ supabase, workspaceId, signerEmail }),
        sendOwnerEmail: async ({
          to,
          pdfBytes,
          resourceTitle,
          contextLabel,
          workspaceName,
          signerName,
          signerEmail,
        }) => {
          const ownerTemplate = buildNdaSignedOwnerEmail({
            resourceTitle,
            contextLabel,
            workspaceName,
            signerName,
            signerEmail,
          });
          await sendAppEmail({
            to,
            subject: ownerTemplate.subject,
            html: ownerTemplate.html,
            text: ownerTemplate.text,
            attachments: [
              {
                filename: "NDA.pdf",
                content: Buffer.from(pdfBytes),
                contentType: "application/pdf",
              },
            ],
          });
        },
      },
      {
        signatureId: ensuredSignature.id,
        workspaceId: link.workspace_id,
        documentId: documentId ?? null,
        resourceId,
        resourceTitle,
        contextLabel,
        workspaceName,
        fullName,
        email,
        signatureDataUrl: signature,
        templateHtml: ndaTemplateSnapshotHtml,
        signedAt: ensuredSignature.signedAt,
        locale,
        candidateToken,
        candidatePath,
      },
    );

    if (!finalizeResult.ok) {
      const status =
        finalizeResult.code === "DELETION_IN_PROGRESS" ||
        finalizeResult.code === "UPLOAD_IN_PROGRESS"
          ? 409
          : finalizeResult.code === "UPLOAD_FAILED" ||
              finalizeResult.code === "CLEANUP_FAILED"
            ? 502
            : 500;
      return NextResponse.json(
        {
          error: finalizeResult.error || "Failed to finalize NDA",
          code: finalizeResult.code,
          retryable: finalizeResult.retryable,
        },
        { status },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[NDA Sign API] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
