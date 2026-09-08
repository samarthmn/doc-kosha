import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { getBandwidthCycleWindow } from "@/modules/billing/bandwidthCycle";

const RequestSchema = z.object({
  workspaceId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { workspaceId } = parsed.data;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createSupabaseServiceClient();

    const { count: documentsCount, error: docErr } = await admin
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);
    if (docErr) {
      return NextResponse.json(
        { error: "Failed to load documents" },
        { status: 500 },
      );
    }

    let storageUsedBytes = 0;
    const { data: storageRow, error: storageError } = await admin
      .from("workspace_storage_current")
      .select("storage_used_bytes")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (storageError && storageError.code !== "PGRST116") {
      return NextResponse.json(
        { error: "Failed to load storage" },
        { status: 500 },
      );
    }
    if (storageRow?.storage_used_bytes !== undefined) {
      storageUsedBytes = storageRow.storage_used_bytes ?? 0;
    } else {
      const { data: documentsSizeRows, error: sizeErr } = await admin
        .from("documents")
        .select("size_bytes")
        .eq("workspace_id", workspaceId);
      if (sizeErr) {
        return NextResponse.json(
          { error: "Failed to load storage" },
          { status: 500 },
        );
      }
      storageUsedBytes = (documentsSizeRows || []).reduce(
        (acc: number, row: { size_bytes?: number | null }) =>
          acc + (row.size_bytes ?? 0),
        0,
      );
    }

    const { count: dataRoomsCount, error: drErr } = await admin
      .from("data_rooms")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);
    if (drErr) {
      console.error("[subscription-usage] data room count failed", drErr);
      return NextResponse.json(
        { error: "Failed to load data rooms" },
        { status: 500 },
      );
    }

    const { data: subscriptionRow } = await admin
      .from("workspace_subscriptions")
      .select("status, trial_started_at, current_period_started_at")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const { start: periodStart } = getBandwidthCycleWindow({
      status: subscriptionRow?.status ?? null,
      trialStartedAt: subscriptionRow?.trial_started_at ?? null,
      currentPeriodStartedAt:
        subscriptionRow?.current_period_started_at ?? null,
    });
    const periodStartIso = periodStart.toISOString().slice(0, 10);

    let bandwidthUsedBytes = 0;
    const { data: bandwidthRows, error: bandwidthError } = await admin
      .from("workspace_bandwidth_daily")
      .select("bytes_served")
      .eq("workspace_id", workspaceId)
      .gte("day", periodStartIso);
    if (bandwidthError) {
      return NextResponse.json(
        { error: "Failed to load bandwidth usage" },
        { status: 500 },
      );
    }
    bandwidthUsedBytes = (bandwidthRows || []).reduce(
      (acc: number, row: { bytes_served?: number | null }) =>
        acc + (row.bytes_served ?? 0),
      0,
    );

    return NextResponse.json({
      documentsCount: documentsCount ?? 0,
      storageUsedBytes,
      dataRoomsCount,
      bandwidthUsedBytes,
    });
  } catch (err) {
    console.error("[subscription-usage] unexpected error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
