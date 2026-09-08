import { NextResponse } from "next/server";
import type { CustomDomainRequestDeps } from "../../types";
import { verifyDomainInputSchema } from "@/lib/validators/customDomain";
import { mapWorkspaceSubscriptionRow } from "@/modules/billing/subscriptionMapper";
import { canUseCustomDomain } from "../../entitlements";
import type { Tables } from "@/types/generated/supabase";
import {
  getCustomHostnameByHostnameWithRetry,
  getCloudflareCustomHostnameConfiguration,
  isHostnameActive,
  isHostnamePending,
  refreshValidation,
} from "../cloudflareCustomHostnames";

export async function handleVerifyDomainRequest(
  request: Request,
  deps: CustomDomainRequestDeps,
): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = verifyDomainInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { workspaceId, domainId } = parsed.data;

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

    const { data: subscriptionRow, error: subscriptionError } = await supabase
      .from("workspace_subscriptions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (subscriptionError) {
      console.error(
        "[domains/verify] subscription lookup failed",
        subscriptionError,
      );
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

    const { data: domainRow, error: fetchErr } = await supabase
      .from("custom_domains")
      .select("*")
      .eq("id", domainId)
      .eq("workspace_id", workspaceId)
      .single();
    if (fetchErr || !domainRow) {
      if (fetchErr) {
        console.error("[domains/verify] domain fetch failed", fetchErr);
      }
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    // If already verified in our DB, return success with the hostname
    if (domainRow.status === "verified") {
      return NextResponse.json({
        status: "verified",
        hostname: domainRow.domain,
      });
    }

    // Check Cloudflare custom hostname status.
    const cfResult = await getCustomHostnameByHostnameWithRetry(
      domainRow.domain,
      {
        attempts: 3,
        baseDelayMs: 700,
      },
    );

    if (!cfResult.ok) {
      if (cfResult.isAuthError) {
        console.error("[domains/verify] Cloudflare auth failed", {
          status: cfResult.status,
          code: cfResult.code,
        });
        return NextResponse.json(
          {
            error:
              "Domain verification is temporarily unavailable. Please contact support if this continues.",
            code: "CF_AUTH",
          },
          { status: 503 },
        );
      }
      if (cfResult.isPermissionError) {
        console.error("[domains/verify] Cloudflare permission denied", {
          status: cfResult.status,
          code: cfResult.code,
        });
        return NextResponse.json(
          {
            error:
              "Domain verification is temporarily unavailable. Please contact support if this continues.",
            code: "CF_FORBIDDEN",
          },
          { status: 503 },
        );
      }
      if ("notFound" in cfResult && cfResult.notFound) {
        return NextResponse.json(
          {
            status: "pending",
            message:
              "Your domain is still provisioning. Please retry in a moment.",
            retry_after_ms: 15000,
          },
          { status: 200 },
        );
      }
      console.error(
        "[domains/verify] Cloudflare lookup failed:",
        cfResult.error,
      );
      return NextResponse.json(
        { error: "Failed to check domain status." },
        { status: 500 },
      );
    }

    const cfHostname = cfResult.data;

    // Check if hostname is fully active
    if (isHostnameActive(cfHostname)) {
      // Hostname is verified and SSL is active - mark as verified in DB
      const { error: updateErr } = await supabase
        .from("custom_domains")
        .update({
          status: "verified",
          verified_at: new Date().toISOString(),
        })
        .eq("id", domainId)
        .eq("workspace_id", workspaceId);

      if (updateErr) {
        console.error("[domains/verify] update failed:", updateErr);
        return NextResponse.json(
          { error: "Failed to update domain status" },
          { status: 500 },
        );
      }

      // Set as active custom domain for workspace
      try {
        await supabase
          .from("workspaces")
          .update({ active_custom_domain_id: domainId })
          .eq("id", workspaceId);
      } catch {
        // no-op - active pointer is optional
      }

      return NextResponse.json({
        status: "verified",
        hostname: domainRow.domain,
      });
    }

    // Check if still pending validation
    if (isHostnamePending(cfHostname)) {
      // Trigger a refresh to re-check validation
      await refreshValidation(cfHostname.id);

      // Return pending status with helpful message
      const sslStatus = cfHostname.ssl?.status || "unknown";
      const hostnameStatus = cfHostname.status || "unknown";

      let message = "Domain validation is still pending.";
      if (sslStatus === "pending_validation") {
        message =
          "DNS records are being validated. This may take a few minutes. Please ensure your CNAME and TXT records are configured correctly.";
      } else if (sslStatus === "pending_issuance") {
        message =
          "SSL certificate is being issued. This may take a few minutes.";
      } else if (sslStatus === "pending_deployment") {
        message =
          "SSL certificate is being deployed. This should complete shortly.";
      }

      return NextResponse.json(
        {
          status: "pending",
          message,
          retry_after_ms: 15000,
          details: {
            hostname_status: hostnameStatus,
            ssl_status: sslStatus,
          },
        },
        { status: 200 },
      );
    }

    // Hostname is in a failed or blocked state
    const verificationErrors = cfHostname.verification_errors || [];
    const sslErrors = cfHostname.ssl?.validation_errors || [];
    const allErrors = [
      ...verificationErrors,
      ...sslErrors.map((e) => e.message).filter(Boolean),
    ];

    // Log detailed errors server-side for debugging
    if (allErrors.length > 0) {
      console.error("[domains/verify] validation errors", allErrors);
    }

    return NextResponse.json(
      {
        error: "Domain validation failed. Please check your DNS configuration.",
        code: "VALIDATION_FAILED",
        details: {
          hostname_status: cfHostname.status,
          ssl_status: cfHostname.ssl?.status,
        },
      },
      { status: 400 },
    );
  } catch (err) {
    console.error("Domain verification error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
