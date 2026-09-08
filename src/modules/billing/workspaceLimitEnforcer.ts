import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { hasEntitlementNow } from "./entitlements";
import { PLAN_LIMITS } from "./plans";
import { mapWorkspaceSubscriptionRow } from "./subscriptionMapper";
import type { PlanId } from "./types";
import type { Tables } from "@/types/generated/supabase";

const FALLBACK_PLAN: PlanId = "free";

const fetchWorkspacePlanId = async (
  admin: ReturnType<typeof createSupabaseServiceClient>,
  workspaceId: string,
): Promise<PlanId> => {
  const { data } = await admin
    .from("workspace_subscriptions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const subscription = mapWorkspaceSubscriptionRow(
    (data as Tables<"workspace_subscriptions"> | null) ?? null,
  );
  const planId = hasEntitlementNow(subscription)
    ? (subscription?.planId ?? FALLBACK_PLAN)
    : FALLBACK_PLAN;
  return planId;
};

export const syncWorkspaceDataRoomLimits = async (
  workspaceId: string,
  explicitPlanId?: PlanId,
): Promise<void> => {
  try {
    const admin = createSupabaseServiceClient();
    const planId =
      explicitPlanId ?? (await fetchWorkspacePlanId(admin, workspaceId));
    const limits = PLAN_LIMITS[planId];
    const maxRooms = limits.maxDataRooms;

    const { data: rooms, error } = await admin
      .from("data_rooms")
      .select("id, created_at, is_disabled")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    if (error || !rooms) {
      if (error) {
        console.error(
          "[billing] failed to load data rooms for limit sync",
          workspaceId,
          error,
        );
      }
      return;
    }

    if (maxRooms === null) {
      const disabledIds = rooms
        .filter((room) => room.is_disabled)
        .map((room) => room.id);
      if (disabledIds.length) {
        await admin
          .from("data_rooms")
          .update({ is_disabled: false })
          .in("id", disabledIds);
      }
      return;
    }

    const limit = Math.max(0, maxRooms);
    const allowedRooms = rooms.slice(0, limit);
    const blockedRooms = rooms.slice(limit);

    const enableIds = allowedRooms
      .filter((room) => room.is_disabled)
      .map((room) => room.id);
    const disableIds = blockedRooms
      .filter((room) => !room.is_disabled)
      .map((room) => room.id);

    if (enableIds.length) {
      await admin
        .from("data_rooms")
        .update({ is_disabled: false })
        .in("id", enableIds);
    }
    if (disableIds.length) {
      await admin
        .from("data_rooms")
        .update({ is_disabled: true })
        .in("id", disableIds);
    }
  } catch (err) {
    console.error(
      "[billing] failed to sync workspace data room limits",
      workspaceId,
      err,
    );
  }
};
