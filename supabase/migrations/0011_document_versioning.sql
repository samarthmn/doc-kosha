-- Document versioning: per-workspace retention settings + historical versions

create table if not exists public.workspace_document_version_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  max_previous_versions int not null default 1 check (max_previous_versions between 1 and 10),
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  source_scope_data_room_id uuid null references public.data_rooms(id) on delete set null,
  source_folder_id uuid null references public.folders(id) on delete set null,
  title text not null,
  file_type text not null,
  storage_path text not null,
  converted_storage_path text null,
  conversion_status text not null,
  size_bytes bigint not null,
  created_by uuid null,
  original_created_at timestamptz null,
  replaced_at timestamptz not null default now(),
  state text not null check (state in ('available', 'pruned')) default 'available',
  counts_towards_storage boolean not null default false,
  is_free_included boolean not null default false,
  pruned_at timestamptz null,
  pruned_reason text null check (pruned_reason in ('limit_auto', 'limit_decrease', 'manual_cleanup')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_document_versions_document_replaced_desc
  on public.document_versions(document_id, replaced_at desc);

create index if not exists idx_document_versions_workspace_state_replaced_desc
  on public.document_versions(workspace_id, state, replaced_at desc);

create index if not exists idx_document_versions_pruned_cleanup
  on public.document_versions(pruned_at)
  where state = 'pruned';

create or replace function public.handle_document_version_storage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_size bigint := coalesce(old.size_bytes, 0);
  v_new_size bigint := coalesce(new.size_bytes, 0);
  v_old_counted bigint := case
    when tg_op <> 'INSERT'
      and old.state = 'available'
      and old.counts_towards_storage
    then v_old_size
    else 0
  end;
  v_new_counted bigint := case
    when tg_op <> 'DELETE'
      and new.state = 'available'
      and new.counts_towards_storage
    then v_new_size
    else 0
  end;
begin
  if tg_op = 'INSERT' then
    if v_new_counted <> 0 then
      perform public.apply_workspace_storage_delta(new.workspace_id, v_new_counted);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if v_old_counted <> 0 then
      perform public.apply_workspace_storage_delta(old.workspace_id, -v_old_counted);
    end if;
    return old;
  else
    if new.workspace_id <> old.workspace_id then
      if v_old_counted <> 0 then
        perform public.apply_workspace_storage_delta(old.workspace_id, -v_old_counted);
      end if;
      if v_new_counted <> 0 then
        perform public.apply_workspace_storage_delta(new.workspace_id, v_new_counted);
      end if;
    else
      perform public.apply_workspace_storage_delta(new.workspace_id, v_new_counted - v_old_counted);
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists trg_document_versions_workspace_storage on public.document_versions;
create trigger trg_document_versions_workspace_storage
after insert or delete or update on public.document_versions
for each row execute function public.handle_document_version_storage_change();

drop trigger if exists workspace_document_version_settings_set_timestamp on public.workspace_document_version_settings;
create trigger workspace_document_version_settings_set_timestamp
before update on public.workspace_document_version_settings
for each row execute function public.tg_set_timestamp();

drop trigger if exists document_versions_set_timestamp on public.document_versions;
create trigger document_versions_set_timestamp
before update on public.document_versions
for each row execute function public.tg_set_timestamp();

alter table public.workspace_document_version_settings enable row level security;
alter table public.document_versions enable row level security;

grant all on table public.workspace_document_version_settings to postgres, service_role;
grant all on table public.document_versions to postgres, service_role;
grant select on table public.workspace_document_version_settings to authenticated;
grant select on table public.document_versions to authenticated;
grant insert, update, delete on table public.workspace_document_version_settings to authenticated;
grant insert, update, delete on table public.document_versions to authenticated;

drop policy if exists workspace_document_version_settings_select on public.workspace_document_version_settings;
create policy workspace_document_version_settings_select
on public.workspace_document_version_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_document_version_settings.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists workspace_document_version_settings_write on public.workspace_document_version_settings;
create policy workspace_document_version_settings_write
on public.workspace_document_version_settings
for all
to authenticated
using (
  exists (
    select 1
    from public.workspaces w
    where w.id = workspace_document_version_settings.workspace_id
      and w.created_by = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workspaces w
    where w.id = workspace_document_version_settings.workspace_id
      and w.created_by = auth.uid()
  )
);

drop policy if exists document_versions_select on public.document_versions;
create policy document_versions_select
on public.document_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = document_versions.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists document_versions_write on public.document_versions;
create policy document_versions_write
on public.document_versions
for all
to authenticated
using (
  public.can_edit_workspace_documents(document_versions.workspace_id)
  or (
    document_versions.source_scope_data_room_id is not null
    and public.can_edit_data_room(
      document_versions.workspace_id,
      document_versions.source_scope_data_room_id
    )
  )
)
with check (
  public.can_edit_workspace_documents(document_versions.workspace_id)
  or (
    document_versions.source_scope_data_room_id is not null
    and public.can_edit_data_room(
      document_versions.workspace_id,
      document_versions.source_scope_data_room_id
    )
  )
);

insert into public.workspace_document_version_settings (workspace_id, max_previous_versions)
select w.id, 1
from public.workspaces w
on conflict (workspace_id) do nothing;
