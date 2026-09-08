import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";

type NotificationPreferences = {
  onboardingRemindersEnabled: boolean;
  securityLoginAlertsEnabled: boolean;
  securityWorkspaceEmailsEnabled: boolean;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  onboardingRemindersEnabled: true,
  securityLoginAlertsEnabled: true,
  securityWorkspaceEmailsEnabled: true,
};

export const getOrCreateNotificationPreferences = async (
  userId: string,
): Promise<NotificationPreferences> => {
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("user_notification_prefs")
    .upsert(
      {
        user_id: userId,
        updated_at: now,
      },
      { onConflict: "user_id" },
    )
    .select(
      "onboarding_reminders_enabled, security_login_alerts_enabled, security_workspace_emails_enabled",
    )
    .maybeSingle();

  if (error) {
    console.error("[notification-prefs] failed to load prefs", {
      userId,
      error,
    });
    return DEFAULT_PREFERENCES;
  }

  if (!data) {
    return DEFAULT_PREFERENCES;
  }

  return {
    onboardingRemindersEnabled:
      data.onboarding_reminders_enabled ??
      DEFAULT_PREFERENCES.onboardingRemindersEnabled,
    securityLoginAlertsEnabled:
      data.security_login_alerts_enabled ??
      DEFAULT_PREFERENCES.securityLoginAlertsEnabled,
    securityWorkspaceEmailsEnabled:
      data.security_workspace_emails_enabled ??
      DEFAULT_PREFERENCES.securityWorkspaceEmailsEnabled,
  };
};
