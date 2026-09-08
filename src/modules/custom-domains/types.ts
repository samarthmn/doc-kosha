import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/generated/supabase";

export type CustomDomainRequestDeps = {
  createSupabaseServerClient: () => Promise<SupabaseClient<Database>>;
};

export type CustomDomainSectionProps = {
  workspaceId: string;
  onVerified?: (hostname: string) => void;
  onVerificationStatusChange?: (
    verified: boolean,
    hostname?: string | null,
  ) => void;
};
