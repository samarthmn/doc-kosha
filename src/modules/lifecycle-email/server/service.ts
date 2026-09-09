import { z } from "zod";
import { sendLoginSessionAlert } from "./loginSessionAlerts";
import { dispatchLifecycleJob } from "./dispatch";

import { clientEnv, serverEnv } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { claimEmailDelivery, sendClaimedEmail } from "@/server/emailDeliveries";
import {
  buildFounderHelpEmail,
  buildInactiveOwnerEmail,
  buildPaymentFailedEmail,
  buildPlanDowngradedEmail,
  buildSetupIncompleteReminderEmail,
  buildSubscriptionCancelledEmail,
  buildTrialEndingSoonEmail,
  buildWorkspaceInviteAcceptedEmail,
} from "@/server/emails/templates";
import { getOrCreateNotificationPreferences } from "@/server/notificationPreferences";
import { Json, Tables } from "@/types/generated/supabase";
import {
  LifecycleContextResolver,
  LifecycleEmailJobRecord,
  LifecycleEmailKey,
  LifecycleJobPayload,
  LifecycleWorkspaceContext,
  ProcessLifecycleEmailResult,
} from "./types";
import { shouldSendFounderHelpEmail } from "./founderHelpPolicy";
import { settleLifecycleBackfills } from "./backfillSettling";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const PROCESS_BATCH_LIMIT = 25;
const DEFAULT_INACTIVITY_LIMIT = 100;
const RECENT_NUDGE_HOURS = 72;
const PRODUCTION_TRIAL_ENDING_LEAD_MS = 2 * DAY_MS;
const FOUNDER_HELP_POLICY_VERSION = "eligible-trial-v2";

type LifecycleScheduleConfig = {
  isLocal: boolean;
  setupIncomplete1DelayMs: number;
  setupIncomplete2DelayMs: number;
  founderHelpDelayMs: number;
  trialEndingDeliveryDelayMs: number;
  inactivityThresholdMs: number;
  recentNudgeWindowMs: number;
};

const lifecycleEmailJobSchema = z.object({
  id: z.string().uuid(),
  email_key: z.enum([
    "setup-incomplete-1h",
    "setup-incomplete-2d",
    "founder-help-day-1",
    "trial-ending-2d",
    "inactive-owner-7d",
    "payment-failed",
    "subscription-cancelled",
    "plan-downgraded",
    "workspace-invite-accepted",
    "login-session",
  ]),
  workspace_id: z.string().uuid().nullable(),
  user_id: z.string().uuid().nullable(),
  queue_message_id: z.number().int().nullable(),
  scheduled_for: z.string(),
  dedupe_key: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).catch({}),
  status: z.enum(["queued", "processing", "sent", "skipped", "failed"]),
  attempts: z.number().int(),
  claimed_at: z.string().nullable(),
  processed_at: z.string().nullable(),
  last_error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const founderHelpCandidateSchema = z.object({
  workspace_id: z.string().uuid(),
  owner_user_id: z.string().uuid(),
  trial_started_at: z.string(),
});

const notificationFrom = `DocKosha <${serverEnv.NOTIFICATION_SENDER_EMAIL}>`;
const founderFrom = `Samarth from DocKosha <${serverEnv.FOUNDER_SENDER_EMAIL}>`;

const getLifecycleProcessorSecrets = (): string[] =>
  Array.from(
    new Set(
      [serverEnv.LIFECYCLE_PROCESSOR_SECRET, serverEnv.COOKIE_SECRET].filter(
        (value): value is string => typeof value === "string",
      ),
    ),
  );

const getLifecycleScheduleConfig = (): LifecycleScheduleConfig => {
  const isLocal = clientEnv.NEXT_PUBLIC_APP_ENV === "local";

  if (!isLocal) {
    return {
      isLocal,
      setupIncomplete1DelayMs: HOUR_MS,
      setupIncomplete2DelayMs: 2 * DAY_MS,
      founderHelpDelayMs: DAY_MS,
      trialEndingDeliveryDelayMs: PRODUCTION_TRIAL_ENDING_LEAD_MS,
      inactivityThresholdMs: 7 * DAY_MS,
      recentNudgeWindowMs: RECENT_NUDGE_HOURS * HOUR_MS,
    };
  }

  return {
    isLocal,
    setupIncomplete1DelayMs:
      serverEnv.LIFECYCLE_DELAY_SETUP_INCOMPLETE_1H_MS ?? 30 * SECOND_MS,
    setupIncomplete2DelayMs:
      serverEnv.LIFECYCLE_DELAY_SETUP_INCOMPLETE_2D_MS ?? 90 * SECOND_MS,
    founderHelpDelayMs:
      serverEnv.LIFECYCLE_DELAY_FOUNDER_HELP_DAY_1_MS ?? 60 * SECOND_MS,
    // Local testing treats this as "send after trial start" so trial-ending
    // flows can be exercised quickly without waiting for the real trial horizon.
    trialEndingDeliveryDelayMs:
      serverEnv.LIFECYCLE_DELAY_TRIAL_ENDING_OFFSET_MS ?? 120 * SECOND_MS,
    inactivityThresholdMs:
      serverEnv.LIFECYCLE_INACTIVITY_THRESHOLD_MS ?? 3 * MINUTE_MS,
    recentNudgeWindowMs:
      serverEnv.LIFECYCLE_RECENT_NUDGE_WINDOW_MS ?? 60 * SECOND_MS,
  };
};

const lifecycleSchedule = getLifecycleScheduleConfig();

const planRanks: Record<string, number> = {
  free: 0,
  essential: 1,
  plus: 2,
  max: 3,
};

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const addMilliseconds = (date: Date, ms: number): string =>
  new Date(date.getTime() + ms).toISOString();

const parseDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getDedupeTimestampToken = (value: string | null | undefined): string =>
  parseDate(value)?.toISOString() ?? "none";

const subtractMilliseconds = (date: Date, ms: number): string =>
  new Date(date.getTime() - ms).toISOString();

const getTrialEndingScheduledFor = (args: {
  trialStartedAt: Date;
  trialEndsAt: Date | null;
}): string | null => {
  if (lifecycleSchedule.isLocal) {
    return addMilliseconds(
      args.trialStartedAt,
      lifecycleSchedule.trialEndingDeliveryDelayMs,
    );
  }

  if (!args.trialEndsAt) {
    return null;
  }

  return subtractMilliseconds(
    args.trialEndsAt,
    lifecycleSchedule.trialEndingDeliveryDelayMs,
  );
};

const isPaidStatus = (
  subscription: Tables<"workspace_subscriptions"> | null,
): boolean => subscription?.status === "active";

const isCanceledStatus = (
  subscription: Tables<"workspace_subscriptions"> | null,
): boolean => subscription?.status === "canceled";

const isTrialActive = (
  subscription: Tables<"workspace_subscriptions"> | null,
): boolean => {
  if (subscription?.status !== "trialing") return false;
  const endsAt = parseDate(subscription.trial_ends_at);
  return Boolean(endsAt && endsAt.getTime() > Date.now());
};

const hasActivePaidPlan = (
  subscription: Tables<"workspace_subscriptions"> | null,
): boolean => {
  if (!subscription || !isPaidStatus(subscription)) return false;
  if (subscription.plan_id === "free") return false;
  const trialEndsAt = parseDate(subscription.trial_ends_at);
  return !trialEndsAt || trialEndsAt.getTime() <= Date.now();
};

const hasEnteredPaidBilling = (
  subscription: Tables<"workspace_subscriptions"> | null,
): boolean => {
  if (!subscription?.provider_subscription_id) return false;

  return ["active", "past_due", "canceled", "incomplete"].includes(
    subscription.status ?? "",
  );
};

const RECENT_INACTIVITY_SUPPRESSION_TEMPLATES = [
  "payment-failed",
  "plan-downgraded",
  "subscription-cancelled",
  "trial-ending-2d",
  "setup-incomplete-1h",
  "setup-incomplete-2d",
  "founder-help-day-1",
] as const;

const isSetupComplete = (context: LifecycleWorkspaceContext): boolean => {
  const hasProfile = Boolean(context.profile?.primary_use_case);
  const subscription = context.subscription;
  const hasBillingSetup =
    Boolean(subscription?.trial_started_at) ||
    ["active", "past_due", "canceled"].includes(subscription?.status ?? "");
  return hasProfile && hasBillingSetup;
};

const getSettingsSubscriptionUrl = (): string =>
  `${clientEnv.NEXT_PUBLIC_APP_URL}/settings?tab=subscription`;

const getSettingsMembersUrl = (): string =>
  `${clientEnv.NEXT_PUBLIC_APP_URL}/settings?tab=members`;

const getDashboardUrl = (): string =>
  `${clientEnv.NEXT_PUBLIC_APP_URL}/dashboard`;

const getSetupReminderText = (
  key: "setup-incomplete-1h" | "setup-incomplete-2d",
): string =>
  key === "setup-incomplete-1h"
    ? "You started the workspace flow, but the trial and core setup steps are still unfinished."
    : "Your workspace is still waiting on setup. Finish the trial and core setup steps so you can start sharing documents.";

const getWorkspaceContext: LifecycleContextResolver = async (
  workspaceId: string,
): Promise<LifecycleWorkspaceContext | null> => {
  const admin = createSupabaseServiceClient();
  const { data: workspace, error: workspaceError } = await admin
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .maybeSingle();

  if (workspaceError || !workspace) {
    return null;
  }

  const [preferences, subscriptionResult, profileResult, ownerResult] =
    await Promise.all([
      getOrCreateNotificationPreferences(workspace.created_by),
      admin
        .from("workspace_subscriptions")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("*")
        .eq("id", workspace.created_by)
        .maybeSingle(),
      admin.auth.admin.getUserById(workspace.created_by),
    ]);

  const ownerEmail = ownerResult.data.user?.email
    ? normalizeEmail(ownerResult.data.user.email)
    : null;

  return {
    workspace,
    ownerEmail,
    ownerFullName: profileResult.data?.full_name ?? null,
    onboardingRemindersEnabled: preferences.onboardingRemindersEnabled,
    subscription: subscriptionResult.data ?? null,
    profile: profileResult.data ?? null,
  };
};

const hasRecentLifecycleNudge = async (args: {
  workspaceId: string;
  userId?: string | null;
  templates: string[];
  sinceHours?: number;
}): Promise<boolean> => {
  const admin = createSupabaseServiceClient();
  const cutoff = addMilliseconds(
    new Date(),
    -(args.sinceHours != null
      ? args.sinceHours * HOUR_MS
      : lifecycleSchedule.recentNudgeWindowMs),
  );
  let query = admin
    .from("email_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", args.workspaceId)
    .in("template", args.templates)
    .gte("created_at", cutoff);

  if (args.userId) {
    query = query.eq("user_id", args.userId);
  }

  const { count, error } = await query;
  if (error) return false;
  return (count ?? 0) > 0;
};

const enqueueLifecycleEmailJob = async (args: {
  emailKey: LifecycleEmailKey;
  workspaceId: string;
  userId?: string | null;
  scheduledFor: string;
  dedupeKey: string;
  payload?: Record<string, unknown>;
}): Promise<boolean> => {
  const admin = createSupabaseServiceClient();
  const jobPayload: LifecycleJobPayload = {
    emailKey: args.emailKey,
    workspaceId: args.workspaceId,
    userId: args.userId ?? null,
    scheduledFor: args.scheduledFor,
    dedupeKey: args.dedupeKey,
    payload: args.payload,
  };
  const { data, error } = await admin.rpc("enqueue_lifecycle_email_job", {
    p_email_key: jobPayload.emailKey,
    p_workspace_id: jobPayload.workspaceId,
    p_user_id: jobPayload.userId ?? undefined,
    p_scheduled_for: jobPayload.scheduledFor,
    p_dedupe_key: jobPayload.dedupeKey,
    p_payload: (jobPayload.payload ?? {}) as Json,
  });

  if (error) {
    throw error;
  }
  return Boolean(data);
};

const ensureFounderHelpLifecycleJob = async (args: {
  workspaceId: string;
  userId?: string | null;
  trialStartedAt: string;
  scheduledFor: string;
}): Promise<boolean> => {
  const dedupeKey = `founder-help-day-1:${args.workspaceId}:${getDedupeTimestampToken(args.trialStartedAt)}`;
  const inserted = await enqueueLifecycleEmailJob({
    emailKey: "founder-help-day-1",
    workspaceId: args.workspaceId,
    userId: args.userId,
    scheduledFor: args.scheduledFor,
    dedupeKey,
    payload: {
      trialStartedAt: args.trialStartedAt,
      policyVersion: FOUNDER_HELP_POLICY_VERSION,
    },
  });

  if (inserted) {
    return true;
  }

  const admin = createSupabaseServiceClient();
  const { data, error } = await admin.rpc("requeue_skipped_founder_help_job", {
    p_dedupe_key: dedupeKey,
  });
  if (error) {
    throw error;
  }

  return Boolean(data);
};

const markLifecycleEmailJobStatus = async (
  id: string,
  status: "sent" | "skipped" | "failed",
  reason?: string,
): Promise<void> => {
  const admin = createSupabaseServiceClient();
  const { error } = await admin.rpc("finalize_lifecycle_email_job", {
    p_job_id: id,
    p_status: status,
    p_reason: reason ?? undefined,
  });

  if (error) {
    console.error("[lifecycle-email] failed to update job status", {
      id,
      status,
      error,
    });
  }
};

const claimLifecycleJobs = async (
  limit: number,
): Promise<LifecycleEmailJobRecord[]> => {
  const admin = createSupabaseServiceClient();
  const { data, error } = await admin.rpc("claim_lifecycle_email_jobs", {
    p_limit: limit,
    p_now: new Date().toISOString(),
  });
  if (error) {
    throw error;
  }
  return z.array(lifecycleEmailJobSchema).parse(data ?? []);
};

const sendLifecycleEmail = async (args: {
  template: string;
  dedupeKey: string;
  workspaceId: string;
  userId?: string | null;
  toEmail: string;
  from?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}): Promise<"sent" | "duplicate"> => {
  const claim = await claimEmailDelivery({
    template: args.template,
    toEmail: args.toEmail,
    userId: args.userId ?? null,
    workspaceId: args.workspaceId,
    dedupeKey: args.dedupeKey,
  });

  if (!claim.claimed) {
    if (claim.reason === "in_progress") {
      throw new Error(
        `Lifecycle email delivery is still claimed: ${args.template}`,
      );
    }
    return "duplicate";
  }

  const sent = await sendClaimedEmail({
    id: claim.id,
    claimToken: claim.token,
    toEmail: args.toEmail,
    subject: args.subject,
    html: args.html,
    text: args.text,
    ...(args.from ? { from: args.from } : {}),
    ...(args.replyTo ? { replyTo: args.replyTo } : {}),
  });

  if (!sent) {
    throw new Error(`Failed to send lifecycle email: ${args.template}`);
  }

  return "sent";
};

export const queueSetupIncompleteLifecycleEmails = async (args: {
  workspaceId: string;
  userId: string;
}): Promise<void> => {
  const now = new Date();
  await Promise.all([
    enqueueLifecycleEmailJob({
      emailKey: "setup-incomplete-1h",
      workspaceId: args.workspaceId,
      userId: args.userId,
      scheduledFor: addMilliseconds(
        now,
        lifecycleSchedule.setupIncomplete1DelayMs,
      ),
      dedupeKey: `setup-incomplete-1h:${args.workspaceId}`,
    }),
    enqueueLifecycleEmailJob({
      emailKey: "setup-incomplete-2d",
      workspaceId: args.workspaceId,
      userId: args.userId,
      scheduledFor: addMilliseconds(
        now,
        lifecycleSchedule.setupIncomplete2DelayMs,
      ),
      dedupeKey: `setup-incomplete-2d:${args.workspaceId}`,
    }),
  ]);
};

export const queueTrialLifecycleEmails = async (args: {
  workspaceId: string;
  userId: string;
  trialStartedAt: string;
  trialEndsAt: string | null;
}): Promise<void> => {
  const trialStartedAt = parseDate(args.trialStartedAt) ?? new Date();
  await ensureFounderHelpLifecycleJob({
    workspaceId: args.workspaceId,
    userId: args.userId,
    trialStartedAt: args.trialStartedAt,
    scheduledFor: addMilliseconds(
      trialStartedAt,
      lifecycleSchedule.founderHelpDelayMs,
    ),
  });

  const trialEndsAt = parseDate(args.trialEndsAt);
  const trialEndingScheduledFor = getTrialEndingScheduledFor({
    trialStartedAt,
    trialEndsAt,
  });
  if (!trialEndingScheduledFor) {
    return;
  }

  await enqueueLifecycleEmailJob({
    emailKey: "trial-ending-2d",
    workspaceId: args.workspaceId,
    userId: args.userId,
    scheduledFor: trialEndingScheduledFor,
    dedupeKey: `trial-ending-2d:${args.workspaceId}:${getDedupeTimestampToken(args.trialEndsAt)}`,
    payload: { trialEndsAt: args.trialEndsAt },
  });
};

export const sendSubscriptionCancelledLifecycleEmail = async (args: {
  workspaceId: string;
  subscriptionId: string | null;
  currentPeriodEndsAt: string | null;
}): Promise<void> => {
  const context = await getWorkspaceContext(args.workspaceId);
  if (!context?.ownerEmail) return;

  const email = buildSubscriptionCancelledEmail({
    workspaceName: context.workspace.name,
    cancelEffectiveAt: args.currentPeriodEndsAt ?? new Date().toISOString(),
    settingsUrl: getSettingsSubscriptionUrl(),
  });

  await sendLifecycleEmail({
    template: "subscription-cancelled",
    dedupeKey: `subscription-cancelled:${args.workspaceId}:${args.subscriptionId ?? "none"}:${args.currentPeriodEndsAt ?? "none"}`,
    workspaceId: args.workspaceId,
    userId: context.workspace.created_by,
    toEmail: context.ownerEmail,
    from: notificationFrom,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
};

export const sendPaymentFailedLifecycleEmail = async (args: {
  workspaceId: string;
  invoiceId: string;
}): Promise<void> => {
  const context = await getWorkspaceContext(args.workspaceId);
  if (!context?.ownerEmail || isCanceledStatus(context.subscription)) return;

  const email = buildPaymentFailedEmail({
    workspaceName: context.workspace.name,
    planLabel: context.subscription?.plan_id ?? "DocKosha",
    paymentSettingsUrl: getSettingsSubscriptionUrl(),
    invoiceId: args.invoiceId,
  });

  await sendLifecycleEmail({
    template: "payment-failed",
    dedupeKey: `payment-failed:${args.invoiceId}`,
    workspaceId: args.workspaceId,
    userId: context.workspace.created_by,
    toEmail: context.ownerEmail,
    from: notificationFrom,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
};

export const sendPlanDowngradedLifecycleEmail = async (args: {
  workspaceId: string;
  previousPlanLabel: string;
  nextPlanLabel: string;
  providerSubscriptionId: string | null;
  dedupeSuffix: string;
}): Promise<void> => {
  const context = await getWorkspaceContext(args.workspaceId);
  if (!context?.ownerEmail) return;

  const email = buildPlanDowngradedEmail({
    workspaceName: context.workspace.name,
    oldPlanLabel: args.previousPlanLabel,
    newPlanLabel: args.nextPlanLabel,
    settingsUrl: getSettingsSubscriptionUrl(),
  });

  await sendLifecycleEmail({
    template: "plan-downgraded",
    dedupeKey: `plan-downgraded:${args.workspaceId}:${args.providerSubscriptionId ?? "none"}:${args.dedupeSuffix}`,
    workspaceId: args.workspaceId,
    userId: context.workspace.created_by,
    toEmail: context.ownerEmail,
    from: notificationFrom,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
};

export const sendWorkspaceInviteAcceptedLifecycleEmail = async (args: {
  workspaceId: string;
  inviteId: string;
  acceptedAt: string;
  acceptedByUserId: string;
}): Promise<void> => {
  const admin = createSupabaseServiceClient();
  const context = await getWorkspaceContext(args.workspaceId);
  if (!context?.ownerEmail) return;

  const {
    data: { user },
  } = await admin.auth.admin.getUserById(args.acceptedByUserId);
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", args.acceptedByUserId)
    .maybeSingle();

  const email = buildWorkspaceInviteAcceptedEmail({
    workspaceName: context.workspace.name,
    collaboratorName: profile?.full_name ?? null,
    collaboratorEmail: user?.email ?? null,
    membersUrl: getSettingsMembersUrl(),
  });

  await sendLifecycleEmail({
    template: "workspace-invite-accepted",
    dedupeKey: `workspace-invite-accepted:${args.inviteId}:${args.acceptedAt}`,
    workspaceId: args.workspaceId,
    userId: context.workspace.created_by,
    toEmail: context.ownerEmail,
    from: notificationFrom,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
};

const processSetupIncompleteJob = async (
  job: LifecycleEmailJobRecord,
  context: LifecycleWorkspaceContext,
): Promise<"sent" | "skipped"> => {
  if (!context.ownerEmail) return "skipped";
  if (!context.onboardingRemindersEnabled) return "skipped";
  if (isSetupComplete(context)) return "skipped";
  if (
    hasActivePaidPlan(context.subscription) ||
    hasEnteredPaidBilling(context.subscription)
  ) {
    return "skipped";
  }

  const reminderKey =
    job.email_key === "setup-incomplete-1h"
      ? "setup-incomplete-1h"
      : "setup-incomplete-2d";
  const email = buildSetupIncompleteReminderEmail({
    workspaceName: context.workspace.name,
    dashboardUrl: getDashboardUrl(),
    reminderText: getSetupReminderText(reminderKey),
    subject:
      reminderKey === "setup-incomplete-1h"
        ? "Finish setting up DocKosha"
        : "Your workspace setup is still incomplete",
  });

  const sent = await sendLifecycleEmail({
    template: job.email_key,
    dedupeKey: job.dedupe_key,
    workspaceId: context.workspace.id,
    userId: context.workspace.created_by,
    toEmail: context.ownerEmail,
    from: notificationFrom,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  return sent === "sent" ? "sent" : "skipped";
};

const processFounderHelpJob = async (
  job: LifecycleEmailJobRecord,
  context: LifecycleWorkspaceContext,
): Promise<"sent" | "skipped"> => {
  if (
    !shouldSendFounderHelpEmail({
      hasOwnerEmail: Boolean(context.ownerEmail),
      onboardingRemindersEnabled: context.onboardingRemindersEnabled,
      isTrialActive: isTrialActive(context.subscription),
      hasPaidOrCanceledSubscription:
        hasActivePaidPlan(context.subscription) ||
        isCanceledStatus(context.subscription),
    }) ||
    !context.ownerEmail
  ) {
    return "skipped";
  }

  const email = buildFounderHelpEmail({
    workspaceName: context.workspace.name,
    dashboardUrl: getDashboardUrl(),
  });

  const sent = await sendLifecycleEmail({
    template: job.email_key,
    dedupeKey: job.dedupe_key,
    workspaceId: context.workspace.id,
    userId: context.workspace.created_by,
    toEmail: context.ownerEmail,
    from: founderFrom,
    replyTo: serverEnv.FOUNDER_SENDER_EMAIL,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  return sent === "sent" ? "sent" : "skipped";
};

const processTrialEndingJob = async (
  job: LifecycleEmailJobRecord,
  context: LifecycleWorkspaceContext,
): Promise<"sent" | "skipped"> => {
  if (!context.ownerEmail) return "skipped";
  if (!isTrialActive(context.subscription)) return "skipped";
  if (hasActivePaidPlan(context.subscription)) return "skipped";

  const email = buildTrialEndingSoonEmail({
    workspaceName: context.workspace.name,
    trialEndsAt:
      context.subscription?.trial_ends_at ?? new Date().toISOString(),
    settingsUrl: getSettingsSubscriptionUrl(),
  });

  const sent = await sendLifecycleEmail({
    template: job.email_key,
    dedupeKey: job.dedupe_key,
    workspaceId: context.workspace.id,
    userId: context.workspace.created_by,
    toEmail: context.ownerEmail,
    from: notificationFrom,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  return sent === "sent" ? "sent" : "skipped";
};

const processInactiveOwnerJob = async (
  job: LifecycleEmailJobRecord,
  context: LifecycleWorkspaceContext,
): Promise<"sent" | "skipped"> => {
  if (!context.ownerEmail) return "skipped";
  if (!context.onboardingRemindersEnabled) return "skipped";
  if (isCanceledStatus(context.subscription)) return "skipped";

  const recentNudge = await hasRecentLifecycleNudge({
    workspaceId: context.workspace.id,
    userId: context.workspace.created_by,
    templates: [...RECENT_INACTIVITY_SUPPRESSION_TEMPLATES],
  });
  if (recentNudge) return "skipped";
  const email = buildInactiveOwnerEmail({
    workspaceName: context.workspace.name,
    dashboardUrl: getDashboardUrl(),
    lastSignInAt:
      (job.payload.lastSignInAt as string | null | undefined) ?? null,
  });

  const sent = await sendLifecycleEmail({
    template: job.email_key,
    dedupeKey: job.dedupe_key,
    workspaceId: context.workspace.id,
    userId: context.workspace.created_by,
    toEmail: context.ownerEmail,
    from: notificationFrom,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  return sent === "sent" ? "sent" : "skipped";
};

const processLifecycleJob = (job: LifecycleEmailJobRecord) =>
  dispatchLifecycleJob(job, {
    loginSession: sendLoginSessionAlert,
    workspace: processWorkspaceLifecycleJob,
  });

const processWorkspaceLifecycleJob = async (
  job: LifecycleEmailJobRecord,
): Promise<"sent" | "skipped"> => {
  if (!job.workspace_id) {
    return "skipped";
  }

  const context = await getWorkspaceContext(job.workspace_id);
  if (!context) {
    return "skipped";
  }

  switch (job.email_key) {
    case "setup-incomplete-1h":
    case "setup-incomplete-2d":
      return await processSetupIncompleteJob(job, context);
    case "founder-help-day-1":
      return await processFounderHelpJob(job, context);
    case "trial-ending-2d":
      return await processTrialEndingJob(job, context);
    case "inactive-owner-7d":
      return await processInactiveOwnerJob(job, context);
    default:
      return "skipped";
  }
};

const backfillTrialEndingJobs = async (): Promise<void> => {
  const admin = createSupabaseServiceClient();
  const now = new Date();
  let query = admin
    .from("workspace_subscriptions")
    .select("workspace_id, trial_ends_at, trial_started_at")
    .eq("status", "trialing")
    .limit(DEFAULT_INACTIVITY_LIMIT);

  if (lifecycleSchedule.isLocal) {
    query = query
      .not("trial_started_at", "is", null)
      .lte(
        "trial_started_at",
        subtractMilliseconds(now, lifecycleSchedule.trialEndingDeliveryDelayMs),
      );
  } else {
    query = query
      .not("trial_ends_at", "is", null)
      .lte(
        "trial_ends_at",
        addMilliseconds(now, lifecycleSchedule.trialEndingDeliveryDelayMs),
      )
      .gt("trial_ends_at", now.toISOString());
  }

  const { data, error } = await query;

  if (error || !data) {
    return;
  }

  await Promise.all(
    data
      .filter((row) => row.trial_ends_at && row.trial_started_at)
      .map((row) =>
        enqueueLifecycleEmailJob({
          emailKey: "trial-ending-2d",
          workspaceId: row.workspace_id,
          scheduledFor: now.toISOString(),
          dedupeKey: `trial-ending-2d:${row.workspace_id}:${getDedupeTimestampToken(row.trial_ends_at)}`,
          payload: { trialEndsAt: row.trial_ends_at },
        }),
      ),
  );
};

const backfillFounderHelpJobs = async (): Promise<void> => {
  const admin = createSupabaseServiceClient();
  const now = new Date();
  const { data, error } = await admin.rpc("list_due_founder_help_candidates", {
    p_cutoff: subtractMilliseconds(now, lifecycleSchedule.founderHelpDelayMs),
    p_now: now.toISOString(),
    p_limit: DEFAULT_INACTIVITY_LIMIT,
  });

  if (error || !data) {
    return;
  }

  const candidates = z.array(founderHelpCandidateSchema).safeParse(data);
  if (!candidates.success) {
    console.error("[lifecycle-email] invalid founder backfill candidates", {
      error: candidates.error,
    });
    return;
  }

  await settleLifecycleBackfills({
    tasks: candidates.data.map((candidate) =>
      ensureFounderHelpLifecycleJob({
        workspaceId: candidate.workspace_id,
        userId: candidate.owner_user_id,
        trialStartedAt: candidate.trial_started_at,
        scheduledFor: now.toISOString(),
      }).then(() => undefined),
    ),
    onRejected: (reason) => {
      console.error("[lifecycle-email] founder backfill candidate failed", {
        reason,
      });
    },
  });
};

const backfillSetupReminderJobs = async (): Promise<void> => {
  const admin = createSupabaseServiceClient();
  const cutoff = subtractMilliseconds(
    new Date(),
    lifecycleSchedule.setupIncomplete2DelayMs,
  );
  const { data, error } = await admin
    .from("email_deliveries")
    .select("workspace_id, user_id")
    .eq("template", "welcome-user")
    .lte("created_at", cutoff)
    .limit(DEFAULT_INACTIVITY_LIMIT);

  if (error || !data) {
    return;
  }

  await Promise.all(
    data
      .filter((row) => row.workspace_id)
      .map((row) =>
        enqueueLifecycleEmailJob({
          emailKey: "setup-incomplete-2d",
          workspaceId: row.workspace_id!,
          userId: row.user_id,
          scheduledFor: new Date().toISOString(),
          dedupeKey: `setup-incomplete-2d:${row.workspace_id}`,
        }),
      ),
  );
};

const enqueueInactiveOwnerLifecycleJobs = async (args?: {
  limit?: number;
}): Promise<number> => {
  const admin = createSupabaseServiceClient();
  const cutoff = subtractMilliseconds(
    new Date(),
    lifecycleSchedule.inactivityThresholdMs,
  );
  const { data, error } = await admin.rpc(
    "list_inactive_workspace_owner_candidates",
    {
      p_cutoff: cutoff,
      p_limit: args?.limit ?? DEFAULT_INACTIVITY_LIMIT,
    },
  );

  if (error || !Array.isArray(data)) {
    return 0;
  }

  let enqueued = 0;
  for (const row of data as Array<{
    workspace_id: string;
    owner_user_id: string;
    owner_email: string | null;
    workspace_name: string;
    last_sign_in_at: string | null;
    onboarding_reminders_enabled: boolean;
  }>) {
    if (!row.owner_email || !row.onboarding_reminders_enabled) continue;

    const recentNudge = await hasRecentLifecycleNudge({
      workspaceId: row.workspace_id,
      userId: row.owner_user_id,
      templates: [...RECENT_INACTIVITY_SUPPRESSION_TEMPLATES],
    });
    if (recentNudge) continue;

    const inactivityAnchor = lifecycleSchedule.isLocal
      ? (row.last_sign_in_at ?? "none")
      : (row.last_sign_in_at ?? "").slice(0, 10) || "none";
    const inserted = await enqueueLifecycleEmailJob({
      emailKey: "inactive-owner-7d",
      workspaceId: row.workspace_id,
      userId: row.owner_user_id,
      scheduledFor: new Date().toISOString(),
      dedupeKey: `inactive-owner-7d:${row.workspace_id}:${inactivityAnchor}`,
      payload: {
        lastSignInAt: row.last_sign_in_at,
      },
    });
    if (inserted) {
      enqueued += 1;
    }
  }

  return enqueued;
};

export const processLifecycleEmailJobs = async (args?: {
  limit?: number;
  includeBackfills?: boolean;
  includeInactiveSweep?: boolean;
}): Promise<ProcessLifecycleEmailResult> => {
  if (args?.includeBackfills !== false) {
    await settleLifecycleBackfills({
      tasks: [
        backfillSetupReminderJobs(),
        backfillFounderHelpJobs(),
        backfillTrialEndingJobs(),
      ],
      onRejected: (reason) => {
        console.error("[lifecycle-email] backfill failed", { reason });
      },
    });
  }

  const enqueuedInactive =
    args?.includeInactiveSweep === false
      ? 0
      : await enqueueInactiveOwnerLifecycleJobs();

  const jobs = await claimLifecycleJobs(args?.limit ?? PROCESS_BATCH_LIMIT);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const result = await processLifecycleJob(job);
      if (result === "deferred") {
        const admin = createSupabaseServiceClient();
        const { error } = await admin.rpc("reschedule_lifecycle_email_job", {
          p_job_id: job.id,
          p_scheduled_for: new Date(Date.now() + 60_000).toISOString(),
        });
        if (error) throw error;
      } else if (result === "sent") {
        sent += 1;
        await markLifecycleEmailJobStatus(job.id, "sent");
      } else {
        skipped += 1;
        await markLifecycleEmailJobStatus(job.id, "skipped");
      }
    } catch (error) {
      failed += 1;
      await markLifecycleEmailJobStatus(
        job.id,
        "failed",
        error instanceof Error ? error.message : "Lifecycle job failed",
      );
    }
  }

  return {
    enqueuedInactive,
    processed: jobs.length,
    sent,
    skipped,
    failed,
  };
};

export const isLifecycleProcessorAuthorizationHeader = (
  authorization: string | null,
): boolean =>
  authorization != null &&
  getLifecycleProcessorSecrets().some(
    (secret) => authorization === `Bearer ${secret}`,
  );

export const getPlanRank = (planId: string | null | undefined): number =>
  planRanks[planId ?? ""] ?? 0;

/** Browser requests only accelerate delivery; the durable job remains authoritative. */
export const processLoginSessionFastPath = sendLoginSessionAlert;
