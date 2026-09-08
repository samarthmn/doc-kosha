import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import {
  STORAGE_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  BRANDING_ASSETS_BUCKET_NAME,
  CONVERTED_STORAGE_BUCKET_NAME,
  DATA_ROOM_CONVERTED_BUCKET_NAME,
} from "@/lib/constants";
import {
  deleteObject,
  deleteMany,
  deleteObjectsByPrefix,
  type LogicalBucket,
} from "@/server/storage";
import { conversionAttemptsPrefixOfPath } from "@/server/documentProcessingCoordination";
import { trackWorkspaceBandwidth } from "@/server/workspaceUsage";
import { validatePathBelongsToWorkspace } from "@/server/storage/storagePaths";

const LogicalBucketSchema = z.enum([
  STORAGE_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  BRANDING_ASSETS_BUCKET_NAME,
  CONVERTED_STORAGE_BUCKET_NAME,
  DATA_ROOM_CONVERTED_BUCKET_NAME,
]);

const SingleDeleteSchema = z.object({
  workspaceId: z.string().uuid(),
  logicalBucket: LogicalBucketSchema,
  path: z.string().min(1),
});

const BatchDeleteSchema = z.object({
  workspaceId: z.string().uuid(),
  items: z.array(
    z.object({
      logicalBucket: LogicalBucketSchema,
      path: z.string().min(1),
    }),
  ),
});

const RequestSchema = z.union([SingleDeleteSchema, BatchDeleteSchema]);

const isBatchRequest = (
  data: z.infer<typeof RequestSchema>,
): data is z.infer<typeof BatchDeleteSchema> => {
  return "items" in data;
};

const isTestimonialPathForUser = (path: string, userId: string): boolean =>
  path.includes(`/testimonials/${userId}/`);

type ConversionAttemptPrefix = {
  logicalBucket: LogicalBucket;
  pathPrefix: string;
};

/**
 * Superseded conversion attempts are referenced only by the
 * `conversion-attempts/{documentId}/` prefix convention (delayed GC), so a
 * delete of a document's converted asset must also purge that prefix or the
 * orphaned outputs outlive the document.
 */
const conversionAttemptPrefixOf = (
  logicalBucket: string,
  normalizedPath: string,
  workspaceId: string,
): ConversionAttemptPrefix | null => {
  if (
    logicalBucket !== CONVERTED_STORAGE_BUCKET_NAME &&
    logicalBucket !== DATA_ROOM_CONVERTED_BUCKET_NAME
  ) {
    return null;
  }

  const pathPrefix = conversionAttemptsPrefixOfPath(
    workspaceId,
    normalizedPath,
  );
  return pathPrefix ? { logicalBucket, pathPrefix } : null;
};

const purgeConversionAttemptPrefixes = async (
  prefixes: Iterable<ConversionAttemptPrefix>,
): Promise<void> => {
  for (const { logicalBucket, pathPrefix } of prefixes) {
    const purge = await deleteObjectsByPrefix({ logicalBucket, pathPrefix });
    if (!purge.ok) {
      console.warn("[Storage Delete] Conversion-attempt cleanup failed", {
        logicalBucket,
        pathPrefix,
        message: purge.message,
      });
    }
  }
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const data = parsed.data;
    const workspaceId = data.workspaceId;

    // Authenticate user
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pathsToAuthorize = isBatchRequest(data)
      ? data.items.map((i) => i.path)
      : [data.path];

    const requiresBranding = isBatchRequest(data)
      ? data.items.some(
          (item) => item.logicalBucket === BRANDING_ASSETS_BUCKET_NAME,
        )
      : data.logicalBucket === BRANDING_ASSETS_BUCKET_NAME;

    const roomIds = Array.from(
      new Set(
        pathsToAuthorize.flatMap((p) => {
          const parts = p.split("/");
          const idx = parts.indexOf("data-rooms");
          const roomId = idx >= 0 ? (parts[idx + 1] ?? null) : null;
          return roomId ? [roomId] : [];
        }),
      ),
    );

    if (requiresBranding) {
      const testimonialOnlyPaths = pathsToAuthorize.every((path) =>
        isTestimonialPathForUser(path, user.id),
      );

      if (testimonialOnlyPaths) {
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

        const isOwner = workspaceResult.data?.created_by === user.id;
        const isMember = Boolean(membershipResult.data);

        if (
          workspaceResult.error ||
          !workspaceResult.data ||
          (!isOwner && !isMember)
        ) {
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
    } else if (roomIds.length > 0) {
      for (const roomId of roomIds) {
        const { data: canEdit, error: canEditError } = await supabase.rpc(
          "can_edit_data_room",
          { ws: workspaceId, room_id: roomId },
        );
        if (canEditError || !canEdit) {
          return NextResponse.json(
            { error: "Forbidden: Insufficient permissions" },
            { status: 403 },
          );
        }
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

    if (isBatchRequest(data)) {
      // Batch delete
      const validated = data.items.map((item) => {
        const validation = validatePathBelongsToWorkspace(
          item.path,
          workspaceId,
        );
        return { item, validation };
      });

      const validItems = validated.flatMap(({ item, validation }) =>
        validation.ok ? [{ ...item, path: validation.normalizedPath }] : [],
      );

      const rejectedItems = validated.flatMap(({ item, validation }) =>
        validation.ok
          ? []
          : [
              {
                logicalBucket: item.logicalBucket,
                path: item.path,
                reason: validation.reason,
              },
            ],
      );

      if (validItems.length === 0) {
        return NextResponse.json({
          ok: true,
          deleted: 0,
          skipped: rejectedItems.length,
          rejected: rejectedItems,
        });
      }

      const result = await deleteMany({
        keys: validItems.map((item) => ({
          logicalBucket: item.logicalBucket as LogicalBucket,
          path: item.path,
        })),
      });

      if (!result.ok) {
        console.error("[Storage Delete] Batch delete failed:", result.message);
        return NextResponse.json(
          { error: "Failed to delete files. Please try again." },
          { status: result.status },
        );
      }

      const attemptPrefixes = new Map<string, ConversionAttemptPrefix>();
      for (const item of validItems) {
        const attemptPrefix = conversionAttemptPrefixOf(
          item.logicalBucket,
          item.path,
          workspaceId,
        );
        if (attemptPrefix) {
          attemptPrefixes.set(attemptPrefix.pathPrefix, attemptPrefix);
        }
      }
      await purgeConversionAttemptPrefixes(attemptPrefixes.values());

      // Track R2 Class A ops (best-effort, async) - 1 per delete request
      void trackWorkspaceBandwidth(workspaceId, 0, 0, { r2ClassAOps: 1 });

      return NextResponse.json({
        ok: true,
        deleted: result.deletedCount ?? validItems.length,
        skipped: rejectedItems.length,
        rejected: rejectedItems,
      });
    } else {
      // Single delete
      const validation = validatePathBelongsToWorkspace(data.path, workspaceId);
      if (!validation.ok) {
        if (validation.reason === "invalid_path") {
          return NextResponse.json(
            { error: "Invalid path format" },
            { status: 400 },
          );
        }
        return NextResponse.json(
          { error: "Path does not belong to workspace" },
          { status: 403 },
        );
      }

      const result = await deleteObject({
        logicalBucket: data.logicalBucket as LogicalBucket,
        path: validation.normalizedPath,
      });

      if (!result.ok) {
        console.error("[Storage Delete] Delete failed:", result.message);
        return NextResponse.json(
          { error: "Failed to delete file. Please try again." },
          { status: result.status },
        );
      }

      const attemptPrefix = conversionAttemptPrefixOf(
        data.logicalBucket,
        validation.normalizedPath,
        workspaceId,
      );
      if (attemptPrefix) {
        await purgeConversionAttemptPrefixes([attemptPrefix]);
      }

      // Track R2 Class A op (best-effort, async)
      void trackWorkspaceBandwidth(workspaceId, 0, 0, { r2ClassAOps: 1 });

      return NextResponse.json({ ok: true, deleted: result.deletedCount ?? 1 });
    }
  } catch (err) {
    console.error("[Storage Delete] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
