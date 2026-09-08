set search_path = public, auth;

create or replace function public.can_create_data_room(ws uuid)
returns boolean
language sql
stable
as $$
  select
    public.workspace_has_entitlement(ws)
    and (
      public.has_workspace_role(ws, array['owner'])
      or (
        auth.uid() is not null
        and exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = ws
            and wm.user_id = auth.uid()
            and wm.data_rooms_access_all = 'editor'::public.access_level
        )
      )
    );
$$;

drop policy if exists data_rooms_insert_editor on public.data_rooms;
create policy data_rooms_insert_editor
on public.data_rooms
for insert
with check (
  public.can_create_data_room(workspace_id)
);

create or replace function public.delete_data_room_cascade(
  p_workspace_id uuid,
  p_data_room_id uuid
) returns table (
  logical_bucket text,
  storage_path text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_exists boolean;
begin
  select exists (
    select 1
    from public.data_rooms dr
    where dr.id = p_data_room_id
      and dr.workspace_id = p_workspace_id
  )
  into v_room_exists;

  if not v_room_exists then
    raise exception 'data room not found' using errcode = 'P0002';
  end if;

  return query
  with room_documents as (
    select d.id, d.storage_path, d.converted_storage_path
    from public.documents d
    where d.workspace_id = p_workspace_id
      and d.data_room_id = p_data_room_id
  ),
  storage_paths as (
    select 'data-room'::text as logical_bucket, d.storage_path
    from room_documents d
    where d.storage_path is not null

    union

    select 'converted-data-room'::text as logical_bucket, d.converted_storage_path
    from room_documents d
    where d.converted_storage_path is not null

    union

    select 'data-room'::text as logical_bucket, dv.storage_path
    from public.document_versions dv
    inner join room_documents d on d.id = dv.document_id
    where dv.storage_path is not null

    union

    select 'converted-data-room'::text as logical_bucket, dv.converted_storage_path
    from public.document_versions dv
    inner join room_documents d on d.id = dv.document_id
    where dv.converted_storage_path is not null
  ),
  deleted_room as (
    delete from public.data_rooms dr
    where dr.id = p_data_room_id
      and dr.workspace_id = p_workspace_id
    returning dr.id
  )
  select sp.logical_bucket, sp.storage_path
  from storage_paths sp
  where exists (select 1 from deleted_room);
end;
$$;

alter function public.can_create_data_room(uuid) owner to postgres;
alter function public.delete_data_room_cascade(uuid, uuid) owner to postgres;

revoke all on function public.can_create_data_room(uuid) from public;
grant execute on function public.can_create_data_room(uuid) to authenticated, service_role;

revoke all on function public.delete_data_room_cascade(uuid, uuid) from public;
grant execute on function public.delete_data_room_cascade(uuid, uuid) to service_role;
