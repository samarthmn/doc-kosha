-- Plan every R2 artifact from authoritative document metadata, then finalize
-- only the exact IDs whose storage objects were successfully removed.

create or replace function public.plan_document_selection_deletion(
  p_workspace_id uuid,
  p_data_room_id uuid default null,
  p_document_ids uuid[] default '{}'::uuid[],
  p_folder_ids uuid[] default '{}'::uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document_ids uuid[];
  v_folder_ids uuid[];
  v_plan jsonb;
begin
  select coalesce(array_agg(distinct selection.id), '{}'::uuid[])
  into v_document_ids
  from unnest(coalesce(p_document_ids, '{}'::uuid[])) as selection(id);

  select coalesce(array_agg(distinct selection.id), '{}'::uuid[])
  into v_folder_ids
  from unnest(coalesce(p_folder_ids, '{}'::uuid[])) as selection(id);

  if cardinality(v_document_ids) = 0 and cardinality(v_folder_ids) = 0 then
    raise exception 'document selection is empty' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_document_ids) as selection(id)
    where not exists (
      select 1
      from public.documents d
      where d.id = selection.id
        and d.workspace_id = p_workspace_id
        and d.data_room_id is not distinct from p_data_room_id
    )
  ) then
    raise exception 'document selection not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from unnest(v_folder_ids) as selection(id)
    where not exists (
      select 1
      from public.folders f
      where f.id = selection.id
        and f.workspace_id = p_workspace_id
        and f.data_room_id is not distinct from p_data_room_id
    )
  ) then
    raise exception 'folder selection not found' using errcode = 'P0002';
  end if;

  with recursive descendants(id) as (
    select f.id
    from public.folders f
    where f.id = any(v_folder_ids)
      and f.workspace_id = p_workspace_id
      and f.data_room_id is not distinct from p_data_room_id

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

    select d.id
    from public.documents d
    inner join descendants folder on folder.id = d.folder_id
    where d.workspace_id = p_workspace_id
      and d.data_room_id is not distinct from p_data_room_id
  ),
  target_documents as (
    select d.*
    from public.documents d
    inner join target_document_ids target on target.id = d.id
    where d.workspace_id = p_workspace_id
      and d.data_room_id is not distinct from p_data_room_id
  ),
  object_rows(logical_bucket, storage_path) as (
    select
      case when d.data_room_id is null then 'documents' else 'data-room' end,
      d.storage_path
    from target_documents d
    where d.storage_path is not null

    union

    select
      case when d.data_room_id is null then 'converted-documents' else 'converted-data-room' end,
      d.converted_storage_path
    from target_documents d
    where d.converted_storage_path is not null

    union

    select
      case when dv.source_scope_data_room_id is null then 'documents' else 'data-room' end,
      dv.storage_path
    from public.document_versions dv
    inner join target_document_ids target on target.id = dv.document_id
    where dv.storage_path is not null

    union

    select
      case when dv.source_scope_data_room_id is null then 'converted-documents' else 'converted-data-room' end,
      dv.converted_storage_path
    from public.document_versions dv
    inner join target_document_ids target on target.id = dv.document_id
    where dv.converted_storage_path is not null

    union

    select 'documents', signature.signed_pdf_path
    from public.nda_signatures signature
    inner join target_document_ids target on target.id = signature.document_id
    where signature.workspace_id = p_workspace_id
      and signature.signed_pdf_path is not null
  ),
  prefix_rows(logical_bucket, path_prefix) as (
    select
      case when d.data_room_id is null then 'converted-documents' else 'converted-data-room' end,
      format(
        'workspaces/%s/conversion-attempts/%s/',
        p_workspace_id,
        d.id
      )
    from target_documents d
  )
  select jsonb_build_object(
    'documentIds', coalesce(
      (
        select jsonb_agg(target.id order by target.id)
        from target_document_ids target
      ),
      '[]'::jsonb
    ),
    'folderIds', coalesce(
      (
        select jsonb_agg(folder.id order by folder.id)
        from descendants folder
      ),
      '[]'::jsonb
    ),
    'objects', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'logicalBucket', object.logical_bucket,
            'path', object.storage_path
          )
          order by object.logical_bucket, object.storage_path
        )
        from object_rows object
      ),
      '[]'::jsonb
    ),
    'prefixes', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'logicalBucket', prefix.logical_bucket,
            'pathPrefix', prefix.path_prefix
          )
          order by prefix.logical_bucket, prefix.path_prefix
        )
        from prefix_rows prefix
      ),
      '[]'::jsonb
    )
  )
  into v_plan;

  return v_plan;
end;
$$;

create or replace function public.delete_document_selection(
  p_workspace_id uuid,
  p_data_room_id uuid default null,
  p_document_ids uuid[] default '{}'::uuid[],
  p_folder_ids uuid[] default '{}'::uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document_ids uuid[];
  v_folder_ids uuid[];
  v_deleted_document_ids uuid[];
  v_deleted_folder_ids uuid[];
begin
  select coalesce(array_agg(distinct selection.id), '{}'::uuid[])
  into v_document_ids
  from unnest(coalesce(p_document_ids, '{}'::uuid[])) as selection(id);

  select coalesce(array_agg(distinct selection.id), '{}'::uuid[])
  into v_folder_ids
  from unnest(coalesce(p_folder_ids, '{}'::uuid[])) as selection(id);

  if cardinality(v_document_ids) = 0 and cardinality(v_folder_ids) = 0 then
    raise exception 'document selection is empty' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_document_ids) as selection(id)
    where not exists (
      select 1
      from public.documents d
      where d.id = selection.id
        and d.workspace_id = p_workspace_id
        and d.data_room_id is not distinct from p_data_room_id
    )
  ) then
    raise exception 'document selection not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from unnest(v_folder_ids) as selection(id)
    where not exists (
      select 1
      from public.folders f
      where f.id = selection.id
        and f.workspace_id = p_workspace_id
        and f.data_room_id is not distinct from p_data_room_id
    )
  ) then
    raise exception 'folder selection not found' using errcode = 'P0002';
  end if;

  with deleted_documents as (
    delete from public.documents
    where id = any(v_document_ids)
      and workspace_id = p_workspace_id
      and data_room_id is not distinct from p_data_room_id
    returning id
  )
  select coalesce(array_agg(id order by id), '{}'::uuid[])
  into v_deleted_document_ids
  from deleted_documents;

  with deleted_folders as (
    delete from public.folders
    where id = any(v_folder_ids)
      and workspace_id = p_workspace_id
      and data_room_id is not distinct from p_data_room_id
    returning id
  )
  select coalesce(array_agg(id order by id), '{}'::uuid[])
  into v_deleted_folder_ids
  from deleted_folders;

  return jsonb_build_object(
    'documentIds', to_jsonb(v_deleted_document_ids),
    'folderIds', to_jsonb(v_deleted_folder_ids)
  );
end;
$$;

alter function public.plan_document_selection_deletion(uuid, uuid, uuid[], uuid[]) owner to postgres;
alter function public.delete_document_selection(uuid, uuid, uuid[], uuid[]) owner to postgres;

revoke all on function public.plan_document_selection_deletion(uuid, uuid, uuid[], uuid[]) from public;
revoke all on function public.plan_document_selection_deletion(uuid, uuid, uuid[], uuid[]) from anon, authenticated;
grant execute on function public.plan_document_selection_deletion(uuid, uuid, uuid[], uuid[]) to service_role;

revoke all on function public.delete_document_selection(uuid, uuid, uuid[], uuid[]) from public;
revoke all on function public.delete_document_selection(uuid, uuid, uuid[], uuid[]) from anon, authenticated;
grant execute on function public.delete_document_selection(uuid, uuid, uuid[], uuid[]) to service_role;
