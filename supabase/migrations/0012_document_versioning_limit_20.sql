-- Expand document versioning retention cap from 10 to 20

alter table public.workspace_document_version_settings
  drop constraint if exists workspace_document_version_settings_max_previous_versions_check;

alter table public.workspace_document_version_settings
  add constraint workspace_document_version_settings_max_previous_versions_check
  check (max_previous_versions between 1 and 20);
