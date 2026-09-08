"use client";

import { useGlobalStore } from "@/providers/globalStoreProvider";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import ScreenLoader from "../ui/screenLoader";
import { appendLandingAttribution } from "@/lib/analytics/landingAttribution";
import { resolveAuthReturnPath } from "@/modules/auth/returnPath";

const AuthCallbackPage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isLoading = useGlobalStore((s) => s.isLoading);
  const isAuthenticated = useGlobalStore((s) => s.isAuthenticated);
  const isUserOnboarded = useGlobalStore((s) => s.isUserOnboarded);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    // If auth/session propagation fails for any reason, avoid an infinite spinner.
    const timeout = window.setTimeout(() => setTimedOut(true), 15000);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    // Supabase reports failed link verification via error params, either in
    // the query string or the URL hash. Bail out to sign-in right away instead
    // of spinning until the timeout.
    const queryParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(
      window.location.hash.replace(/^#/, ""),
    );
    const hasError =
      queryParams.has("error") ||
      queryParams.has("error_code") ||
      hashParams.has("error") ||
      hashParams.has("error_code");
    if (!hasError) return;

    const errorCode =
      queryParams.get("error_code") ??
      hashParams.get("error_code") ??
      "link_invalid";
    const qs = new URLSearchParams();
    qs.set("redirect", resolveAuthReturnPath(searchParams.get("redirect")));
    appendLandingAttribution(qs, { source: searchParams.get("source") });
    qs.set("error", errorCode);
    router.replace(`/auth/sign-in?${qs.toString()}`);
  }, [router, searchParams]);

  useEffect(() => {
    if (isLoading) return;

    const redirectPath = resolveAuthReturnPath(searchParams.get("redirect"));
    const inviteId = searchParams.get("invite");
    const source = searchParams.get("source");

    // Wait for auth to settle. If it doesn't, send user back to sign-in.
    if (!isAuthenticated) {
      if (timedOut) {
        const qs = new URLSearchParams();
        qs.set("redirect", redirectPath);
        appendLandingAttribution(qs, { source });
        router.replace(`/auth/sign-in?${qs.toString()}`);
      }
      return;
    }

    if (!isUserOnboarded) {
      const qs = new URLSearchParams();
      qs.set("redirect", redirectPath);
      if (inviteId) {
        qs.set("invite", inviteId);
      }
      appendLandingAttribution(qs, { source });
      router.replace(`/onboarding?${qs.toString()}`);
      return;
    }

    router.replace(redirectPath);
  }, [
    isLoading,
    isAuthenticated,
    isUserOnboarded,
    router,
    searchParams,
    timedOut,
  ]);

  return <ScreenLoader />;
};

export default AuthCallbackPage;
