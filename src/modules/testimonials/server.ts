import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import type { Tables } from "@/types/generated/supabase";

type TestimonialSubmissionRow = Pick<
  Tables<"testimonials">,
  "id" | "created_at" | "headshot_storage_path"
>;

type TestimonialPageData = {
  user: {
    id: string;
    email: string | null;
  } | null;
  workspace: {
    id: string;
    name: string;
  } | null;
  existingSubmission: TestimonialSubmissionRow | null;
  initialValues: {
    name: string;
    roleTitle: string;
    company: string;
    testimonial: string;
  };
};

export const getTestimonialPageData =
  async (): Promise<TestimonialPageData> => {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      throw new Error(
        `Failed to load authenticated user: ${userError.message}`,
      );
    }

    if (!user) {
      return {
        user: null,
        workspace: null,
        existingSubmission: null,
        initialValues: {
          name: "",
          roleTitle: "",
          company: "",
          testimonial: "",
        },
      };
    }

    const { data: membership, error: membershipError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .order("workspace_id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      throw new Error(
        `Failed to load workspace membership: ${membershipError.message}`,
      );
    }

    const workspaceId = membership?.workspace_id ?? null;

    if (!workspaceId) {
      return {
        user: {
          id: user.id,
          email: user.email ?? null,
        },
        workspace: null,
        existingSubmission: null,
        initialValues: {
          name: "",
          roleTitle: "",
          company: "",
          testimonial: "",
        },
      };
    }

    const [workspaceResult, profileResult, brandingResult, testimonialResult] =
      await Promise.all([
        supabase
          .from("workspaces")
          .select("id, name")
          .eq("id", workspaceId)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("full_name, job_title, company")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("branding")
          .select("company_name")
          .eq("workspace_id", workspaceId)
          .maybeSingle(),
        supabase
          .from("testimonials")
          .select("id, created_at, headshot_storage_path")
          .eq("workspace_id", workspaceId)
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

    if (workspaceResult.error) {
      throw new Error(
        `Failed to load workspace details: ${workspaceResult.error.message}`,
      );
    }

    if (profileResult.error) {
      throw new Error(
        `Failed to load profile defaults: ${profileResult.error.message}`,
      );
    }

    if (brandingResult.error) {
      throw new Error(
        `Failed to load branding defaults: ${brandingResult.error.message}`,
      );
    }

    if (testimonialResult.error) {
      throw new Error(
        `Failed to load testimonial submission state: ${testimonialResult.error.message}`,
      );
    }

    return {
      user: {
        id: user.id,
        email: user.email ?? null,
      },
      workspace: workspaceResult.data
        ? {
            id: workspaceResult.data.id,
            name: workspaceResult.data.name,
          }
        : null,
      existingSubmission: testimonialResult.data,
      initialValues: {
        name: profileResult.data?.full_name?.trim() ?? "",
        roleTitle: profileResult.data?.job_title?.trim() ?? "",
        company:
          brandingResult.data?.company_name?.trim() ??
          profileResult.data?.company?.trim() ??
          "",
        testimonial: "",
      },
    };
  };
