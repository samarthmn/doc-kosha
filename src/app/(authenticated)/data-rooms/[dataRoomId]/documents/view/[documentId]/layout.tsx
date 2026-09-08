import React from "react";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { InternalDocumentViewerProvider } from "@/components/documents/internal/InternalDocumentViewerContext";
import InternalDocumentViewerShell from "@/components/documents/internal/InternalDocumentViewerShell";
import type { Tables } from "@/types/generated/supabase";

type Params = { dataRoomId: string; documentId: string };

const DataRoomDocumentViewerLayout: React.FC<
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

  const { data: room, error: roomError } = await supabase
    .from("data_rooms")
    .select("id,name,description,workspace_id,created_at")
    .eq("id", p.dataRoomId)
    .maybeSingle();

  if (roomError || !room) {
    notFound();
  }

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select(
      "id,title,file_type,size_bytes,num_pages,storage_path,converted_storage_path,conversion_status,workspace_id,data_room_id",
    )
    .eq("id", p.documentId)
    .eq("data_room_id", p.dataRoomId)
    .maybeSingle();

  if (docError || !doc || !doc.workspace_id) {
    notFound();
  }

  const { count: commentCount } = await supabase
    .from("comment_threads")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", doc.workspace_id)
    .eq("document_id", doc.id);

  const hasComments = Boolean(commentCount && commentCount > 0);

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

  return (
    <InternalDocumentViewerProvider
      value={{
        doc: viewerDoc,
        workspaceId: room.workspace_id,
        dataRoom: room as Tables<"data_rooms">,
      }}
    >
      <InternalDocumentViewerShell
        basePath={`/data-rooms/${room.id}/documents/view/${doc.id}`}
        backHref={`/data-rooms/${room.id}/documents`}
        title={viewerDoc.title}
        dataRoomName={room.name}
        hasComments={hasComments}
      >
        {children}
      </InternalDocumentViewerShell>
    </InternalDocumentViewerProvider>
  );
};

export default DataRoomDocumentViewerLayout;
