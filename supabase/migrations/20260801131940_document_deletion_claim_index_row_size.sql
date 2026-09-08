-- Exact-selection resume first narrows to one workspace/data-room scope and
-- scans newest claims until the uuid[] equality predicates match. Keep the
-- raw arrays out of the btree tuple so selections up to the API's 500-id cap
-- cannot exceed PostgreSQL's per-index-row size limit.
drop index if exists public.document_deletion_claims_exact_selection_idx;

create index document_deletion_claims_exact_selection_idx
  on public.document_deletion_claims (
    workspace_id,
    data_room_id,
    created_at desc
  );
