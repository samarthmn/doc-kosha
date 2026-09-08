import "server-only";

import { isSupportedUploadExtension } from "@/lib/constants";
import { isPdfExtension } from "@/lib/fileTypes";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { hasEntitlementNow } from "@/modules/billing/entitlements";
import { PLAN_LIMITS } from "@/modules/billing/plans";
import type {
  PlanId,
  WorkspaceSubscriptionLike,
} from "@/modules/billing/types";
import type { Tables } from "@/types/generated/supabase";
import { mapWorkspaceSubscriptionRow } from "../subscriptionMapper";

const FALLBACK_PLAN_ID: PlanId = "free";

type WorkspacePlanState = {
  planId: PlanId;
  subscription: WorkspaceSubscriptionLike | null;
};

type PlanGuardFailureCode =
  | "UNSUPPORTED_FILE_TYPE"
  | "FREE_PLAN_PDF_ONLY"
  | "STORAGE_LIMIT_EXCEEDED"
  | "MEMBER_LIMIT_EXCEEDED"
  | "VERSION_HISTORY_UPGRADE_REQUIRED"
  | "USAGE_UNAVAILABLE";

type PlanGuardResult =
  | { ok: true }
  | {
      ok: false;
      code: PlanGuardFailureCode;
      message: string;
      status: number;
    };

const getFileExtension = (filename: string): string =>
  (filename.split(".").pop() ?? "").toLowerCase();

const getWorkspacePlanState = async (
  workspaceId: string,
): Promise<WorkspacePlanState> => {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin
    .from("workspace_subscriptions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    console.error("[plan-guards] failed to load workspace subscription", {
      workspaceId,
      error,
    });
  }

  const row = (data as Tables<"workspace_subscriptions"> | null) ?? null;
  const subscription = mapWorkspaceSubscriptionRow(row);
  const planId = hasEntitlementNow(subscription)
    ? (subscription?.planId ?? FALLBACK_PLAN_ID)
    : FALLBACK_PLAN_ID;

  return {
    planId: PLAN_LIMITS[planId] ? planId : FALLBACK_PLAN_ID,
    subscription,
  };
};

const getWorkspaceStorageUsedBytes = async (
  workspaceId: string,
): Promise<number | null> => {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin
    .from("workspace_storage_current")
    .select("storage_used_bytes")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    console.error("[plan-guards] failed to load workspace storage", {
      workspaceId,
      error,
    });
    return null;
  }

  return data?.storage_used_bytes ?? 0;
};

export const assertDocumentUploadAllowed = async (params: {
  workspaceId: string;
  filename: string;
  sizeBytes?: number | null;
  currentDocumentSizeBytes?: number | null;
}): Promise<PlanGuardResult> => {
  const extension = getFileExtension(params.filename);
  if (!isSupportedUploadExtension(extension)) {
    return {
      ok: false,
      code: "UNSUPPORTED_FILE_TYPE",
      message: "Unsupported file type",
      status: 400,
    };
  }

  const { planId } = await getWorkspacePlanState(params.workspaceId);
  const limits = PLAN_LIMITS[planId] ?? PLAN_LIMITS[FALLBACK_PLAN_ID];

  if (
    limits.allowedDocumentExtensions &&
    !limits.allowedDocumentExtensions.includes(extension)
  ) {
    return {
      ok: false,
      code: "FREE_PLAN_PDF_ONLY",
      message:
        "Free workspaces support PDF uploads only. Upgrade to upload and convert other file types.",
      status: 403,
    };
  }

  if (planId === "free" && !isPdfExtension(extension)) {
    return {
      ok: false,
      code: "FREE_PLAN_PDF_ONLY",
      message:
        "Free workspaces support PDF uploads only. Upgrade to upload and convert other file types.",
      status: 403,
    };
  }

  const maxStorageBytes = limits.maxStorageBytes;
  const sizeBytes = params.sizeBytes ?? null;
  if (maxStorageBytes !== null && typeof sizeBytes === "number") {
    const usedBytes = await getWorkspaceStorageUsedBytes(params.workspaceId);
    if (usedBytes === null) {
      return {
        ok: false,
        code: "USAGE_UNAVAILABLE",
        message: "Unable to verify workspace storage usage",
        status: 503,
      };
    }

    const currentSize = params.currentDocumentSizeBytes ?? 0;
    const projectedBytes = Math.max(0, usedBytes - currentSize) + sizeBytes;

    if (projectedBytes > maxStorageBytes) {
      return {
        ok: false,
        code: "STORAGE_LIMIT_EXCEEDED",
        message: "Storage limit reached. Delete files or upgrade your plan.",
        status: 403,
      };
    }
  }

  return { ok: true };
};

export const isFreePlan = async (workspaceId: string): Promise<boolean> => {
  const { planId } = await getWorkspacePlanState(workspaceId);
  return planId === "free";
};

export const assertWorkspaceMemberInviteAllowed = async (
  workspaceId: string,
): Promise<PlanGuardResult> => {
  const { planId } = await getWorkspacePlanState(workspaceId);
  const maxMembers = PLAN_LIMITS[planId]?.maxMembers ?? null;
  if (maxMembers === null) return { ok: true };

  const admin = createSupabaseServiceClient();
  const { count, error } = await admin
    .from("workspace_members")
    .select("user_id", { head: true, count: "exact" })
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("[plan-guards] failed to count workspace members", {
      workspaceId,
      error,
    });
    return {
      ok: false,
      code: "USAGE_UNAVAILABLE",
      message: "Unable to verify workspace member usage",
      status: 503,
    };
  }

  if ((count ?? 0) >= maxMembers) {
    return {
      ok: false,
      code: "MEMBER_LIMIT_EXCEEDED",
      message:
        "Free workspaces include one owner. Upgrade to invite teammates.",
      status: 403,
    };
  }

  return { ok: true };
};
