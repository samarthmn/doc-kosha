import { NextResponse } from "next/server";
import type { CustomDomainRequestDeps } from "../../types";
import { createDomainInputSchema } from "@/lib/validators/customDomain";
import { mapWorkspaceSubscriptionRow } from "@/modules/billing/subscriptionMapper";
import { canUseCustomDomain } from "../../entitlements";
import type { Tables } from "@/types/generated/supabase";
import {
  createCustomHostname,
  deleteCustomHostnameByHostname,
  getCnameTarget,
  getCustomHostnameByHostnameWithRetry,
  getOwnershipVerificationTxt,
  getCloudflareCustomHostnameConfiguration,
} from "../cloudflareCustomHostnames";

export async function handleCreateDomainRequest(
  request: Request,
  deps: CustomDomainRequestDeps,
): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = createDomainInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { workspaceId, domain } = parsed.data;

    const supabase = await deps.createSupabaseServerClient();
    // Ensure user is signed in
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
      console.error("Workspace lookup failed:", workspaceError);
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 },
      );
    }
    if (!workspace || workspace.created_by !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: subscriptionRow, error: subscriptionError } = await supabase
      .from("workspace_subscriptions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (subscriptionError) {
      console.error("[domains] subscription lookup failed", subscriptionError);
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 },
      );
    }
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

    // Remove any existing domains for this workspace (replace flow - only one domain per workspace)
    const { data: existingDomains } = await supabase
      .from("custom_domains")
      .select("id, domain")
      .eq("workspace_id", workspaceId);

    if (existingDomains && existingDomains.length > 0) {
      // Clear active_custom_domain_id first
      await supabase
        .from("workspaces")
        .update({ active_custom_domain_id: null })
        .eq("id", workspaceId);

      // Remove each existing domain from Cloudflare and database
      for (const existing of existingDomains) {
        await deleteCustomHostnameByHostname(existing.domain);
        await supabase
          .from("custom_domains")
          .delete()
          .eq("id", existing.id)
          .eq("workspace_id", workspaceId);
      }
    }

    // Create the provider hostname before persisting the database record.
    const cnameTarget = getCnameTarget();
    const cfResult = await createCustomHostname(domain, {
      customMetadata: { workspace_id: workspaceId },
    });

    if (!cfResult.ok) {
      if (cfResult.isAuthError) {
        console.error(
          "[domains] Cloudflare auth failed when creating custom hostname",
          { status: cfResult.status, code: cfResult.code },
        );
        return NextResponse.json(
          {
            error:
              "Unable to configure custom domain. Please contact support or try again later.",
            code: "CF_AUTH",
          },
          { status: 503 },
        );
      }
      if (cfResult.isPermissionError) {
        console.error(
          "[domains] Cloudflare permission denied when creating custom hostname",
          { status: cfResult.status, code: cfResult.code },
        );
        return NextResponse.json(
          {
            error:
              "Unable to configure custom domain. Please contact support or try again later.",
            code: "CF_FORBIDDEN",
          },
          { status: 503 },
        );
      }

      // Check for domain already in use error
      if (cfResult.code === "1406") {
        return NextResponse.json(
          {
            error: "This domain is already registered with another account.",
          },
          { status: 409 },
        );
      }
      console.error(
        "[domains] Cloudflare createCustomHostname failed:",
        cfResult.error,
      );
      return NextResponse.json(
        { error: "Failed to create custom hostname on Cloudflare" },
        { status: 500 },
      );
    }

    // Use the provider-issued ownership TXT value. If it is not immediately
    // available, retry fetching the created hostname details before failing.
    let ownershipTxt = getOwnershipVerificationTxt(cfResult.data);
    if (!ownershipTxt) {
      const retryLookup = await getCustomHostnameByHostnameWithRetry(domain, {
        attempts: 4,
        baseDelayMs: 900,
      });
      if (retryLookup.ok) {
        ownershipTxt = getOwnershipVerificationTxt(retryLookup.data);
      }
    }

    if (!ownershipTxt) {
      await deleteCustomHostnameByHostname(domain);
      return NextResponse.json(
        {
          error:
            "Unable to prepare DNS verification records right now. Please try again.",
        },
        { status: 503 },
      );
    }

    const verificationToken = ownershipTxt.txtValue;

    const { data, error } = await supabase
      .from("custom_domains")
      .insert({
        workspace_id: workspaceId,
        domain,
        verification_token: verificationToken,
        status: "pending",
        cname_target: cnameTarget,
      })
      .select("*")
      .single();

    if (error) {
      // Check for duplicate domain constraint
      if (error.code === "23505") {
        // PostgreSQL unique violation
        // Clean up the Cloudflare custom hostname we just created
        await deleteCustomHostnameByHostname(domain);
        return NextResponse.json(
          { error: "This domain is already registered" },
          { status: 409 },
        );
      }

      // Log the actual error for debugging
      console.error("Domain creation error:", error);

      // Clean up the Cloudflare custom hostname we just created
      await deleteCustomHostnameByHostname(domain);

      return NextResponse.json(
        { error: "Failed to create domain" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      id: data.id,
      workspaceId,
      domain,
      verificationToken,
      cnameTarget,
      status: data.status,
      createdAt: data.created_at,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
