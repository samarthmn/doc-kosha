import React from "react";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { InternalDocumentViewerProvider } from "@/components/documents/internal/InternalDocumentViewerContext";
import InternalDocumentViewerShell from "@/components/documents/internal/InternalDocumentViewerShell";

type Params = { documentId: string };

const DocumentViewerLayout: React.FC<
  React.PropsWithChildren<{ params: Promise<Params> }>
> = async ({ children, params }) => {
  const p = (await params) as Params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    notFound();
  }

  const { data: doc, error } = await supabase
    .from("documents")
    .select(
      "id,title,file_type,size_bytes,num_pages,storage_path,converted_storage_path,conversion_status,workspace_id,data_room_id",
    )
    .eq("id", p.documentId)
    .maybeSingle();

  if (error || !doc || !doc.workspace_id) {
    notFound();
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("created_by")
    .eq("id", doc.workspace_id)
    .maybeSingle();

  const canViewAuditLog = Boolean(
    !workspaceError &&
    workspace?.created_by &&
    workspace.created_by === user.id,
  );

  const viewerDoc = {
    id: doc.id,
    title: doc.title || "Untitled document",
    file_type: doc.file_type || "",
    size_bytes: doc.size_bytes ?? 0,
    num_pages: doc.num_pages,
    storage_path: doc.storage_path || "",
    converted_storage_path: doc.converted_storage_path,
    conversion_status: doc.conversion_status,
    workspace_id: doc.workspace_id,
    data_room_id: doc.data_room_id,
  };

  const { count: commentCount } = await supabase
    .from("comment_threads")
    .select("id", { count: "exact", head: true })
    .eq("document_id", doc.id)
    .eq("workspace_id", doc.workspace_id);

  const hasComments = Boolean(commentCount && commentCount > 0);

  return (
    <InternalDocumentViewerProvider
      value={{
        doc: viewerDoc,
        workspaceId: doc.workspace_id,
        dataRoom: null,
      }}
    >
      <InternalDocumentViewerShell
        basePath={`/documents/view/${doc.id}`}
        backHref="/documents"
        title={viewerDoc.title}
        canViewAuditLog={canViewAuditLog}
        hasComments={hasComments}
      >
        {children}
      </InternalDocumentViewerShell>
    </InternalDocumentViewerProvider>
  );
};

export default DocumentViewerLayout;
