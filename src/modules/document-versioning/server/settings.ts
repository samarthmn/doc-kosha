import { PLAN_LIMITS } from "@/modules/billing/plans";
import type { PlanId } from "@/modules/billing/types";
import {
  deletePrunedVersionBlobs,
  getProtectedStorageObjectKeysForDocument,
  rebalanceVersionRows,
  resolveEffectivePreviousVersionLimit,
  throwVersionHistoryUpgradeRequired,
} from "@/modules/document-versioning/server/service";
import {
  cleanupExpiredPrunedMetadata,
  ensureWorkspaceVersionSettings,
  getDocumentById,
  getWorkspacePlanId,
  listAvailableVersionsForDocument,
  listWorkspaceDocumentIds,
  type DocumentVersionRow,
  updateVersionStates,
  updateWorkspaceVersionSettings,
} from "@/modules/document-versioning/server/repository";

export const getRetentionSettings = async (workspaceId: string) => {
  await cleanupExpiredPrunedMetadata({ workspaceId });
  const settings = await ensureWorkspaceVersionSettings(workspaceId);
  const effectiveMaxPreviousVersions = resolveEffectivePreviousVersionLimit(
    await getWorkspacePlanId(workspaceId),
    settings.max_previous_versions,
  );

  return {
    maxPreviousVersions: effectiveMaxPreviousVersions,
    planLocked: effectiveMaxPreviousVersions !== settings.max_previous_versions,
  };
};

export const updateRetentionSettings = async (params: {
  workspaceId: string;
  maxPreviousVersions: number;
  updatedBy: string;
  dryRun: boolean;
  confirmToken?: string;
}) => {
  await cleanupExpiredPrunedMetadata({ workspaceId: params.workspaceId });
  const planId = await getWorkspacePlanId(params.workspaceId);
  const planPreviousVersionLimit = (
    PLAN_LIMITS[(planId ?? "free") as PlanId] ?? PLAN_LIMITS.free
  ).maxPreviousVersions;
  if (typeof planPreviousVersionLimit === "number") {
    throwVersionHistoryUpgradeRequired();
  }

  const current = await ensureWorkspaceVersionSettings(params.workspaceId);
  const isDecrease = params.maxPreviousVersions < current.max_previous_versions;
  const documentIds = await listWorkspaceDocumentIds(params.workspaceId);

  let affectedVersions = 0;
  let affectedBytes = 0;
  const updatesByDocument = new Map<
    string,
    {
      rebalance: ReturnType<typeof rebalanceVersionRows>;
      versions: DocumentVersionRow[];
    }
  >();

  for (const documentId of documentIds) {
    const versions = await listAvailableVersionsForDocument(documentId);
    const rebalance = rebalanceVersionRows({
      versions,
      maxPreviousVersions: params.maxPreviousVersions,
      pruneReason: "limit_decrease",
    });
    if (rebalance.pruned.length > 0) {
      updatesByDocument.set(documentId, {
        rebalance,
        versions,
      });
      affectedVersions += rebalance.pruned.length;
      affectedBytes += rebalance.pruned.reduce(
        (total, version) => total + (version.size_bytes ?? 0),
        0,
      );
    }
  }

  const impactSummary = {
    affectedDocuments: updatesByDocument.size,
    affectedVersions,
    affectedBytes,
  };

  if (params.dryRun) {
    return {
      dryRun: true,
      impactSummary,
      maxPreviousVersions: current.max_previous_versions,
    };
  }

  if (isDecrease && affectedVersions > 0 && params.confirmToken !== "DELETE") {
    const error = new Error("DELETE confirmation token required");
    error.name = "CONFIRMATION_REQUIRED";
    throw error;
  }

  for (const [documentId, payload] of updatesByDocument.entries()) {
    const currentDocument = await getDocumentById(documentId);
    const keptVersionIds = new Set(
      payload.rebalance.toUpdate
        .filter((item) => item.state === "available")
        .map((item) => item.id),
    );

    const protectedStorageObjectKeys = currentDocument
      ? getProtectedStorageObjectKeysForDocument({
          currentDocument,
          versions: payload.versions,
          keptVersionIds,
        })
      : new Set<string>();

    await updateVersionStates(payload.rebalance.toUpdate);
    await deletePrunedVersionBlobs(
      payload.rebalance.pruned,
      protectedStorageObjectKeys,
    );
  }

  const updated = await updateWorkspaceVersionSettings({
    workspaceId: params.workspaceId,
    maxPreviousVersions: params.maxPreviousVersions,
    updatedBy: params.updatedBy,
  });

  return {
    dryRun: false,
    maxPreviousVersions: updated.max_previous_versions,
    impactSummary,
  };
};
