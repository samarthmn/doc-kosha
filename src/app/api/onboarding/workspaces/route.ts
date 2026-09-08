import { NextResponse } from "next/server";
import { z } from "zod";
import { clientEnv } from "@/lib/env";
import { queueSetupIncompleteLifecycleEmails } from "@/modules/lifecycle-email/server";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { claimEmailDelivery, sendClaimedEmail } from "@/server/emailDeliveries";
import { buildWelcomeUserEmail } from "@/server/emails/templates";

const lettersOnly = /^[A-Za-z ]+$/;

const requestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Workspace name must be at least 3 letters")
    .regex(
      lettersOnly,
      "Workspace name can include letters (A-Z) and spaces only.",
    ),
  userId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(payload);

    if (!parsed.success) {
      const errorMessage = parsed.error.issues[0]?.message ?? "Invalid payload";
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const { name, userId } = parsed.data;
    const normalizedName = name.trim();
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (userId && userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: existingMemberships, error: membershipError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1);

    if (membershipError) {
      console.error(
        "[onboarding-workspace] membership lookup failed",
        membershipError,
      );
      return NextResponse.json(
        {
          error:
            "We couldn’t verify your existing workspaces. Please try again in a moment.",
        },
        { status: 500 },
      );
    }

    if (existingMemberships && existingMemberships.length > 0) {
      return NextResponse.json(
        { error: "You already have a workspace. Please refresh and continue." },
        { status: 409 },
      );
    }

    const { data, error } = await supabase
      .from("workspaces")
      .insert({
        name: normalizedName,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (error) {
      console.error("[onboarding-workspace] workspace insert failed", error);
      if (error.code === "23505") {
        return NextResponse.json(
          {
            error:
              "This workspace name is already taken. Please choose a different name.",
            code: error.code,
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error:
            "We couldn’t create your workspace. Please try again or pick a different name.",
        },
        { status: 500 },
      );
    }

    if (user.email) {
      try {
        const claim = await claimEmailDelivery({
          template: "welcome-user",
          toEmail: user.email,
          userId: user.id,
          workspaceId: data.id,
          dedupeKey: `welcome-user:${user.id}`,
        });

        if (claim.claimed) {
          const email = buildWelcomeUserEmail({
            fullName: null,
            dashboardUrl: `${clientEnv.NEXT_PUBLIC_APP_URL}/dashboard`,
          });

          await sendClaimedEmail({
            id: claim.id,
            claimToken: claim.token,
            toEmail: user.email,
            subject: email.subject,
            html: email.html,
            text: email.text,
          });
        }

        await queueSetupIncompleteLifecycleEmails({
          workspaceId: data.id,
          userId: user.id,
        });
      } catch (sendError) {
        console.error(
          "[onboarding-workspace] failed to send welcome email",
          sendError,
        );
      }
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[onboarding-workspace] unexpected error", err);
    return NextResponse.json(
      {
        error:
          "Something went wrong while creating your workspace. Please try again.",
      },
      { status: 500 },
    );
  }
}
