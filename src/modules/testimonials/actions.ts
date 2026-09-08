"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { sendAppEmail } from "@/server/emailHelper";
import { buildTestimonialSubmittedEmail } from "@/server/emails/templates";
import type { TablesInsert } from "@/types/generated/supabase";

import {
  type TestimonialFieldErrors,
  type TestimonialActionValues,
  testimonialActionSchema,
} from "./schema";
import { getTestimonialPageData } from "./server";

export type SubmitTestimonialResult =
  | {
      status: "success";
      message: string;
      submittedAt: string;
      headshotStoragePath: string | null;
    }
  | {
      status: "error";
      message: string;
      fieldErrors?: TestimonialFieldErrors;
      alreadySubmitted?: boolean;
      submittedAt?: string;
      headshotStoragePath?: string | null;
    };

const validationErrorMessage = "Please review the highlighted fields.";

const flattenFieldErrors = (
  values: Partial<Record<string, string[] | undefined>>,
): TestimonialFieldErrors => {
  const fieldErrors: TestimonialFieldErrors = {};

  if (values.name?.[0]) {
    fieldErrors.name = values.name[0];
  }
  if (values.roleTitle?.[0]) {
    fieldErrors.roleTitle = values.roleTitle[0];
  }
  if (values.company?.[0]) {
    fieldErrors.company = values.company[0];
  }
  if (values.testimonial?.[0]) {
    fieldErrors.testimonial = values.testimonial[0];
  }

  return fieldErrors;
};

export const submitTestimonialAction = async (
  values: TestimonialActionValues,
): Promise<SubmitTestimonialResult> => {
  const parsed = testimonialActionSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      message: validationErrorMessage,
      fieldErrors: flattenFieldErrors(parsed.error.flatten().fieldErrors),
    };
  }

  const pageData = await getTestimonialPageData();

  if (!pageData.user) {
    return {
      status: "error",
      message: "Please sign in again to submit your testimonial.",
    };
  }

  if (!pageData.workspace) {
    return {
      status: "error",
      message: "No active workspace was found for this account.",
    };
  }

  if (pageData.existingSubmission) {
    return {
      status: "error",
      message: "You have already submitted a testimonial for this workspace.",
      alreadySubmitted: true,
      submittedAt: pageData.existingSubmission.created_at,
      headshotStoragePath: pageData.existingSubmission.headshot_storage_path,
    };
  }

  const normalizedHeadshotPath =
    parsed.data.headshotStoragePath?.trim() || null;
  if (
    normalizedHeadshotPath &&
    !normalizedHeadshotPath.startsWith(
      `workspaces/${pageData.workspace.id}/testimonials/${pageData.user.id}/`,
    )
  ) {
    return {
      status: "error",
      message: "Invalid headshot upload path.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const payload: TablesInsert<"testimonials"> = {
    workspace_id: pageData.workspace.id,
    user_id: pageData.user.id,
    name: parsed.data.name,
    role_title: parsed.data.roleTitle,
    company: parsed.data.company,
    testimonial: parsed.data.testimonial,
    headshot_storage_path: normalizedHeadshotPath,
    consent_public_featured: true,
  };

  const { data, error } = await supabase
    .from("testimonials")
    .insert(payload)
    .select("created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        status: "error",
        message: "You have already submitted a testimonial for this workspace.",
        alreadySubmitted: true,
        headshotStoragePath: null,
      };
    }

    console.error("[testimonials] insert failed", {
      error,
      workspaceId: pageData.workspace.id,
      userId: pageData.user.id,
    });

    return {
      status: "error",
      message:
        "We could not save your testimonial right now. Please try again.",
    };
  }

  try {
    const email = buildTestimonialSubmittedEmail({
      workspaceName: pageData.workspace.name,
      userEmail: pageData.user.email,
      name: parsed.data.name,
      roleTitle: parsed.data.roleTitle,
      company: parsed.data.company,
      testimonial: parsed.data.testimonial,
      headshotUploaded: Boolean(normalizedHeadshotPath),
    });

    await sendAppEmail({
      to: "samarth@dockosha.com",
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  } catch (notificationError) {
    console.error("[testimonials] notification email failed", {
      error: notificationError,
      workspaceId: pageData.workspace.id,
      userId: pageData.user.id,
    });
  }

  revalidatePath("/testimonial");

  return {
    status: "success",
    message: "Thanks. Your testimonial has been saved.",
    submittedAt: data.created_at,
    headshotStoragePath: normalizedHeadshotPath,
  };
};
