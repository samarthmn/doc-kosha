import { Suspense } from "react";
import type { Metadata } from "next";
import AuthPageClientGate from "@/components/auth/AuthPageClientGate";
import ScreenLoader from "@/components/ui/screenLoader";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { getSignedInUserEntryPath } from "@/modules/auth/server/entryRedirect";
import { redirect } from "next/navigation";

const SignInPage: React.FC<PageProps<"/auth/sign-in">> = async ({
  searchParams,
}) => {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const destination = await getSignedInUserEntryPath({
      supabase,
      userId: user.id,
      redirect: params?.redirect,
      inviteId: params?.invite,
      source: params?.source,
    });

    redirect(destination);
  }

  return (
    <Suspense fallback={<ScreenLoader />}>
      <AuthPageClientGate />
    </Suspense>
  );
};

export default SignInPage;

export const metadata: Metadata = {
  title: "Sign in",
  alternates: { canonical: "/auth/sign-in" },
};
