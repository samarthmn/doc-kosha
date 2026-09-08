import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import {
  executeDocumentStorageDeletion,
  parseDocumentDeletionPlan,
} from "@/modules/documents/server/deletion";
import {
  cleanupDocumentArtifactCandidate,
  parseDocumentArtifactCandidate,
  parseDocumentArtifactCandidateRows,
} from "@/server/documentArtifactCandidate";
import {
  deleteMany,
  deleteObject,
  deleteObjectsByPrefix,
} from "@/server/storage";

const UuidArraySchema = z.array(z.string().uuid()).max(500);

const RequestSchema = z
  .object({
    workspaceId: z.string().uuid(),
    dataRoomId: z.string().uuid().nullable(),
    documentIds: UuidArraySchema,
    folderIds: UuidArraySchema,
  })
  .strict()
  .refine(
    ({ documentIds, folderIds }) =>
      documentIds.length + folderIds.length > 0 &&
      documentIds.length + folderIds.length <= 500,
    { message: "Select between 1 and 500 resources" },
  );

const FinalizeDeletionSchema = z
  .object({
    documentIds: z.array(z.string().uuid()),
    folderIds: z.array(z.string().uuid()),
  })
  .strict();

const SuccessResponseSchema = z
  .object({
    ok: z.literal(true),
    deletedDocumentIds: z.array(z.string().uuid()),
    deletedFolderIds: z.array(z.string().uuid()),
    objectsDeleted: z.number().int().nonnegative(),
  })
  .strict();

const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    retryable: z.boolean().optional(),
  })
  .strict();
const RouteResponseSchema = z.union([
  SuccessResponseSchema,
  ErrorResponseSchema,
]);

const jsonResponse = (body: unknown, status: number): NextResponse =>
  NextResponse.json(RouteResponseSchema.parse(body), { status });

export async function POST(req: Request): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  const request = RequestSchema.safeParse(body);
  if (!request.success) {
    return jsonResponse({ error: "Invalid request" }, 400);
  }

  const { workspaceId, dataRoomId, documentIds, folderIds } = request.data;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: canEdit, error: canEditError } = dataRoomId
      ? await supabase.rpc("can_edit_data_room", {
          ws: workspaceId,
          room_id: dataRoomId,
        })
      : await supabase.rpc("can_edit_workspace_documents", {
          ws: workspaceId,
        });

    if (canEditError) {
      console.error("[documents/delete] permission check failed", {
        workspaceId,
        dataRoomId,
        error: canEditError,
      });
      return jsonResponse({ error: "Server error" }, 500);
    }

    if (!canEdit) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const service = createSupabaseServiceClient();
    const scopeArgs = dataRoomId ? { p_data_room_id: dataRoomId } : {};
    const { data: planJson, error: planError } = await service.rpc(
      "plan_document_selection_deletion",
      {
        p_workspace_id: workspaceId,
        p_actor_id: user.id,
        p_document_ids: documentIds,
        p_folder_ids: folderIds,
        ...scopeArgs,
      },
    );

    if (planError) {
      if (planError.code === "P0002") {
        return jsonResponse({ error: "Selection not found" }, 404);
      }
      if (planError.code === "22023") {
        return jsonResponse({ error: "Invalid request" }, 400);
      }
      if (planError.code === "P0003") {
        return jsonResponse({ error: "Deletion already in progress" }, 409);
      }
      console.error("[documents/delete] failed to plan deletion", {
        workspaceId,
        dataRoomId,
        error: planError,
      });
      return jsonResponse({ error: "Server error" }, 500);
    }

    const plan = parseDocumentDeletionPlan(planJson, workspaceId);

    let objectsDeleted: number;
    try {
      objectsDeleted = await executeDocumentStorageDeletion(plan, {
        deleteExact: deleteMany,
        deletePrefix: deleteObjectsByPrefix,
      });
    } catch (error) {
      console.error("[documents/delete] storage deletion failed", {
        workspaceId,
        dataRoomId,
        error,
      });
      return jsonResponse({ error: "Storage deletion failed" }, 502);
    }

    try {
      const { data: candidateRows } = await service
        .from("document_artifact_candidates")
        .select("*")
        .eq("deletion_claim_token", plan.claimToken)
        .eq("phase", "cleanup_required")
        .order("updated_at", { ascending: true })
        .throwOnError();
      const cleanupCandidates = parseDocumentArtifactCandidateRows(
        candidateRows ?? [],
      );

      for (const candidate of cleanupCandidates) {
        const cleaned = await cleanupDocumentArtifactCandidate(candidate, {
          deleteArtifact: deleteObject,
          acknowledgeCleanup: async (candidateToken) => {
            const { data } = await service
              .rpc("acknowledge_document_artifact_cleanup", {
                p_candidate_token: candidateToken,
              })
              .throwOnError();
            return parseDocumentArtifactCandidate(data);
          },
          markCleanupFailed: async ({ candidateToken, message }) => {
            const { data } = await service
              .rpc("mark_document_artifact_cleanup_failed", {
                p_candidate_token: candidateToken,
                p_error: message,
              })
              .throwOnError();
            return parseDocumentArtifactCandidate(data);
          },
        });
        if (!cleaned) {
          return jsonResponse(
            {
              error: "Artifact cleanup failed",
              code: "ARTIFACT_CLEANUP_FAILED",
              retryable: true,
            },
            502,
          );
        }
      }
    } catch (error) {
      console.error("[documents/delete] artifact cleanup failed", {
        workspaceId,
        dataRoomId,
        claimToken: plan.claimToken,
        error,
      });
      return jsonResponse(
        {
          error: "Artifact cleanup failed",
          code: "ARTIFACT_CLEANUP_FAILED",
          retryable: true,
        },
        502,
      );
    }

    const { data: deletedJson, error: deleteError } = await service.rpc(
      "delete_document_selection",
      {
        p_workspace_id: workspaceId,
        p_claim_token: plan.claimToken,
        p_actor_id: user.id,
      },
    );

    if (deleteError) {
      if (deleteError.code === "P0007") {
        return jsonResponse(
          {
            error: "Artifact cleanup still in progress",
            code: "ARTIFACT_CLEANUP_PENDING",
            retryable: true,
          },
          409,
        );
      }
      if (deleteError.code === "P0004") {
        return jsonResponse({ error: "Deletion already in progress" }, 409);
      }
      console.error("[documents/delete] failed to finalize deletion", {
        workspaceId,
        dataRoomId,
        error: deleteError,
      });
      return jsonResponse({ error: "Server error" }, 500);
    }

    const deleted = FinalizeDeletionSchema.parse(deletedJson);
    return jsonResponse(
      {
        ok: true,
        deletedDocumentIds: deleted.documentIds,
        deletedFolderIds: deleted.folderIds,
        objectsDeleted,
      },
      200,
    );
  } catch (error) {
    console.error("[documents/delete] unexpected error", error);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
