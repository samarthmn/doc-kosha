import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, FolderOpen, Shield } from "@phosphor-icons/react/ssr";

export default async function DocumentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, documents_access")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .order("workspace_id", { ascending: true })
    .limit(1);

  if (membershipError) {
    console.error("[documents/layout] workspace_members select failed", {
      error: membershipError,
      userId: user.id,
    });
    throw membershipError;
  }

  if (!membershipRows || membershipRows.length === 0) {
    redirect("/onboarding");
  }

  const membership = membershipRows[0]!;
  const workspaceId = membership.workspace_id as string;
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, created_by")
    .eq("id", workspaceId)
    .maybeSingle();

  if (workspaceError) {
    console.error("[documents/layout] workspaces select failed", {
      error: workspaceError,
      userId: user.id,
      workspaceId,
    });
    throw workspaceError;
  }

  const isOwner = workspace?.created_by === user.id;
  const documentsAccess = isOwner
    ? "editor"
    : (membership.documents_access ?? "none");
  const canAccessDocuments = documentsAccess !== "none";

  if (!canAccessDocuments) {
    return (
      <PageContainer maxWidth="3xl">
        <PageHeader
          title="Documents"
          description="You don't have access to Documents in this workspace."
          actions={
            <Button asChild>
              <Link href="/data-rooms">
                <FolderOpen aria-hidden className="mr-2 h-4 w-4" />
                Go to Data Rooms
              </Link>
            </Button>
          }
        />

        <div className="mt-6 grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-4 w-4" aria-hidden />
                Access restricted
              </CardTitle>
              <CardDescription>
                A workspace owner has disabled the Documents tab for your
                membership.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3 text-sm text-muted-foreground">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted text-foreground">
                  <FileText className="h-4 w-4" aria-hidden />
                </div>
                <div className="space-y-1.5">
                  <p>
                    If you need access, ask a workspace owner to update your
                    permissions.
                  </p>
                  <p>
                    You can still access any Data Rooms you’ve been granted.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    );
  }

  return children;
}
