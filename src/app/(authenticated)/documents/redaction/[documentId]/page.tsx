import React from "react";
import { notFound } from "next/navigation";
import DocumentRedactionStudio from "@/components/documents/redaction/DocumentRedactionStudio";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";

type Params = { documentId: string };

const DocumentRedactionPage: React.FC<{ params: Promise<Params> }> = async ({
  params,
}) => {
  const { documentId } = await params;
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
      "id,title,file_type,size_bytes,num_pages,storage_path,converted_storage_path,conversion_status,workspace_id,data_room_id,folder_id",
    )
    .eq("id", documentId)
    .is("data_room_id", null)
    .maybeSingle();

  if (error || !doc || !doc.workspace_id) {
    notFound();
  }

  const { data: canEdit, error: canEditError } = await supabase.rpc(
    "can_edit_workspace_documents",
    {
      ws: doc.workspace_id,
    },
  );

  if (canEditError || !canEdit) {
    notFound();
  }

  return (
    <DocumentRedactionStudio
      doc={{
        id: doc.id,
        title: doc.title ?? "Untitled document",
        file_type: doc.file_type ?? "",
        size_bytes: doc.size_bytes ?? 0,
        num_pages: doc.num_pages ?? null,
        storage_path: doc.storage_path ?? "",
        converted_storage_path: doc.converted_storage_path ?? null,
        conversion_status: doc.conversion_status ?? null,
        workspace_id: doc.workspace_id,
        data_room_id: null,
        folder_id: doc.folder_id ?? null,
      }}
      workspaceId={doc.workspace_id}
      backHref={`/documents/view/${doc.id}`}
      documentViewHref={`/documents/view/${doc.id}`}
    />
  );
};

export default DocumentRedactionPage;
