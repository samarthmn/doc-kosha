import { handleViewerInsightsExportRequest } from "@/modules/advanced-analytics/server/routes/viewerInsightsExport";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";

export async function POST(req: Request) {
  return handleViewerInsightsExportRequest(req, {
    createSupabaseServerClient,
  });
}
