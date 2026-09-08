import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { getBandwidthCycleWindow } from "@/modules/billing/bandwidthCycle";
import { hasEntitlementNow } from "@/modules/billing/entitlements";
import { PLAN_LIMITS } from "@/modules/billing/plans";
import { mapWorkspaceSubscriptionRow } from "@/modules/billing/subscriptionMapper";
import type { PlanId } from "@/modules/billing/types";
import type { Tables } from "@/types/generated/supabase";

type TrackBandwidthOptions = {
  r2ClassAOps?: number;
  r2ClassBOps?: number;
};

export const trackWorkspaceBandwidth = async (
  workspaceId: string | null | undefined,
  bytesServed: number,
  downloadsCount = 0,
  options?: TrackBandwidthOptions,
): Promise<void> => {
  if (!workspaceId) {
    return;
  }
  const r2ClassAOps = options?.r2ClassAOps ?? 0;
  const r2ClassBOps = options?.r2ClassBOps ?? 0;

  // Allow tracking if we have bytes, downloads, or ops
  const hasDataToTrack =
    bytesServed > 0 || downloadsCount > 0 || r2ClassAOps > 0 || r2ClassBOps > 0;
  if (!hasDataToTrack) {
    return;
  }

  try {
    const supabase = createSupabaseServiceClient();
    await supabase.rpc("record_workspace_bandwidth", {
      p_workspace_id: workspaceId,
      p_bytes: bytesServed,
      p_downloads: downloadsCount,
      p_r2_class_a_ops: r2ClassAOps,
      p_r2_class_b_ops: r2ClassBOps,
    });
  } catch (error) {
    console.error("[workspace-usage] failed to record bandwidth", error);
  }
};

const FALLBACK_PLAN: PlanId = "free";

const getWorkspaceBandwidthStatus = async (
  workspaceId: string | null | undefined,
): Promise<{
  usedBytes: number;
  limitBytes: number | null;
  isLimitReached: boolean;
} | null> => {
  if (!workspaceId) return null;
  try {
    const supabase = createSupabaseServiceClient();
    const { data: subscriptionRow, error: subscriptionError } = await supabase
      .from("workspace_subscriptions")
      .select("plan_id, status, trial_started_at, current_period_started_at")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (subscriptionError) {
      console.error(
        "[workspace-usage] failed to load subscription for bandwidth",
        subscriptionError,
      );
      return null;
    }

    const subscription = mapWorkspaceSubscriptionRow(
      (subscriptionRow as Tables<"workspace_subscriptions"> | null) ?? null,
    );
    const planId = hasEntitlementNow(subscription)
      ? (subscription?.planId ?? FALLBACK_PLAN)
      : FALLBACK_PLAN;
    const limitBytes = (PLAN_LIMITS[planId] ?? PLAN_LIMITS[FALLBACK_PLAN])
      .maxBandwidthBytes;
    if (limitBytes === null) {
      return { usedBytes: 0, limitBytes, isLimitReached: false };
    }

    const { start: periodStart } = getBandwidthCycleWindow({
      status: subscriptionRow?.status ?? null,
      trialStartedAt: subscriptionRow?.trial_started_at ?? null,
      currentPeriodStartedAt:
        subscriptionRow?.current_period_started_at ?? null,
    });
    const periodStartIso = periodStart.toISOString().slice(0, 10);

    const { data: bandwidthRows, error: bandwidthError } = await supabase
      .from("workspace_bandwidth_daily")
      .select("bytes_served")
      .eq("workspace_id", workspaceId)
      .gte("day", periodStartIso);
    if (bandwidthError) {
      console.error(
        "[workspace-usage] failed to load bandwidth usage",
        bandwidthError,
      );
      return null;
    }

    const usedBytes = (bandwidthRows || []).reduce(
      (acc: number, row: { bytes_served?: number | null }) =>
        acc + (row.bytes_served ?? 0),
      0,
    );

    return {
      usedBytes,
      limitBytes,
      isLimitReached: usedBytes >= limitBytes,
    };
  } catch (error) {
    console.error("[workspace-usage] bandwidth status error", error);
    return null;
  }
};

type WorkspaceBandwidthBlockReason =
  "limit_reached" | "projected_limit_exceeded" | "usage_unavailable" | null;

type WorkspaceBandwidthEvaluation = {
  shouldBlock: boolean;
  reason: WorkspaceBandwidthBlockReason;
  usedBytes: number | null;
  limitBytes: number | null;
  projectedAdditionalBytes: number;
  projectedUsedBytes: number | null;
};

export const evaluateWorkspaceBandwidthLimit = async (
  workspaceId: string | null | undefined,
  projectedAdditionalBytes = 0,
): Promise<WorkspaceBandwidthEvaluation> => {
  if (!workspaceId) {
    return {
      shouldBlock: false,
      reason: null,
      usedBytes: null,
      limitBytes: null,
      projectedAdditionalBytes: 0,
      projectedUsedBytes: null,
    };
  }

  const normalizedProjectedBytes =
    Number.isFinite(projectedAdditionalBytes) && projectedAdditionalBytes > 0
      ? Math.floor(projectedAdditionalBytes)
      : 0;

  const bandwidthStatus = await getWorkspaceBandwidthStatus(workspaceId);
  if (!bandwidthStatus) {
    return {
      shouldBlock: true,
      reason: "usage_unavailable",
      usedBytes: null,
      limitBytes: null,
      projectedAdditionalBytes: normalizedProjectedBytes,
      projectedUsedBytes: null,
    };
  }

  const { usedBytes, limitBytes } = bandwidthStatus;
  if (limitBytes === null) {
    return {
      shouldBlock: false,
      reason: null,
      usedBytes,
      limitBytes,
      projectedAdditionalBytes: normalizedProjectedBytes,
      projectedUsedBytes: usedBytes + normalizedProjectedBytes,
    };
  }

  const projectedUsedBytes = usedBytes + normalizedProjectedBytes;
  const isLimitReached = usedBytes >= limitBytes;
  const isProjectedLimitExceeded =
    normalizedProjectedBytes > 0 && projectedUsedBytes > limitBytes;
  const shouldBlock = isLimitReached || isProjectedLimitExceeded;

  return {
    shouldBlock,
    reason: shouldBlock
      ? isLimitReached
        ? "limit_reached"
        : "projected_limit_exceeded"
      : null,
    usedBytes,
    limitBytes,
    projectedAdditionalBytes: normalizedProjectedBytes,
    projectedUsedBytes,
  };
};
