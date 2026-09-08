import { useMemo } from "react";
import { PLAN_CATALOG, PLAN_LIMITS } from "@/modules/billing/plans";
import { PlanId } from "@/modules/billing/types";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { useWorkspaceUsage } from "./useWorkspaceUsage";

export const usePlanLimits = (workspaceId: string | null | undefined) => {
  const subscription = useGlobalStore((s) => s.currentWorkspaceSubscription);
  const planId: PlanId = subscription?.planId ?? "free";
  const planDefinition = PLAN_CATALOG[planId];
  const limits = PLAN_LIMITS[planId];

  const {
    usage,
    isLoading: isUsageLoading,
    refetch: refetchUsage,
  } = useWorkspaceUsage(workspaceId ?? null);

  const dataRoomsUsed = usage?.dataRoomsCount ?? 0;
  const storageUsedBytes = usage?.storageUsedBytes ?? 0;
  const bandwidthUsedBytes = usage?.bandwidthUsedBytes ?? 0;

  const maxDataRooms = limits.maxDataRooms;
  const maxStorageBytes = limits.maxStorageBytes;
  const maxBandwidthBytes = limits.maxBandwidthBytes;

  const isDataRoomLimitReached =
    maxDataRooms !== null && dataRoomsUsed >= maxDataRooms;
  const isDataRoomLimitExceeded =
    maxDataRooms !== null && dataRoomsUsed > maxDataRooms;

  const isStorageLimitReached =
    maxStorageBytes !== null && storageUsedBytes >= maxStorageBytes;
  const isStorageLimitExceeded =
    maxStorageBytes !== null && storageUsedBytes > maxStorageBytes;

  const isBandwidthLimitReached =
    maxBandwidthBytes !== null && bandwidthUsedBytes >= maxBandwidthBytes;
  const isBandwidthLimitExceeded =
    maxBandwidthBytes !== null && bandwidthUsedBytes > maxBandwidthBytes;

  const storageRemainingBytes = useMemo(() => {
    if (maxStorageBytes === null) return null;
    return Math.max(0, maxStorageBytes - storageUsedBytes);
  }, [maxStorageBytes, storageUsedBytes]);

  return {
    planId,
    plan: planDefinition,
    limits,
    usage,
    storageUsedBytes,
    bandwidthUsedBytes,
    storageRemainingBytes,
    isUsageLoading,
    refetchUsage,
    isDataRoomLimitReached,
    isDataRoomLimitExceeded,
    isStorageLimitReached,
    isStorageLimitExceeded,
    isBandwidthLimitReached,
    isBandwidthLimitExceeded,
  };
};
