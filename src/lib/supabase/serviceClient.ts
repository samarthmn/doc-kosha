import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/generated/supabase";
import { clientEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env";

// Server-only Supabase client using the service role key.
// Never import this into client code.
export const createSupabaseServiceClient = () => {
  const url = clientEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return createClient<Database>(url, key);
};
