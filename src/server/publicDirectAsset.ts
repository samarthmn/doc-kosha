import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { processDocumentProcessingJob } from "@/server/documentProcessingQueue";
import { headObject } from "@/server/storage";
import { runWithinOperationDeadline } from "@/server/operationDeadline";
import {
  resolvePublicDirectAssetSelection,
  type PublicDirectAsset,
  type PublicDirectAssetDocument,
} from "@/server/publicDirectAssetSelection";

export const resolvePublicDirectAsset = async (options: {
  client: ReturnType<typeof createSupabaseServiceClient>;
  document: PublicDirectAssetDocument;
  requestedVariant: "original" | "converted";
  allowConverted?: boolean;
  fallbackWorkspaceId?: string | null;
  deadlineAt?: number;
}): Promise<PublicDirectAsset | null> => {
  const runWithinDeadline = async <T>(run: () => Promise<T>): Promise<T> => {
    if (options.deadlineAt === undefined) return run();
    return runWithinOperationDeadline(
      { deadlineAt: options.deadlineAt },
      {
        operation: "conversion",
        run: async () => run(),
      },
    );
  };

  return resolvePublicDirectAssetSelection({
    document: options.document,
    requestedVariant: options.requestedVariant,
    allowConverted: options.allowConverted,
    checkConverted: async (logicalBucket, path) => {
      const result = await runWithinDeadline(async () =>
        headObject({ logicalBucket, path }),
      );
      if (result.ok) return "available";
      if (result.status === 404) return "missing";

      console.warn("[Public direct asset] Converted HEAD failed", {
        documentId: options.document.id,
        status: result.status,
        message: result.message,
      });
      return "unavailable";
    },
    repairMissingConverted: async (document) => {
      const workspaceId =
        document.workspace_id ?? options.fallbackWorkspaceId ?? null;
      if (!workspaceId) return null;

      try {
        await runWithinDeadline(async () =>
          processDocumentProcessingJob(
            { documentId: document.id, workspaceId },
            { force: true, deadlineAt: options.deadlineAt },
          ),
        );
      } catch (error) {
        console.error("[Public direct asset] Converted repair failed", {
          documentId: document.id,
          workspaceId,
          error,
        });
      }

      const { data, error } = await runWithinDeadline(async () =>
        options.client
          .from("documents")
          .select(
            "id, storage_path, converted_storage_path, conversion_status, workspace_id, data_room_id, file_type, size_bytes",
          )
          .eq("id", document.id)
          .eq("workspace_id", workspaceId)
          .maybeSingle(),
      );

      if (error) {
        console.error("[Public direct asset] Document re-read failed", {
          documentId: document.id,
          workspaceId,
          error,
        });
        return null;
      }

      return data;
    },
  });
};
