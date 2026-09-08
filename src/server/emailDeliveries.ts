import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { sendAppEmail } from "@/server/emailHelper";
import { Options } from "nodemailer/lib/mailer";
import { z } from "zod";

type ClaimEmailDeliveryArgs = {
  template: string;
  toEmail: string;
  dedupeKey?: string | null;
  userId?: string | null;
  workspaceId?: string | null;
};

type ClaimedEmailDelivery =
  | { claimed: true; id: string; token: string }
  | {
      claimed: false;
      id: null;
      reason: "sent" | "in_progress";
    };

const emailDeliveryClaimResultSchema = z
  .array(
    z.object({
      delivery_id: z.string().uuid().nullable(),
      claim_token: z.string().uuid().nullable(),
      claim_status: z.enum(["claimed", "sent", "in_progress"]),
    }),
  )
  .length(1);

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

export const claimEmailDelivery = async (
  args: ClaimEmailDeliveryArgs,
): Promise<ClaimedEmailDelivery> => {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("claim_email_delivery", {
    p_template: args.template,
    p_to_email: normalizeEmail(args.toEmail),
    p_dedupe_key: args.dedupeKey ?? undefined,
    p_user_id: args.userId ?? undefined,
    p_workspace_id: args.workspaceId ?? undefined,
  });
  if (error) {
    throw error;
  }

  const [claim] = emailDeliveryClaimResultSchema.parse(data);
  if (
    claim.claim_status === "claimed" &&
    claim.delivery_id &&
    claim.claim_token
  ) {
    return {
      claimed: true,
      id: claim.delivery_id,
      token: claim.claim_token,
    };
  }

  return {
    claimed: false,
    id: null,
    reason: claim.claim_status === "sent" ? "sent" : "in_progress",
  };
};

const markEmailDeliverySent = async (
  id: string,
  token: string,
): Promise<boolean> => {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("mark_email_delivery_sent", {
    p_delivery_id: id,
    p_claim_token: token,
  });
  if (error) {
    console.error("[email-deliveries] failed to mark sent", { id, error });
    return false;
  }
  return data;
};

const markEmailDeliveryFailed = async (
  id: string,
  token: string,
  reason: string,
): Promise<boolean> => {
  const supabase = createSupabaseServiceClient();
  const message = reason.slice(0, 500);
  const { data, error } = await supabase.rpc("mark_email_delivery_failed", {
    p_delivery_id: id,
    p_claim_token: token,
    p_error: message,
  });
  if (error) {
    console.error("[email-deliveries] failed to mark failed", { id, error });
    return false;
  }
  return data;
};

type SendClaimedEmailArgs = {
  id: string;
  claimToken: string;
  toEmail: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  replyTo?: string;
  attachments?: Options["attachments"];
};

export const sendClaimedEmail = async (
  args: SendClaimedEmailArgs,
): Promise<boolean> => {
  try {
    await sendAppEmail({
      to: normalizeEmail(args.toEmail),
      subject: args.subject,
      html: args.html,
      text: args.text,
      ...(args.from ? { from: args.from } : {}),
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
      ...(args.attachments ? { attachments: args.attachments } : {}),
    });
    const markedSent = await markEmailDeliverySent(args.id, args.claimToken);
    if (!markedSent) {
      console.warn("[email-deliveries] stale claim could not mark sent", {
        id: args.id,
      });
    }
    return markedSent;
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Failed to send email";
    await markEmailDeliveryFailed(args.id, args.claimToken, reason);
    console.error("[email-deliveries] send failed", {
      id: args.id,
      error,
    });
    return false;
  }
};
