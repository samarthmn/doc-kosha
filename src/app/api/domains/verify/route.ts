import { handleVerifyDomainRequest } from "@/modules/custom-domains/server/routes/verifyDomain";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";

export async function POST(request: Request) {
  return handleVerifyDomainRequest(request, {
    createSupabaseServerClient,
  });
}
