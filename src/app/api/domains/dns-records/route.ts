import { handleDnsRecordsRequest } from "@/modules/custom-domains/server/routes/dnsRecords";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";

export async function POST(request: Request) {
  return handleDnsRecordsRequest(request, {
    createSupabaseServerClient,
  });
}
