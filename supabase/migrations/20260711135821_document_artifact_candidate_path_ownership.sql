-- Exact cleanup is safe only when one durable candidate owns each external key.
create unique index document_artifact_candidates_storage_path_uidx
  on public.document_artifact_candidates (logical_bucket, storage_path);
