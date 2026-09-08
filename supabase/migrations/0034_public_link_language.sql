-- Public link language defaults + per-link override

create table if not exists public.workspace_public_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  default_public_language text not null default 'en' check (default_public_language in ('en', 'fr')),
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.links
  add column if not exists public_language_override text null
  check (public_language_override in ('en', 'fr'));

drop trigger if exists workspace_public_settings_set_timestamp on public.workspace_public_settings;
create trigger workspace_public_settings_set_timestamp
before update on public.workspace_public_settings
for each row execute function public.tg_set_timestamp();

alter table public.workspace_public_settings enable row level security;

grant all on table public.workspace_public_settings to postgres, service_role;
grant select on table public.workspace_public_settings to authenticated;
grant insert, update, delete on table public.workspace_public_settings to authenticated;

drop policy if exists workspace_public_settings_select on public.workspace_public_settings;
create policy workspace_public_settings_select
on public.workspace_public_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_public_settings.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists workspace_public_settings_write on public.workspace_public_settings;
create policy workspace_public_settings_write
on public.workspace_public_settings
for all
to authenticated
using (
  exists (
    select 1
    from public.workspaces w
    where w.id = workspace_public_settings.workspace_id
      and w.created_by = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workspaces w
    where w.id = workspace_public_settings.workspace_id
      and w.created_by = auth.uid()
  )
);

insert into public.workspace_public_settings (workspace_id, default_public_language)
select w.id, 'en'
from public.workspaces w
on conflict (workspace_id) do nothing;
