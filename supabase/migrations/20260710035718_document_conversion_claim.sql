-- Coordinate conversion work across overlapping serverless invocations.
-- The token is ephemeral and is cleared when an attempt completes or fails.

alter table public.documents
add column if not exists conversion_claim_id uuid;

comment on column public.documents.conversion_claim_id
is 'Ephemeral owner token for one document-processing attempt; cleared on completion or failure.';
