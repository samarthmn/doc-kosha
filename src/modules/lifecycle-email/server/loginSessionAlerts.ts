import { z } from "zod";
import { clientEnv } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { claimEmailDelivery, sendClaimedEmail } from "@/server/emailDeliveries";
import { deliverLoginSession } from "./loginSessionDelivery";

const eventSchema = z.object({
  user_id: z.string().uuid(),
  session_id: z.string().uuid(),
  occurred_at: z.string(),
  eligible: z.boolean(),
  disabled_at: z.string().nullable(),
  device_label: z.string().max(100).nullable(),
  country_code: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
});

/** Shared by the authenticated fast path and the durable lifecycle worker. */
export async function sendLoginSessionAlert(userId: string, sessionId: string) {
  z.string().uuid().parse(userId);
  z.string().uuid().parse(sessionId);
  const admin = createSupabaseServiceClient();
  return deliverLoginSession(userId, sessionId, {
    settingsUrl: `${clientEnv.NEXT_PUBLIC_APP_URL}/settings?tab=notifications`,
    async loadEvent(userId, sessionId) {
      const { data, error } = await admin
        .from("login_session_events")
        .select("*")
        .eq("user_id", userId)
        .eq("session_id", sessionId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = eventSchema.parse(data);
      return {
        userId: row.user_id,
        sessionId: row.session_id,
        occurredAt: row.occurred_at,
        eligible: row.eligible,
        disabledAt: row.disabled_at,
        deviceLabel: row.device_label,
        countryCode: row.country_code,
      };
    },
    async loadRecipient(userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) {
        if (error.status === 404 || error.code === "user_not_found")
          return null;
        throw error;
      }
      if (!data.user?.email) return null;
      const { data: preferences, error: preferenceError } = await admin
        .from("user_notification_prefs")
        .select("security_login_alerts_enabled")
        .eq("user_id", userId)
        .maybeSingle();
      if (preferenceError) throw preferenceError;
      return {
        email: z.string().email().parse(data.user.email),
        enabled: preferences
          ? z.boolean().parse(preferences.security_login_alerts_enabled)
          : true,
      };
    },
    async disable(userId, sessionId) {
      const { error } = await admin
        .from("login_session_events")
        .update({ disabled_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("session_id", sessionId);
      if (error) throw error;
    },
    claim: claimEmailDelivery,
    send: sendClaimedEmail,
  });
}
