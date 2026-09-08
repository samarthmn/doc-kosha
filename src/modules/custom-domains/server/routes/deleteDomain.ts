import { NextResponse } from "next/server";
import type { CustomDomainRequestDeps } from "../../types";
import { z } from "zod";
import { mapWorkspaceSubscriptionRow } from "@/modules/billing/subscriptionMapper";
import { canUseCustomDomain } from "../../entitlements";
import type { Tables } from "@/types/generated/supabase";
import {
  deleteCustomHostnameByHostname,
  getCloudflareCustomHostnameConfiguration,
} from "../cloudflareCustomHostnames";

const deleteParamsSchema = z.object({
  domainId: z.string().uuid(),
});

const deleteBodySchema = z.object({
  workspaceId: z.string().uuid(),
});

type RouteContext = {
  params: Promise<{ domainId: string }>;
};

export async function handleDeleteDomainRequest(
  request: Request,
  context: RouteContext,
  deps: CustomDomainRequestDeps,
): Promise<Response> {
  try {
    const params = await context.params;
    const parsedParams = deleteParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid domain ID" }, { status: 400 });
    }
    const { domainId } = parsedParams.data;

    const body = await request.json().catch(() => ({}));
    const parsedBody = deleteBodySchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }
    const { workspaceId } = parsedBody.data;

    const supabase = await deps.createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Owner-only: custom domains are workspace-level settings
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("created_by")
      .eq("id", workspaceId)
      .maybeSingle();
    if (workspaceError) {
      return NextResponse.json(
        { error: "Failed to load workspace" },
        { status: 500 },
      );
    }
    if (!workspace || workspace.created_by !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify subscription (optional for delete, but good to check)
    const { data: subscriptionRow } = await supabase
      .from("workspace_subscriptions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const subscription = mapWorkspaceSubscriptionRow(
      subscriptionRow as Tables<"workspace_subscriptions"> | null,
    );
    if (!canUseCustomDomain(subscription)) {
      return NextResponse.json(
        { error: "Custom domains require an active subscription." },
        { status: 403 },
      );
    }

    const cloudflareConfiguration = getCloudflareCustomHostnameConfiguration();
    if (!cloudflareConfiguration.ok) {
      return NextResponse.json(
        {
          error: cloudflareConfiguration.error,
          code: cloudflareConfiguration.code,
        },
        { status: cloudflareConfiguration.status },
      );
    }

    // Get the domain record
    const { data: domainRow, error: fetchErr } = await supabase
      .from("custom_domains")
      .select("*")
      .eq("id", domainId)
      .eq("workspace_id", workspaceId)
      .single();
    if (fetchErr || !domainRow) {
      if (fetchErr) {
        console.error("[domains/delete] domain lookup failed:", fetchErr);
      }
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    // Step 1: Remove from Cloudflare. Missing provider configuration was
    // rejected above so a database-only delete cannot orphan the hostname.
    const removeResult = await deleteCustomHostnameByHostname(domainRow.domain);
    if (!removeResult.ok) {
      // Log but continue - domain might not exist on Cloudflare
      if (removeResult.isAuthError || removeResult.isPermissionError) {
        console.warn("[domains/delete] Cloudflare auth/permission error", {
          status: removeResult.status,
          code: removeResult.code,
        });
      }
      console.warn(
        "[domains/delete] Cloudflare remove failed:",
        removeResult.error,
      );
    }

    // Step 2: Clear active_custom_domain_id if it points to this domain
    await supabase
      .from("workspaces")
      .update({ active_custom_domain_id: null })
      .eq("id", workspaceId)
      .eq("active_custom_domain_id", domainId);

    // Step 3: Delete from database
    const { error: deleteErr } = await supabase
      .from("custom_domains")
      .delete()
      .eq("id", domainId)
      .eq("workspace_id", workspaceId);

    if (deleteErr) {
      console.error("[domains/delete] delete failed:", deleteErr);
      return NextResponse.json(
        { error: "Failed to delete domain" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Domain deletion error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
