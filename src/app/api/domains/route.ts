import { handleCreateDomainRequest } from "@/modules/custom-domains/server/routes/createDomain";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";

export async function POST(request: Request) {
  return handleCreateDomainRequest(request, {
    createSupabaseServerClient,
  });
}
