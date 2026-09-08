"use client";

import { useCallback, useMemo } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { useRouter, useSearchParams } from "next/navigation";
import { appendLandingAttribution } from "@/lib/analytics/landingAttribution";

type SignOutScope = "global" | "local" | "others";

interface UseAuthResult {
  signIn: {
    magicLink: (email: string) => Promise<void>;
    verifyOtp: (email: string, otp: string) => Promise<void>;
    google: () => Promise<void>;
  };
  signOut: (scope?: SignOutScope) => void;
}

export const useAuth = (): UseAuthResult => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const searchParams = useSearchParams();
  const router = useRouter();

  const redirectPath = searchParams.get("redirect") || "/dashboard";
  const inviteId = searchParams.get("invite");
  const source = searchParams.get("source");

  const authCallbackPath = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("redirect", redirectPath);
    if (inviteId) {
      qs.set("invite", inviteId);
    }
    appendLandingAttribution(qs, { source });
    return `/auth/callback?${qs.toString()}`;
  }, [redirectPath, inviteId, source]);

  const authRedirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}${authCallbackPath}`
      : "";

  const signIn = useMemo(
    (): UseAuthResult["signIn"] => ({
      magicLink: async (email: string) => {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: authRedirectTo },
        });
        if (error) throw error;
      },
      verifyOtp: async (email: string, otp: string) => {
        const { error } = await supabase.auth.verifyOtp({
          email,
          token: otp,
          type: "email",
          options: { redirectTo: authRedirectTo },
        });
        if (error) throw error;
        router.replace(authCallbackPath);
      },
      google: async () => {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: authRedirectTo },
        });
        if (error) throw error;
      },
    }),
    [supabase.auth, authRedirectTo, authCallbackPath, router],
  );

  const signOut = useCallback(
    async (scope?: SignOutScope) =>
      await supabase.auth.signOut(scope ? { scope } : undefined),
    [supabase],
  );

  return {
    signIn,
    signOut,
  };
};
