drop function if exists public.publish_document_conversion_candidate(uuid, timestamptz);

create function public.publish_document_conversion_candidate(
  p_candidate_token uuid,
  p_num_pages integer,
  p_updated_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_document_id uuid;
  v_candidate public.document_artifact_candidates%rowtype;
  v_updated_count integer;
begin
  if p_num_pages is null or p_num_pages <= 0 then
    raise exception 'conversion page count must be positive' using errcode = '22023';
  end if;

  select candidate.document_id
  into v_document_id
  from public.document_artifact_candidates candidate
  where candidate.candidate_token = p_candidate_token;

  if not found then
    raise exception 'artifact candidate not found' using errcode = 'P0008';
  end if;

  perform public.lock_document_deletion_resources(
    array[v_document_id],
    '{}'::uuid[]
  );

  select candidate.*
  into v_candidate
  from public.document_artifact_candidates candidate
  where candidate.candidate_token = p_candidate_token
  for update;

  if v_candidate.phase = 'published' then
    return public.document_artifact_candidate_payload(v_candidate);
  end if;

  if v_candidate.artifact_kind <> 'conversion'
    or v_candidate.phase <> 'uploading'
    or v_candidate.upload_finished_at is null
    or v_candidate.deletion_claim_token is not null then
    raise exception 'conversion publication rejected by deletion claim' using errcode = 'P0006';
  end if;

  update public.documents document
  set
    converted_storage_path = v_candidate.storage_path,
    conversion_status = 'completed',
    conversion_claim_id = null,
    num_pages = p_num_pages,
    updated_at = p_updated_at
  where document.id = v_candidate.document_id
    and document.workspace_id = v_candidate.workspace_id
    and document.storage_path = v_candidate.source_storage_path
    and document.conversion_status = 'in_progress'
    and document.conversion_claim_id = v_candidate.producer_token;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'conversion producer no longer owns document generation' using errcode = 'P0009';
  end if;

  update public.document_artifact_candidates candidate
  set
    phase = 'published',
    published_at = now(),
    cleanup_error = null,
    updated_at = now()
  where candidate.candidate_token = p_candidate_token
  returning * into v_candidate;

  return public.document_artifact_candidate_payload(v_candidate);
end;
$$;

alter function public.publish_document_conversion_candidate(uuid, integer, timestamptz) owner to postgres;
revoke all on function public.publish_document_conversion_candidate(uuid, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.publish_document_conversion_candidate(uuid, integer, timestamptz) to service_role;
