-- Coordinate immutable external artifact producers with document deletion.
-- A producer registers before PUT, records when PUT returns, then either
-- publishes atomically or exact-deletes and durably acknowledges cleanup.

create table public.document_artifact_candidates (
  candidate_token uuid primary key,
  producer_token uuid not null,
  workspace_id uuid not null,
  document_id uuid not null,
  artifact_kind text not null check (artifact_kind in ('conversion', 'nda')),
  logical_bucket text not null check (
    logical_bucket in (
      'documents',
      'data-room',
      'converted-documents',
      'converted-data-room'
    )
  ),
  storage_path text not null,
  source_storage_path text null,
  nda_signature_id uuid null,
  phase text not null check (
    phase in (
      'registered',
      'uploading',
      'published',
      'cleanup_required',
      'cleaned',
      'cancelled'
    )
  ),
  deletion_claim_token uuid null,
  cleanup_error text null,
  registered_at timestamptz not null default now(),
  upload_started_at timestamptz null,
  upload_finished_at timestamptz null,
  published_at timestamptz null,
  cleaned_at timestamptz null,
  updated_at timestamptz not null default now(),
  unique (artifact_kind, producer_token),
  check (
    (artifact_kind = 'conversion' and source_storage_path is not null and nda_signature_id is null)
    or
    (artifact_kind = 'nda' and source_storage_path is null and nda_signature_id is not null)
  )
);

create index document_artifact_candidates_outstanding_claim_idx
  on public.document_artifact_candidates (deletion_claim_token, phase)
  where phase in ('uploading', 'cleanup_required');

create index document_artifact_candidates_document_cleanup_idx
  on public.document_artifact_candidates (
    workspace_id,
    document_id,
    artifact_kind,
    phase,
    updated_at desc
  )
  where phase = 'cleanup_required';

create index document_artifact_candidates_nda_signature_idx
  on public.document_artifact_candidates (nda_signature_id, phase, updated_at desc)
  where nda_signature_id is not null;

alter table public.document_artifact_candidates enable row level security;
revoke all on table public.document_artifact_candidates from public, anon, authenticated;
grant select, insert, update on table public.document_artifact_candidates to service_role;

create or replace function public.document_artifact_candidate_payload(
  p_candidate public.document_artifact_candidates
) returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'candidateToken', p_candidate.candidate_token,
    'producerToken', p_candidate.producer_token,
    'workspaceId', p_candidate.workspace_id,
    'documentId', p_candidate.document_id,
    'artifactKind', p_candidate.artifact_kind,
    'logicalBucket', p_candidate.logical_bucket,
    'path', p_candidate.storage_path,
    'sourceStoragePath', p_candidate.source_storage_path,
    'ndaSignatureId', p_candidate.nda_signature_id,
    'phase', p_candidate.phase,
    'deletionClaimToken', p_candidate.deletion_claim_token,
    'cleanupError', p_candidate.cleanup_error
  );
$$;

create or replace function public.register_document_artifact_candidate(
  p_candidate_token uuid,
  p_workspace_id uuid,
  p_document_id uuid,
  p_artifact_kind text,
  p_producer_token uuid,
  p_logical_bucket text,
  p_storage_path text,
  p_source_storage_path text default null,
  p_nda_signature_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_candidate public.document_artifact_candidates%rowtype;
  v_deletion_claim_token uuid;
  v_phase text;
  v_document_data_room_id uuid;
  v_document_storage_path text;
begin
  if p_candidate_token is null
    or p_workspace_id is null
    or p_document_id is null
    or p_producer_token is null
    or p_artifact_kind not in ('conversion', 'nda')
    or p_logical_bucket not in (
      'documents',
      'data-room',
      'converted-documents',
      'converted-data-room'
    )
    or nullif(p_storage_path, '') is null
    or p_storage_path not like ('workspaces/' || p_workspace_id::text || '/%') then
    raise exception 'invalid artifact candidate' using errcode = '22023';
  end if;

  if (p_artifact_kind = 'conversion' and (p_source_storage_path is null or p_nda_signature_id is not null))
    or (p_artifact_kind = 'nda' and (p_source_storage_path is not null or p_nda_signature_id is null)) then
    raise exception 'invalid artifact candidate ownership' using errcode = '22023';
  end if;

  perform public.lock_document_deletion_resources(
    array[p_document_id],
    '{}'::uuid[]
  );

  select candidate.*
  into v_candidate
  from public.document_artifact_candidates candidate
  where candidate.candidate_token = p_candidate_token
  for update;

  if found then
    if v_candidate.producer_token <> p_producer_token
      or v_candidate.workspace_id <> p_workspace_id
      or v_candidate.document_id <> p_document_id
      or v_candidate.artifact_kind <> p_artifact_kind
      or v_candidate.logical_bucket <> p_logical_bucket
      or v_candidate.storage_path <> p_storage_path
      or v_candidate.source_storage_path is distinct from p_source_storage_path
      or v_candidate.nda_signature_id is distinct from p_nda_signature_id then
      raise exception 'candidate token belongs to another artifact' using errcode = 'P0008';
    end if;
    return public.document_artifact_candidate_payload(v_candidate);
  end if;

  select claim.claim_token
  into v_deletion_claim_token
  from public.document_deletion_claims claim
  where claim.workspace_id = p_workspace_id
    and p_document_id = any(claim.document_ids)
    and claim.status in ('active', 'completed')
  order by
    case when claim.status = 'active' then 0 else 1 end,
    claim.created_at desc
  limit 1;

  if v_deletion_claim_token is null then
    select document.data_room_id, document.storage_path
    into v_document_data_room_id, v_document_storage_path
    from public.documents document
    where document.id = p_document_id
      and document.workspace_id = p_workspace_id;

    if not found then
      raise exception 'artifact document not found' using errcode = 'P0002';
    end if;

    if p_artifact_kind = 'conversion' then
      if p_source_storage_path <> v_document_storage_path
        or p_logical_bucket <> (case
          when v_document_data_room_id is null then 'converted-documents'
          else 'converted-data-room'
        end) then
        raise exception 'conversion candidate does not match document generation' using errcode = 'P0008';
      end if;
    else
      if p_logical_bucket <> 'documents'
        or not exists (
          select 1
          from public.nda_signatures signature
          where signature.id = p_nda_signature_id
            and signature.workspace_id = p_workspace_id
            and signature.document_id = p_document_id
            and signature.signed_pdf_path is null
        ) then
        raise exception 'NDA candidate does not match signature' using errcode = 'P0008';
      end if;
    end if;
  end if;

  v_phase := case
    when v_deletion_claim_token is null then 'registered'
    else 'cancelled'
  end;

  insert into public.document_artifact_candidates (
    candidate_token,
    producer_token,
    workspace_id,
    document_id,
    artifact_kind,
    logical_bucket,
    storage_path,
    source_storage_path,
    nda_signature_id,
    phase,
    deletion_claim_token,
    cleaned_at
  ) values (
    p_candidate_token,
    p_producer_token,
    p_workspace_id,
    p_document_id,
    p_artifact_kind,
    p_logical_bucket,
    p_storage_path,
    p_source_storage_path,
    p_nda_signature_id,
    v_phase,
    v_deletion_claim_token,
    case when v_phase = 'cancelled' then now() else null end
  )
  returning * into v_candidate;

  return public.document_artifact_candidate_payload(v_candidate);
end;
$$;

create or replace function public.begin_document_artifact_upload(
  p_candidate_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_document_id uuid;
  v_workspace_id uuid;
  v_candidate public.document_artifact_candidates%rowtype;
  v_deletion_claim_token uuid;
begin
  select candidate.document_id, candidate.workspace_id
  into v_document_id, v_workspace_id
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

  if v_candidate.phase = 'registered' then
    select claim.claim_token
    into v_deletion_claim_token
    from public.document_deletion_claims claim
    where claim.workspace_id = v_workspace_id
      and v_document_id = any(claim.document_ids)
      and claim.status in ('active', 'completed')
    order by
      case when claim.status = 'active' then 0 else 1 end,
      claim.created_at desc
    limit 1;

    if v_deletion_claim_token is not null then
      update public.document_artifact_candidates candidate
      set
        phase = 'cancelled',
        deletion_claim_token = v_deletion_claim_token,
        cleaned_at = now(),
        updated_at = now()
      where candidate.candidate_token = p_candidate_token
      returning * into v_candidate;
    else
      update public.document_artifact_candidates candidate
      set
        phase = 'uploading',
        upload_started_at = now(),
        updated_at = now()
      where candidate.candidate_token = p_candidate_token
      returning * into v_candidate;
    end if;
  end if;

  return public.document_artifact_candidate_payload(v_candidate);
end;
$$;

create or replace function public.finish_document_artifact_upload(
  p_candidate_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_document_id uuid;
  v_candidate public.document_artifact_candidates%rowtype;
begin
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

  if v_candidate.phase = 'uploading' then
    update public.document_artifact_candidates candidate
    set
      phase = case
        when candidate.deletion_claim_token is not null then 'cleanup_required'
        else candidate.phase
      end,
      upload_finished_at = now(),
      updated_at = now()
    where candidate.candidate_token = p_candidate_token
    returning * into v_candidate;
  end if;

  return public.document_artifact_candidate_payload(v_candidate);
end;
$$;

create or replace function public.get_document_artifact_candidate(
  p_candidate_token uuid
) returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select public.document_artifact_candidate_payload(candidate)
  from public.document_artifact_candidates candidate
  where candidate.candidate_token = p_candidate_token;
$$;

create or replace function public.mark_document_artifact_cleanup_failed(
  p_candidate_token uuid,
  p_error text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_document_id uuid;
  v_candidate public.document_artifact_candidates%rowtype;
begin
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

  if v_candidate.phase not in ('uploading', 'cleanup_required') then
    raise exception 'candidate cannot require cleanup' using errcode = 'P0008';
  end if;

  update public.document_artifact_candidates candidate
  set
    phase = 'cleanup_required',
    upload_finished_at = coalesce(candidate.upload_finished_at, now()),
    cleanup_error = left(coalesce(nullif(p_error, ''), 'artifact cleanup failed'), 1000),
    updated_at = now()
  where candidate.candidate_token = p_candidate_token
  returning * into v_candidate;

  return public.document_artifact_candidate_payload(v_candidate);
end;
$$;

create or replace function public.acknowledge_document_artifact_cleanup(
  p_candidate_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_document_id uuid;
  v_candidate public.document_artifact_candidates%rowtype;
begin
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

  if v_candidate.phase not in ('cleanup_required', 'cleaned') then
    raise exception 'candidate cleanup is not ready for acknowledgment' using errcode = 'P0008';
  end if;

  if v_candidate.phase = 'cleanup_required' then
    update public.document_artifact_candidates candidate
    set
      phase = 'cleaned',
      cleanup_error = null,
      cleaned_at = now(),
      updated_at = now()
    where candidate.candidate_token = p_candidate_token
    returning * into v_candidate;
  end if;

  return public.document_artifact_candidate_payload(v_candidate);
end;
$$;

create or replace function public.publish_document_conversion_candidate(
  p_candidate_token uuid,
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

create or replace function public.publish_document_nda_candidate(
  p_candidate_token uuid
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

  if v_candidate.artifact_kind <> 'nda'
    or v_candidate.phase <> 'uploading'
    or v_candidate.upload_finished_at is null
    or v_candidate.deletion_claim_token is not null then
    raise exception 'NDA publication rejected by deletion claim' using errcode = 'P0006';
  end if;

  update public.nda_signatures signature
  set signed_pdf_path = v_candidate.storage_path
  where signature.id = v_candidate.nda_signature_id
    and signature.workspace_id = v_candidate.workspace_id
    and signature.document_id = v_candidate.document_id
    and signature.signed_pdf_path is null;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'NDA producer no longer owns signature' using errcode = 'P0009';
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

create or replace function public.attach_document_artifact_candidates_to_deletion_claim()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  update public.document_artifact_candidates candidate
  set
    deletion_claim_token = new.claim_token,
    phase = case
      when candidate.phase = 'registered' then 'cancelled'
      else candidate.phase
    end,
    cleaned_at = case
      when candidate.phase = 'registered' then now()
      else candidate.cleaned_at
    end,
    updated_at = now()
  where candidate.workspace_id = new.workspace_id
    and candidate.document_id = any(new.document_ids)
    and candidate.phase in ('registered', 'uploading', 'cleanup_required');

  return new;
end;
$$;

drop trigger if exists attach_document_artifact_candidates_to_deletion_claim
on public.document_deletion_claims;
create trigger attach_document_artifact_candidates_to_deletion_claim
before insert on public.document_deletion_claims
for each row execute function public.attach_document_artifact_candidates_to_deletion_claim();

create or replace function public.delete_document_selection(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_claim_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_claim public.document_deletion_claims%rowtype;
  v_actor_name text;
  v_actor_email text;
  v_actor_claims jsonb;
begin
  if p_actor_id is null or p_claim_token is null then
    raise exception 'deletion actor and claim are required' using errcode = '22023';
  end if;

  select claim.*
  into v_claim
  from public.document_deletion_claims claim
  where claim.claim_token = p_claim_token
    and claim.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'claim does not match deletion request' using errcode = 'P0004';
  end if;

  if v_claim.status = 'completed' then
    return jsonb_build_object(
      'documentIds', to_jsonb(v_claim.deleted_document_ids),
      'folderIds', to_jsonb(v_claim.deleted_folder_ids)
    );
  end if;

  perform public.lock_document_deletion_resources(
    v_claim.document_ids,
    v_claim.folder_ids
  );

  if exists (
    select 1
    from public.document_artifact_candidates candidate
    where candidate.deletion_claim_token = p_claim_token
      and candidate.phase in ('uploading', 'cleanup_required')
  ) then
    raise exception 'document artifact cleanup is pending' using errcode = 'P0007';
  end if;

  select
    coalesce(
      nullif(trim(both from profile.full_name), ''),
      nullif(trim(both from actor.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(both from actor.raw_user_meta_data->>'name'), '')
    ),
    nullif(trim(both from actor.email), '')
  into v_actor_name, v_actor_email
  from auth.users actor
  left join public.profiles profile on profile.id = actor.id
  where actor.id = p_actor_id;

  if not found then
    raise exception 'verified deletion actor not found' using errcode = 'P0004';
  end if;

  v_actor_claims := jsonb_build_object(
    'sub', p_actor_id,
    'email', v_actor_email,
    'user_metadata', jsonb_build_object('full_name', v_actor_name)
  );

  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);
  perform set_config('request.jwt.claim', v_actor_claims::text, true);
  perform set_config('request.jwt.claims', v_actor_claims::text, true);
  perform set_config(
    'app.document_deletion_claim_token',
    p_claim_token::text,
    true
  );

  delete from public.documents document
  where document.id = any(v_claim.document_ids)
    and document.workspace_id = v_claim.workspace_id
    and document.data_room_id is not distinct from v_claim.data_room_id;

  delete from public.folders folder
  where folder.id = any(v_claim.folder_ids)
    and folder.workspace_id = v_claim.workspace_id
    and folder.data_room_id is not distinct from v_claim.data_room_id;

  update public.document_deletion_claims claim
  set
    status = 'completed',
    finalized_by = p_actor_id,
    deleted_document_ids = v_claim.document_ids,
    deleted_folder_ids = v_claim.folder_ids,
    completed_at = now()
  where claim.claim_token = p_claim_token
  returning * into v_claim;

  return jsonb_build_object(
    'documentIds', to_jsonb(v_claim.deleted_document_ids),
    'folderIds', to_jsonb(v_claim.deleted_folder_ids)
  );
end;
$$;

alter function public.document_artifact_candidate_payload(public.document_artifact_candidates) owner to postgres;
alter function public.register_document_artifact_candidate(uuid, uuid, uuid, text, uuid, text, text, text, uuid) owner to postgres;
alter function public.begin_document_artifact_upload(uuid) owner to postgres;
alter function public.finish_document_artifact_upload(uuid) owner to postgres;
alter function public.get_document_artifact_candidate(uuid) owner to postgres;
alter function public.mark_document_artifact_cleanup_failed(uuid, text) owner to postgres;
alter function public.acknowledge_document_artifact_cleanup(uuid) owner to postgres;
alter function public.publish_document_conversion_candidate(uuid, timestamptz) owner to postgres;
alter function public.publish_document_nda_candidate(uuid) owner to postgres;
alter function public.attach_document_artifact_candidates_to_deletion_claim() owner to postgres;
alter function public.delete_document_selection(uuid, uuid, uuid) owner to postgres;

revoke all on function public.document_artifact_candidate_payload(public.document_artifact_candidates) from public, anon, authenticated;
revoke all on function public.register_document_artifact_candidate(uuid, uuid, uuid, text, uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.register_document_artifact_candidate(uuid, uuid, uuid, text, uuid, text, text, text, uuid) to service_role;

revoke all on function public.begin_document_artifact_upload(uuid) from public, anon, authenticated;
grant execute on function public.begin_document_artifact_upload(uuid) to service_role;

revoke all on function public.finish_document_artifact_upload(uuid) from public, anon, authenticated;
grant execute on function public.finish_document_artifact_upload(uuid) to service_role;

revoke all on function public.get_document_artifact_candidate(uuid) from public, anon, authenticated;
grant execute on function public.get_document_artifact_candidate(uuid) to service_role;

revoke all on function public.mark_document_artifact_cleanup_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_document_artifact_cleanup_failed(uuid, text) to service_role;

revoke all on function public.acknowledge_document_artifact_cleanup(uuid) from public, anon, authenticated;
grant execute on function public.acknowledge_document_artifact_cleanup(uuid) to service_role;

revoke all on function public.publish_document_conversion_candidate(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.publish_document_conversion_candidate(uuid, timestamptz) to service_role;

revoke all on function public.publish_document_nda_candidate(uuid) from public, anon, authenticated;
grant execute on function public.publish_document_nda_candidate(uuid) to service_role;

revoke all on function public.attach_document_artifact_candidates_to_deletion_claim() from public, anon, authenticated;

revoke all on function public.delete_document_selection(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_document_selection(uuid, uuid, uuid) to service_role;
