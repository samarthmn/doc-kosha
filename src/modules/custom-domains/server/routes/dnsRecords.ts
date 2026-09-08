import { NextResponse } from "next/server";
import type { CustomDomainRequestDeps } from "../../types";
import { verifyDomainInputSchema } from "@/lib/validators/customDomain";
import { mapWorkspaceSubscriptionRow } from "@/modules/billing/subscriptionMapper";
import { canUseCustomDomain } from "../../entitlements";
import type { Tables } from "@/types/generated/supabase";
import {
  getCnameTarget,
  getCustomHostnameByHostnameWithRetry,
  getOwnershipVerificationTxt,
  getSslValidationTxtRecords,
  getCloudflareCustomHostnameConfiguration,
} from "../cloudflareCustomHostnames";

type DnsRecord = {
  type: "CNAME" | "TXT";
  name: string;
  value: string;
  purpose: "cname" | "ownership" | "ssl_validation";
};

export async function handleDnsRecordsRequest(
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
        "[domains/dns-records] subscription lookup failed",
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
        console.error("[domains/dns-records] domain fetch failed", fetchErr);
        return NextResponse.json(
          { error: "Something went wrong. Please try again." },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    const cnameTarget = domainRow.cname_target || getCnameTarget();

    const records: DnsRecord[] = [
      {
        type: "CNAME",
        name: domainRow.domain,
        value: cnameTarget,
        purpose: "cname",
      },
      {
        type: "TXT",
        name: `_cf-custom-hostname.${domainRow.domain}`,
        value: domainRow.verification_token,
        purpose: "ownership",
      },
    ];

    const cfResult = await getCustomHostnameByHostnameWithRetry(
      domainRow.domain,
      {
        attempts: 4,
        baseDelayMs: 700,
      },
    );
    if (cfResult.ok) {
      const ownership = getOwnershipVerificationTxt(cfResult.data);
      if (ownership) {
        records.splice(1, 1, {
          type: "TXT",
          name: ownership.txtName,
          value: ownership.txtValue,
          purpose: "ownership",
        });
      }

      for (const sslTxt of getSslValidationTxtRecords(cfResult.data)) {
        records.push({
          type: "TXT",
          name: sslTxt.txtName,
          value: sslTxt.txtValue,
          purpose: "ssl_validation",
        });
      }
    }

    const deduped = Array.from(
      new Map(
        records.map((r) => [`${r.type}:${r.name}:${r.value}`, r]),
      ).values(),
    );

    return NextResponse.json({
      records: deduped,
    });
  } catch (err) {
    console.error("[domains/dns-records] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
