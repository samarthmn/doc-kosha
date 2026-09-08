import { Suspense } from "react";
import type { Metadata } from "next";
import AuthCallbackPage from "@/components/auth/AuthCallbackPage";
import ScreenLoader from "@/components/ui/screenLoader";
import { acceptWorkspaceInvite } from "@/server/workspaceInviteAcceptance";

export const dynamic = "force-dynamic";

const CallbackPage: React.FC<PageProps<"/auth/callback">> = async ({
  searchParams,
}) => {
  const params = await searchParams;
  const inviteParam = params?.invite;
  const inviteId =
    typeof inviteParam === "string"
      ? inviteParam
      : Array.isArray(inviteParam)
        ? inviteParam[0]
        : null;

  if (inviteId) {
    try {
      await acceptWorkspaceInvite(inviteId);
    } catch (error) {
      console.error("[auth-callback] failed to accept invite", error);
    }
  }

  return (
    <Suspense fallback={<ScreenLoader />}>
      <AuthCallbackPage />
    </Suspense>
  );
};

export default CallbackPage;

export const metadata: Metadata = {
  title: "Auth Callback",
  robots: { index: false, follow: false },
  alternates: { canonical: "/auth/callback" },
};
