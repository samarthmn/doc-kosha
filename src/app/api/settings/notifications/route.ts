import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { getOrCreateNotificationPreferences } from "@/server/notificationPreferences";

const UpdateSchema = z
  .object({
    securityLoginAlertsEnabled: z.boolean().optional(),
    securityWorkspaceEmailsEnabled: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.securityLoginAlertsEnabled === undefined &&
      value.securityWorkspaceEmailsEnabled === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field must be provided.",
      });
    }
  });

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const preferences = await getOrCreateNotificationPreferences(user.id);
    return NextResponse.json({ preferences });
  } catch (error) {
    console.error("[settings.notifications][GET] unexpected error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = {
      user_id: user.id,
      updated_at: new Date().toISOString(),
      ...(parsed.data.securityLoginAlertsEnabled !== undefined
        ? {
            security_login_alerts_enabled:
              parsed.data.securityLoginAlertsEnabled,
          }
        : {}),
      ...(parsed.data.securityWorkspaceEmailsEnabled !== undefined
        ? {
            security_workspace_emails_enabled:
              parsed.data.securityWorkspaceEmailsEnabled,
          }
        : {}),
    };

    const { data, error } = await supabase
      .from("user_notification_prefs")
      .upsert(payload, { onConflict: "user_id" })
      .select(
        "security_login_alerts_enabled, security_workspace_emails_enabled",
      )
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { error: "Failed to update notification settings" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      preferences: {
        securityLoginAlertsEnabled: data.security_login_alerts_enabled,
        securityWorkspaceEmailsEnabled: data.security_workspace_emails_enabled,
      },
    });
  } catch (error) {
    console.error("[settings.notifications][PATCH] unexpected error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
