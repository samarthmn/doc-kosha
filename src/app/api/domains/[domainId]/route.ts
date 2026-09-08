import { handleDeleteDomainRequest } from "@/modules/custom-domains/server/routes/deleteDomain";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";

type RouteContext = {
  params: Promise<{ domainId: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  return handleDeleteDomainRequest(request, context, {
    createSupabaseServerClient,
  });
}
