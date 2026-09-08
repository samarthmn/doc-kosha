-- Keep the plan -> R2 -> finalize window stable with a durable deletion claim.
-- Resource mutations take the same transaction advisory locks as planning,
-- then fail while an overlapping claim is active. The claim survives storage
-- failures so any newly authorized editor can safely retry exact cleanup.

create table public.document_deletion_claims (
  claim_token uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  data_room_id uuid null,
  initiated_by uuid not null,
  finalized_by uuid null,
  explicit_document_ids uuid[] not null default '{}'::uuid[],
  explicit_folder_ids uuid[] not null default '{}'::uuid[],
  document_ids uuid[] not null default '{}'::uuid[],
  folder_ids uuid[] not null default '{}'::uuid[],
  objects jsonb not null default '[]'::jsonb,
  prefixes jsonb not null default '[]'::jsonb,
  processing_candidates jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'completed')),
  deleted_document_ids uuid[] null,
  deleted_folder_ids uuid[] null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  check (jsonb_typeof(objects) = 'array'),
  check (jsonb_typeof(prefixes) = 'array'),
  check (jsonb_typeof(processing_candidates) = 'array')
);

create index document_deletion_claims_exact_selection_idx
  on public.document_deletion_claims (
    workspace_id,
    data_room_id,
    explicit_document_ids,
    explicit_folder_ids,
    created_at desc
  );

create index document_deletion_claims_active_documents_idx
  on public.document_deletion_claims using gin (document_ids)
  where status = 'active';

create index document_deletion_claims_active_folders_idx
  on public.document_deletion_claims using gin (folder_ids)
  where status = 'active';

alter table public.document_deletion_claims enable row level security;
revoke all on table public.document_deletion_claims from public, anon, authenticated;
grant select, insert, update on table public.document_deletion_claims to service_role;

create or replace function public.lock_document_deletion_resources(
  p_document_ids uuid[],
  p_folder_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_resource_key text;
begin
  for v_resource_key in
    select resource.resource_key
    from (
      select 'document:' || selection.id::text as resource_key
      from unnest(coalesce(p_document_ids, '{}'::uuid[])) as selection(id)

      union

      select 'folder:' || selection.id::text as resource_key
      from unnest(coalesce(p_folder_ids, '{}'::uuid[])) as selection(id)
    ) resource
    order by resource.resource_key
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_resource_key, 0));
  end loop;
end;
$$;

create or replace function public.document_deletion_claim_plan(
  p_claim public.document_deletion_claims
) returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'claimToken', p_claim.claim_token,
    'documentIds', to_jsonb(p_claim.document_ids),
    'folderIds', to_jsonb(p_claim.folder_ids),
    'objects', p_claim.objects,
    'prefixes', p_claim.prefixes
  );
$$;

create or replace function public.enforce_document_deletion_claim_fence()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_document_ids uuid[] := '{}'::uuid[];
  v_folder_ids uuid[] := '{}'::uuid[];
  v_allowed_claim_token text := nullif(
    current_setting('app.document_deletion_claim_token', true),
    ''
  );
begin
  if tg_table_name = 'documents' then
    if tg_op = 'INSERT' then
      v_document_ids := array[new.id];
      v_folder_ids := array_remove(array[new.folder_id], null);
    elsif tg_op = 'DELETE' then
      v_document_ids := array[old.id];
      v_folder_ids := array_remove(array[old.folder_id], null);
    else
      v_document_ids := array_remove(array[old.id, new.id], null);
      v_folder_ids := array_remove(array[old.folder_id, new.folder_id], null);
    end if;
  elsif tg_table_name = 'folders' then
    if tg_op = 'INSERT' then
      v_folder_ids := array_remove(array[new.id, new.parent_folder_id], null);
    elsif tg_op = 'DELETE' then
      v_folder_ids := array_remove(array[old.id, old.parent_folder_id], null);
    else
      v_folder_ids := array_remove(
        array[old.id, new.id, old.parent_folder_id, new.parent_folder_id],
        null
      );
    end if;
  elsif tg_table_name in ('document_versions', 'nda_signatures') then
    if tg_op = 'INSERT' then
      v_document_ids := array_remove(array[new.document_id], null);
    elsif tg_op = 'DELETE' then
      v_document_ids := array_remove(array[old.document_id], null);
    else
      v_document_ids := array_remove(
        array[old.document_id, new.document_id],
        null
      );
    end if;
  else
    return coalesce(new, old);
  end if;

  perform public.lock_document_deletion_resources(
    v_document_ids,
    v_folder_ids
  );

  if exists (
    select 1
    from public.document_deletion_claims claim
    where claim.status = 'active'
      and (
        claim.document_ids && v_document_ids
        or claim.folder_ids && v_folder_ids
      )
      and claim.claim_token::text is distinct from v_allowed_claim_token
  ) then
    raise exception 'resource is claimed for deletion' using errcode = 'P0006';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists enforce_documents_deletion_claim on public.documents;
create trigger enforce_documents_deletion_claim
before insert or update or delete on public.documents
for each row execute function public.enforce_document_deletion_claim_fence();

drop trigger if exists enforce_folders_deletion_claim on public.folders;
create trigger enforce_folders_deletion_claim
before insert or update or delete on public.folders
for each row execute function public.enforce_document_deletion_claim_fence();

drop trigger if exists enforce_document_versions_deletion_claim on public.document_versions;
create trigger enforce_document_versions_deletion_claim
before insert or update or delete on public.document_versions
for each row execute function public.enforce_document_deletion_claim_fence();

drop trigger if exists enforce_nda_signatures_deletion_claim on public.nda_signatures;
create trigger enforce_nda_signatures_deletion_claim
before insert or update or delete on public.nda_signatures
for each row execute function public.enforce_document_deletion_claim_fence();

drop function if exists public.plan_document_selection_deletion(uuid, uuid, uuid[], uuid[]);
drop function if exists public.delete_document_selection(uuid, uuid, uuid[], uuid[]);

create or replace function public.plan_document_selection_deletion(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_data_room_id uuid default null,
  p_document_ids uuid[] default '{}'::uuid[],
  p_folder_ids uuid[] default '{}'::uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_document_ids uuid[];
  v_folder_ids uuid[];
  v_target_document_ids uuid[] := '{}'::uuid[];
  v_target_folder_ids uuid[] := '{}'::uuid[];
  v_next_document_ids uuid[];
  v_next_folder_ids uuid[];
  v_objects jsonb;
  v_prefixes jsonb;
  v_processing_candidates jsonb;
  v_claim_token uuid := gen_random_uuid();
  v_existing_claim public.document_deletion_claims%rowtype;
begin
  if p_actor_id is null then
    raise exception 'deletion actor is required' using errcode = '22023';
  end if;

  select coalesce(array_agg(selection.id order by selection.id), '{}'::uuid[])
  into v_document_ids
  from (
    select distinct id
    from unnest(coalesce(p_document_ids, '{}'::uuid[])) as requested(id)
  ) selection;

  select coalesce(array_agg(selection.id order by selection.id), '{}'::uuid[])
  into v_folder_ids
  from (
    select distinct id
    from unnest(coalesce(p_folder_ids, '{}'::uuid[])) as requested(id)
  ) selection;

  if cardinality(v_document_ids) = 0 and cardinality(v_folder_ids) = 0 then
    raise exception 'document selection is empty' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'document-deletion-selection:'
        || p_workspace_id::text
        || ':'
        || coalesce(p_data_room_id::text, 'workspace')
        || ':'
        || v_document_ids::text
        || ':'
        || v_folder_ids::text,
      0
    )
  );

  select claim.*
  into v_existing_claim
  from public.document_deletion_claims claim
  where claim.workspace_id = p_workspace_id
    and claim.data_room_id is not distinct from p_data_room_id
    and claim.explicit_document_ids = v_document_ids
    and claim.explicit_folder_ids = v_folder_ids
    and claim.status in ('active', 'completed')
  order by claim.created_at desc
  limit 1;

  if found then
    return public.document_deletion_claim_plan(v_existing_claim);
  end if;

  if exists (
    select 1
    from unnest(v_document_ids) as selection(id)
    where not exists (
      select 1
      from public.documents document
      where document.id = selection.id
        and document.workspace_id = p_workspace_id
        and document.data_room_id is not distinct from p_data_room_id
    )
  ) then
    raise exception 'document selection not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from unnest(v_folder_ids) as selection(id)
    where not exists (
      select 1
      from public.folders folder
      where folder.id = selection.id
        and folder.workspace_id = p_workspace_id
        and folder.data_room_id is not distinct from p_data_room_id
    )
  ) then
    raise exception 'folder selection not found' using errcode = 'P0002';
  end if;

  loop
    with recursive descendants(id) as (
      select folder.id
      from public.folders folder
      where folder.id = any(v_folder_ids)
        and folder.workspace_id = p_workspace_id
        and folder.data_room_id is not distinct from p_data_room_id

      union

      select child.id
      from public.folders child
      inner join descendants parent on child.parent_folder_id = parent.id
      where child.workspace_id = p_workspace_id
        and child.data_room_id is not distinct from p_data_room_id
    ),
    target_document_ids(id) as (
      select selection.id
      from unnest(v_document_ids) as selection(id)

      union

      select document.id
      from public.documents document
      inner join descendants folder on folder.id = document.folder_id
      where document.workspace_id = p_workspace_id
        and document.data_room_id is not distinct from p_data_room_id
    )
    select
      coalesce(
        (select array_agg(target.id order by target.id) from target_document_ids target),
        '{}'::uuid[]
      ),
      coalesce(
        (select array_agg(folder.id order by folder.id) from descendants folder),
        '{}'::uuid[]
      )
    into v_next_document_ids, v_next_folder_ids;

    perform public.lock_document_deletion_resources(
      v_next_document_ids,
      v_next_folder_ids
    );

    if v_target_document_ids = v_next_document_ids
      and v_target_folder_ids = v_next_folder_ids then
      exit;
    end if;

    v_target_document_ids := v_next_document_ids;
    v_target_folder_ids := v_next_folder_ids;
  end loop;

  if not (v_document_ids <@ v_target_document_ids) then
    raise exception 'document selection not found' using errcode = 'P0002';
  end if;
  if not (v_folder_ids <@ v_target_folder_ids) then
    raise exception 'folder selection not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.document_deletion_claims claim
    where claim.status = 'active'
      and (
        claim.document_ids && v_target_document_ids
        or claim.folder_ids && v_target_folder_ids
      )
  ) then
    raise exception 'document deletion overlaps an active claim' using errcode = 'P0003';
  end if;

  with target_documents as (
    select document.*
    from public.documents document
    where document.id = any(v_target_document_ids)
      and document.workspace_id = p_workspace_id
      and document.data_room_id is not distinct from p_data_room_id
  ),
  object_rows(logical_bucket, storage_path) as (
    select
      case when document.data_room_id is null then 'documents' else 'data-room' end,
      document.storage_path
    from target_documents document
    where document.storage_path is not null

    union

    select
      case when document.data_room_id is null then 'converted-documents' else 'converted-data-room' end,
      document.converted_storage_path
    from target_documents document
    where document.converted_storage_path is not null

    union

    select
      case when version.source_scope_data_room_id is null then 'documents' else 'data-room' end,
      version.storage_path
    from public.document_versions version
    where version.document_id = any(v_target_document_ids)
      and version.storage_path is not null

    union

    select
      case when version.source_scope_data_room_id is null then 'converted-documents' else 'converted-data-room' end,
      version.converted_storage_path
    from public.document_versions version
    where version.document_id = any(v_target_document_ids)
      and version.converted_storage_path is not null

    union

    select 'documents', signature.signed_pdf_path
    from public.nda_signatures signature
    where signature.document_id = any(v_target_document_ids)
      and signature.workspace_id = p_workspace_id
      and signature.signed_pdf_path is not null

    union

    select
      case when document.data_room_id is null then 'converted-documents' else 'converted-data-room' end,
      format(
        'workspaces/%s/conversion-attempts/%s/%s.pdf',
        p_workspace_id,
        document.id,
        document.conversion_claim_id
      )
    from target_documents document
    where document.conversion_claim_id is not null
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'logicalBucket', object.logical_bucket,
        'path', object.storage_path
      )
      order by object.logical_bucket, object.storage_path
    ),
    '[]'::jsonb
  )
  into v_objects
  from object_rows object;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'logicalBucket',
        case when document.data_room_id is null then 'converted-documents' else 'converted-data-room' end,
        'pathPrefix',
        format(
          'workspaces/%s/conversion-attempts/%s/',
          p_workspace_id,
          document.id
        )
      )
      order by document.id
    ),
    '[]'::jsonb
  )
  into v_prefixes
  from public.documents document
  where document.id = any(v_target_document_ids)
    and document.workspace_id = p_workspace_id
    and document.data_room_id is not distinct from p_data_room_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'documentId', document.id,
        'conversionClaimId', document.conversion_claim_id,
        'logicalBucket',
        case when document.data_room_id is null then 'converted-documents' else 'converted-data-room' end,
        'path',
        format(
          'workspaces/%s/conversion-attempts/%s/%s.pdf',
          p_workspace_id,
          document.id,
          document.conversion_claim_id
        )
      )
      order by document.id
    ),
    '[]'::jsonb
  )
  into v_processing_candidates
  from public.documents document
  where document.id = any(v_target_document_ids)
    and document.workspace_id = p_workspace_id
    and document.data_room_id is not distinct from p_data_room_id
    and document.conversion_claim_id is not null;

  insert into public.document_deletion_claims (
    claim_token,
    workspace_id,
    data_room_id,
    initiated_by,
    explicit_document_ids,
    explicit_folder_ids,
    document_ids,
    folder_ids,
    objects,
    prefixes,
    processing_candidates
  ) values (
    v_claim_token,
    p_workspace_id,
    p_data_room_id,
    p_actor_id,
    v_document_ids,
    v_folder_ids,
    v_target_document_ids,
    v_target_folder_ids,
    v_objects,
    v_prefixes,
    v_processing_candidates
  )
  returning * into v_existing_claim;

  return public.document_deletion_claim_plan(v_existing_claim);
end;
$$;

create or replace function public.get_document_deletion_claim_state(
  p_workspace_id uuid,
  p_document_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'claimToken', claim.claim_token,
    'status', claim.status,
    'documentIds', to_jsonb(claim.document_ids),
    'folderIds', to_jsonb(claim.folder_ids),
    'prefixes', claim.prefixes,
    'processingCandidates', claim.processing_candidates
  )
  from public.document_deletion_claims claim
  where claim.workspace_id = p_workspace_id
    and p_document_id = any(claim.document_ids)
  order by
    case when claim.status = 'active' then 0 else 1 end,
    claim.created_at desc
  limit 1;
$$;

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
  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);
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

alter function public.lock_document_deletion_resources(uuid[], uuid[]) owner to postgres;
alter function public.document_deletion_claim_plan(public.document_deletion_claims) owner to postgres;
alter function public.enforce_document_deletion_claim_fence() owner to postgres;
alter function public.plan_document_selection_deletion(uuid, uuid, uuid, uuid[], uuid[]) owner to postgres;
alter function public.get_document_deletion_claim_state(uuid, uuid) owner to postgres;
alter function public.delete_document_selection(uuid, uuid, uuid) owner to postgres;

revoke all on function public.lock_document_deletion_resources(uuid[], uuid[]) from public, anon, authenticated;
revoke all on function public.document_deletion_claim_plan(public.document_deletion_claims) from public, anon, authenticated;
revoke all on function public.enforce_document_deletion_claim_fence() from public, anon, authenticated;

revoke all on function public.plan_document_selection_deletion(uuid, uuid, uuid, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.plan_document_selection_deletion(uuid, uuid, uuid, uuid[], uuid[]) to service_role;

revoke all on function public.get_document_deletion_claim_state(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_document_deletion_claim_state(uuid, uuid) to service_role;

revoke all on function public.delete_document_selection(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_document_selection(uuid, uuid, uuid) to service_role;
