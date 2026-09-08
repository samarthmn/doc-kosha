-- Enforce folder name uniqueness per (workspace, room, parent) case-insensitively.
--
-- We coalesce nullable scope columns so root-level folders (NULL parent_folder_id)
-- and workspace-level folders (NULL data_room_id) are properly constrained.
--
-- This eliminates TOCTOU windows where concurrent rename/create operations could
-- produce duplicate folder names in the same location.

CREATE UNIQUE INDEX IF NOT EXISTS folders_unique_name_ci
ON public.folders (
  workspace_id,
  COALESCE(data_room_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid),
  LOWER(name)
);

