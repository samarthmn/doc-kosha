export type DocumentRow = {
  id: string;
  title: string;
  file_type: string;
  size_bytes: number;
  num_pages: number | null;
  storage_path: string;
  converted_storage_path: string | null;
  conversion_status?: string | null;
  workspace_id?: string | null;
  data_room_id?: string | null;
};
