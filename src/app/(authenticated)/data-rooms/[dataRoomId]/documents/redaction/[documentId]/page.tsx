import React from "react";
import { notFound } from "next/navigation";
import DocumentRedactionStudio from "@/components/documents/redaction/DocumentRedactionStudio";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";

type Params = {
  dataRoomId: string;
  documentId: string;
};

const DataRoomDocumentRedactionPage: React.FC<{
  params: Promise<Params>;
}> = async ({ params }) => {
  const { dataRoomId, documentId } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    notFound();
  }

  const { data: room, error: roomError } = await supabase
    .from("data_rooms")
    .select("id,name,workspace_id")
    .eq("id", dataRoomId)
    .maybeSingle();

  if (roomError || !room) {
    notFound();
  }

  const { data: doc, error } = await supabase
    .from("documents")
    .select(
      "id,title,file_type,size_bytes,num_pages,storage_path,converted_storage_path,conversion_status,workspace_id,data_room_id,folder_id",
    )
    .eq("id", documentId)
    .eq("data_room_id", dataRoomId)
    .maybeSingle();

  if (error || !doc || !doc.workspace_id) {
    notFound();
  }

  if (doc.workspace_id !== room.workspace_id) {
    notFound();
  }

  const { data: canEditRoom, error: canEditRoomError } = await supabase.rpc(
    "can_edit_data_room",
    {
      ws: room.workspace_id,
      room_id: room.id,
    },
  );

  if (canEditRoomError || !canEditRoom) {
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
        data_room_id: dataRoomId,
        folder_id: doc.folder_id ?? null,
      }}
      workspaceId={doc.workspace_id}
      backHref={`/data-rooms/${dataRoomId}/documents/view/${doc.id}`}
      documentViewHref={`/data-rooms/${dataRoomId}/documents/view/${doc.id}`}
      dataRoomName={room.name}
    />
  );
};

export default DataRoomDocumentRedactionPage;
