import { Tables } from "@/types/generated/supabase";

export type LifecycleEmailKey =
  | "login-session"
  | "setup-incomplete-1h"
  | "setup-incomplete-2d"
  | "founder-help-day-1"
  | "trial-ending-2d"
  | "inactive-owner-7d"
  | "payment-failed"
  | "subscription-cancelled"
  | "plan-downgraded"
  | "workspace-invite-accepted";

export type LifecycleEmailJobStatus =
  "queued" | "processing" | "sent" | "skipped" | "failed";

export type LifecycleJobPayload = {
  emailKey: LifecycleEmailKey;
  workspaceId: string;
  userId?: string | null;
  dedupeKey: string;
  scheduledFor: string;
  payload?: Record<string, unknown>;
};

export type LifecycleWorkspaceContext = {
  workspace: Tables<"workspaces">;
  ownerEmail: string | null;
  ownerFullName: string | null;
  onboardingRemindersEnabled: boolean;
  subscription: Tables<"workspace_subscriptions"> | null;
  profile: Tables<"profiles"> | null;
};

export type LifecycleContextResolver = (
  workspaceId: string,
) => Promise<LifecycleWorkspaceContext | null>;

export type LifecycleEmailJobRecord = {
  id: string;
  email_key: LifecycleEmailKey;
  workspace_id: string | null;
  user_id: string | null;
  queue_message_id: number | null;
  scheduled_for: string;
  dedupe_key: string;
  payload: Record<string, unknown>;
  status: LifecycleEmailJobStatus;
  attempts: number;
  claimed_at: string | null;
  processed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type ProcessLifecycleEmailResult = {
  enqueuedInactive: number;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
};
