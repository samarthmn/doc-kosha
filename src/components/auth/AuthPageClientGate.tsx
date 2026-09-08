"use client";

import React from "react";
import AuthPage from "@/components/auth/AuthPage";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { resolveAuthReturnPath } from "@/modules/auth/returnPath";

const AuthPageClientGate: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [inviteWorkspaceName, setInviteWorkspaceName] = React.useState<
    string | null
  >(null);

  React.useEffect(() => {
    let cancelled = false;
    const inviteId = searchParams.get("invite");
    if (!inviteId) return;

    const redirectPath = resolveAuthReturnPath(searchParams.get("redirect"));
    const supabase = createSupabaseBrowserClient();

    const run = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;

        // If user is already signed in, jump straight to callback to accept invite.
        if (data?.user) {
          const qs = new URLSearchParams();
          qs.set("redirect", redirectPath);
          qs.set("invite", inviteId);
          router.replace(`/auth/callback?${qs.toString()}`);
          return;
        }
      } catch (err) {
        console.warn("[auth-page] failed to check current user", err);
      }

      // Best-effort: show workspace name for invite flows (keeps auth UI fast).
      try {
        const res = await fetch(
          `/api/public/invite-info?invite=${encodeURIComponent(inviteId)}`,
        );
        if (cancelled) return;
        if (res.ok) {
          const payload = (await res.json()) as {
            workspaceName?: string | null;
          };
          setInviteWorkspaceName(payload.workspaceName ?? null);
        }
      } catch (err) {
        console.warn("[auth-page] failed to load invite info", err);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return <AuthPage inviteWorkspaceName={inviteWorkspaceName} />;
};

export default AuthPageClientGate;
