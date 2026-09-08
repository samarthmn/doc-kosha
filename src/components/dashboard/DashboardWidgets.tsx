import React from "react";
import { WarningCircle } from "@phosphor-icons/react/ssr";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import {
  getDashboardKPIs,
  getMostActiveContent,
  getRecentDocuments,
  getTopCountriesByDocumentViews,
  getRecentDataRooms,
} from "@/lib/analytics/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICards } from "./KPICards";
import { MostActiveContent } from "./MostActiveContent";
import { RecentDocuments } from "./RecentDocuments";
import { RecentDataRooms } from "./RecentDataRooms";
import { ViewsByCountry } from "./ViewsByCountry";

// Shared failure card so fetch errors stay visually distinct from genuine
// empty states. These are server components, so the retry affordance is a
// page reload rather than a client-side button.
const WidgetErrorCard: React.FC<{ title: string }> = ({ title }) => (
  <Card className="h-full border-border/70 bg-card/55">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/50 pb-3">
      <CardTitle className="text-[0.95rem] font-medium">{title}</CardTitle>
      <WarningCircle className="size-4 text-destructive" aria-hidden />
    </CardHeader>
    <CardContent>
      <p className="text-sm font-medium">Couldn&apos;t load stats</p>
      <p className="text-xs text-muted-foreground">
        Reload the page to try again.
      </p>
    </CardContent>
  </Card>
);

export async function KPICardsWidget({ workspaceId }: { workspaceId: string }) {
  const supabase = await createSupabaseServerClient();
  try {
    const data = await getDashboardKPIs(supabase, workspaceId);
    return <KPICards {...data} />;
  } catch (error) {
    console.error("Failed to fetch KPI stats", error);
    return <WidgetErrorCard title="Engagement overview" />;
  }
}

export async function MostActiveContentWidget({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const supabase = await createSupabaseServerClient();
  try {
    const data = await getMostActiveContent(supabase, workspaceId);
    return <MostActiveContent data={data} />;
  } catch (error) {
    console.error("Failed to fetch most active content", error);
    return <WidgetErrorCard title="Most active content" />;
  }
}

export async function ViewsByCountryWidget({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const supabase = await createSupabaseServerClient();
  try {
    const data = await getTopCountriesByDocumentViews(supabase, workspaceId);
    return <ViewsByCountry data={data} />;
  } catch (error) {
    console.error("Failed to fetch views by country", error);
    return <WidgetErrorCard title="Views by country" />;
  }
}

export async function RecentDocumentsWidget({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <RecentDocuments documents={[]} />;
  }

  const { data: canAccessDocuments, error: accessError } = await supabase.rpc(
    "can_access_workspace_documents",
    { ws: workspaceId },
  );

  if (accessError) {
    console.error("[dashboard] RecentDocumentsWidget access check failed", {
      error: accessError,
      userId: user.id,
      workspaceId,
    });
  }

  if (accessError || !canAccessDocuments) {
    return <RecentDocuments documents={[]} canAccessDocuments={false} />;
  }

  try {
    const data = await getRecentDocuments(supabase, workspaceId);
    return <RecentDocuments documents={data} />;
  } catch (error) {
    console.error("Failed to fetch recent documents", error);
    return <WidgetErrorCard title="Recent documents" />;
  }
}

export async function RecentDataRoomsWidget({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const supabase = await createSupabaseServerClient();
  try {
    const data = await getRecentDataRooms(supabase, workspaceId);
    return <RecentDataRooms dataRooms={data} />;
  } catch (error) {
    console.error("Failed to fetch recent data rooms", error);
    return <WidgetErrorCard title="Recent data rooms" />;
  }
}
