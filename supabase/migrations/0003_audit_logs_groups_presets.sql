-- Groups, link access rules (allow + block + groups), link presets, and internal audit events.

create table if not exists public.workspace_user_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_user_groups_name_check check (
    char_length(trim(both from name)) > 0
    and char_length(name) <= 120
  )
);

create unique index if not exists workspace_user_groups_workspace_name_ci
  on public.workspace_user_groups (workspace_id, lower(name));

create unique index if not exists workspace_user_groups_id_workspace
  on public.workspace_user_groups (id, workspace_id);

create table if not exists public.workspace_user_group_emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  group_id uuid not null references public.workspace_user_groups(id) on delete cascade,
  email text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint workspace_user_group_emails_email_normalized check (
    length(trim(both from email)) > 0 and email = lower(email)
  )
);

alter table public.workspace_user_group_emails
  drop constraint if exists workspace_user_group_emails_group_workspace_fkey;

alter table public.workspace_user_group_emails
  add constraint workspace_user_group_emails_group_workspace_fkey
  foreign key (group_id, workspace_id)
  references public.workspace_user_groups(id, workspace_id)
  on delete cascade;

create unique index if not exists workspace_user_group_emails_group_email
  on public.workspace_user_group_emails (group_id, email);

create index if not exists workspace_user_group_emails_workspace_email
  on public.workspace_user_group_emails (workspace_id, email);

create table if not exists public.link_blocked_emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  link_id uuid not null references public.links(id) on delete cascade,
  email text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint link_blocked_emails_email_normalized check (
    length(trim(both from email)) > 0 and email = lower(email)
  )
);

create unique index if not exists uniq_link_blocked_emails_link_email
  on public.link_blocked_emails (link_id, email);

create index if not exists idx_link_blocked_emails_workspace
  on public.link_blocked_emails (workspace_id);

create table if not exists public.link_allowed_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  link_id uuid not null references public.links(id) on delete cascade,
  group_id uuid not null references public.workspace_user_groups(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.link_allowed_groups
  drop constraint if exists link_allowed_groups_group_workspace_fkey;

alter table public.link_allowed_groups
  add constraint link_allowed_groups_group_workspace_fkey
  foreign key (group_id, workspace_id)
  references public.workspace_user_groups(id, workspace_id)
  on delete cascade;

create unique index if not exists uniq_link_allowed_groups_link_group
  on public.link_allowed_groups (link_id, group_id);

create index if not exists idx_link_allowed_groups_link
  on public.link_allowed_groups (link_id);

create table if not exists public.link_blocked_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  link_id uuid not null references public.links(id) on delete cascade,
  group_id uuid not null references public.workspace_user_groups(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.link_blocked_groups
  drop constraint if exists link_blocked_groups_group_workspace_fkey;

alter table public.link_blocked_groups
  add constraint link_blocked_groups_group_workspace_fkey
  foreign key (group_id, workspace_id)
  references public.workspace_user_groups(id, workspace_id)
  on delete cascade;

create unique index if not exists uniq_link_blocked_groups_link_group
  on public.link_blocked_groups (link_id, group_id);

create index if not exists idx_link_blocked_groups_link
  on public.link_blocked_groups (link_id);

create table if not exists public.link_presets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  settings_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint link_presets_name_check check (
    char_length(trim(both from name)) > 0
    and char_length(name) <= 120
  )
);

create unique index if not exists link_presets_workspace_name_ci
  on public.link_presets (workspace_id, lower(name));

create unique index if not exists link_presets_id_workspace
  on public.link_presets (id, workspace_id);

create table if not exists public.link_preset_allowed_emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  preset_id uuid not null references public.link_presets(id) on delete cascade,
  email text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint link_preset_allowed_emails_email_normalized check (
    length(trim(both from email)) > 0 and email = lower(email)
  )
);

alter table public.link_preset_allowed_emails
  drop constraint if exists link_preset_allowed_emails_preset_workspace_fkey;

alter table public.link_preset_allowed_emails
  add constraint link_preset_allowed_emails_preset_workspace_fkey
  foreign key (preset_id, workspace_id)
  references public.link_presets(id, workspace_id)
  on delete cascade;

create unique index if not exists link_preset_allowed_emails_preset_email
  on public.link_preset_allowed_emails (preset_id, email);

create table if not exists public.link_preset_blocked_emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  preset_id uuid not null references public.link_presets(id) on delete cascade,
  email text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint link_preset_blocked_emails_email_normalized check (
    length(trim(both from email)) > 0 and email = lower(email)
  )
);

alter table public.link_preset_blocked_emails
  drop constraint if exists link_preset_blocked_emails_preset_workspace_fkey;

alter table public.link_preset_blocked_emails
  add constraint link_preset_blocked_emails_preset_workspace_fkey
  foreign key (preset_id, workspace_id)
  references public.link_presets(id, workspace_id)
  on delete cascade;

create unique index if not exists link_preset_blocked_emails_preset_email
  on public.link_preset_blocked_emails (preset_id, email);

create table if not exists public.link_preset_allowed_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  preset_id uuid not null references public.link_presets(id) on delete cascade,
  group_id uuid not null references public.workspace_user_groups(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.link_preset_allowed_groups
  drop constraint if exists link_preset_allowed_groups_preset_workspace_fkey;

alter table public.link_preset_allowed_groups
  add constraint link_preset_allowed_groups_preset_workspace_fkey
  foreign key (preset_id, workspace_id)
  references public.link_presets(id, workspace_id)
  on delete cascade;

alter table public.link_preset_allowed_groups
  drop constraint if exists link_preset_allowed_groups_group_workspace_fkey;

alter table public.link_preset_allowed_groups
  add constraint link_preset_allowed_groups_group_workspace_fkey
  foreign key (group_id, workspace_id)
  references public.workspace_user_groups(id, workspace_id)
  on delete cascade;

create unique index if not exists link_preset_allowed_groups_preset_group
  on public.link_preset_allowed_groups (preset_id, group_id);

create table if not exists public.link_preset_blocked_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  preset_id uuid not null references public.link_presets(id) on delete cascade,
  group_id uuid not null references public.workspace_user_groups(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.link_preset_blocked_groups
  drop constraint if exists link_preset_blocked_groups_preset_workspace_fkey;

alter table public.link_preset_blocked_groups
  add constraint link_preset_blocked_groups_preset_workspace_fkey
  foreign key (preset_id, workspace_id)
  references public.link_presets(id, workspace_id)
  on delete cascade;

alter table public.link_preset_blocked_groups
  drop constraint if exists link_preset_blocked_groups_group_workspace_fkey;

alter table public.link_preset_blocked_groups
  add constraint link_preset_blocked_groups_group_workspace_fkey
  foreign key (group_id, workspace_id)
  references public.workspace_user_groups(id, workspace_id)
  on delete cascade;

create unique index if not exists link_preset_blocked_groups_preset_group
  on public.link_preset_blocked_groups (preset_id, group_id);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text,
  actor_email text,
  event_type text not null,
  resource_type text not null,
  resource_id uuid,
  data_room_id uuid references public.data_rooms(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_events_event_type_check check (
    char_length(trim(both from event_type)) > 0
  ),
  constraint audit_events_resource_type_check check (
    char_length(trim(both from resource_type)) > 0
  )
);

create index if not exists audit_events_workspace_created_at_idx
  on public.audit_events (workspace_id, created_at desc);

create index if not exists audit_events_document_created_at_idx
  on public.audit_events (document_id, created_at desc);

create index if not exists audit_events_data_room_created_at_idx
  on public.audit_events (data_room_id, created_at desc);

create or replace function public.touch_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspace_user_groups_touch_updated_at on public.workspace_user_groups;
create trigger workspace_user_groups_touch_updated_at
before update on public.workspace_user_groups
for each row execute function public.touch_updated_at_column();

drop trigger if exists link_presets_touch_updated_at on public.link_presets;
create trigger link_presets_touch_updated_at
before update on public.link_presets
for each row execute function public.touch_updated_at_column();

create or replace function public.record_internal_audit_event(
  p_workspace_id uuid,
  p_event_type text,
  p_resource_type text,
  p_resource_id uuid,
  p_data_room_id uuid default null,
  p_document_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text := null;
  v_actor_email text := null;
  v_event_type text := lower(trim(both from coalesce(p_event_type, '')));
  v_resource_type text := lower(trim(both from coalesce(p_resource_type, '')));
begin
  if p_workspace_id is null then
    raise exception 'workspace_id is required';
  end if;

  if v_actor_id is null then
    raise exception 'authenticated user required';
  end if;

  if not public.has_workspace_role(p_workspace_id, array['owner', 'editor']) then
    raise exception 'forbidden';
  end if;

  if v_event_type not in (
    'document_viewed',
    'document_downloaded',
    'data_room_opened',
    'data_room_zip_downloaded'
  ) then
    raise exception 'unsupported audit event type';
  end if;

  if v_resource_type not in ('document', 'data_room') then
    raise exception 'unsupported audit resource type';
  end if;

  select p.full_name, u.email
    into v_actor_name, v_actor_email
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = v_actor_id;

  insert into public.audit_events (
    workspace_id,
    actor_user_id,
    actor_name,
    actor_email,
    event_type,
    resource_type,
    resource_id,
    data_room_id,
    document_id,
    metadata
  )
  values (
    p_workspace_id,
    v_actor_id,
    v_actor_name,
    v_actor_email,
    v_event_type,
    v_resource_type,
    p_resource_id,
    p_data_room_id,
    p_document_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.record_audit_event_from_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text := null;
  v_actor_email text := null;
  v_workspace_id uuid := null;
  v_resource_id uuid := null;
  v_data_room_id uuid := null;
  v_document_id uuid := null;
  v_link_id uuid := null;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new_sanitized jsonb := null;
  v_old_sanitized jsonb := null;
begin
  if v_actor_id is not null then
    select p.full_name, u.email
      into v_actor_name, v_actor_email
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.id = v_actor_id;
  end if;

  if v_new is not null then
    v_new_sanitized := v_new - 'password_hash' - 'nda_template_snapshot_html';
  end if;
  if v_old is not null then
    v_old_sanitized := v_old - 'password_hash' - 'nda_template_snapshot_html';
  end if;

  case tg_table_name
    when 'documents' then
      v_workspace_id := coalesce((v_new->>'workspace_id')::uuid, (v_old->>'workspace_id')::uuid);
      v_resource_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid);
      v_document_id := v_resource_id;
      v_data_room_id := coalesce((v_new->>'data_room_id')::uuid, (v_old->>'data_room_id')::uuid);
    when 'data_rooms' then
      v_workspace_id := coalesce((v_new->>'workspace_id')::uuid, (v_old->>'workspace_id')::uuid);
      v_resource_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid);
      v_data_room_id := v_resource_id;
    when 'folders' then
      v_workspace_id := coalesce((v_new->>'workspace_id')::uuid, (v_old->>'workspace_id')::uuid);
      v_resource_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid);
      v_data_room_id := coalesce((v_new->>'data_room_id')::uuid, (v_old->>'data_room_id')::uuid);
    when 'data_room_documents' then
      v_data_room_id := coalesce((v_new->>'data_room_id')::uuid, (v_old->>'data_room_id')::uuid);
      v_document_id := coalesce((v_new->>'document_id')::uuid, (v_old->>'document_id')::uuid);
      v_resource_id := v_data_room_id;
      select dr.workspace_id into v_workspace_id
      from public.data_rooms dr
      where dr.id = v_data_room_id;
    when 'links' then
      v_workspace_id := coalesce((v_new->>'workspace_id')::uuid, (v_old->>'workspace_id')::uuid);
      v_resource_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid);
      v_document_id := coalesce((v_new->>'document_id')::uuid, (v_old->>'document_id')::uuid);
      v_data_room_id := coalesce((v_new->>'data_room_id')::uuid, (v_old->>'data_room_id')::uuid);
    when 'link_allowed_emails' then
      v_workspace_id := coalesce((v_new->>'workspace_id')::uuid, (v_old->>'workspace_id')::uuid);
      v_link_id := coalesce((v_new->>'link_id')::uuid, (v_old->>'link_id')::uuid);
      v_resource_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid, v_link_id);
    when 'link_blocked_emails' then
      v_workspace_id := coalesce((v_new->>'workspace_id')::uuid, (v_old->>'workspace_id')::uuid);
      v_link_id := coalesce((v_new->>'link_id')::uuid, (v_old->>'link_id')::uuid);
      v_resource_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid, v_link_id);
    when 'link_allowed_groups' then
      v_workspace_id := coalesce((v_new->>'workspace_id')::uuid, (v_old->>'workspace_id')::uuid);
      v_link_id := coalesce((v_new->>'link_id')::uuid, (v_old->>'link_id')::uuid);
      v_resource_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid, v_link_id);
    when 'link_blocked_groups' then
      v_workspace_id := coalesce((v_new->>'workspace_id')::uuid, (v_old->>'workspace_id')::uuid);
      v_link_id := coalesce((v_new->>'link_id')::uuid, (v_old->>'link_id')::uuid);
      v_resource_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid, v_link_id);
    when 'workspace_user_groups' then
      v_workspace_id := coalesce((v_new->>'workspace_id')::uuid, (v_old->>'workspace_id')::uuid);
      v_resource_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid);
    when 'workspace_user_group_emails' then
      v_workspace_id := coalesce((v_new->>'workspace_id')::uuid, (v_old->>'workspace_id')::uuid);
      v_resource_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid, (v_new->>'group_id')::uuid, (v_old->>'group_id')::uuid);
    when 'link_presets' then
      v_workspace_id := coalesce((v_new->>'workspace_id')::uuid, (v_old->>'workspace_id')::uuid);
      v_resource_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid);
    when 'link_preset_allowed_emails' then
      v_workspace_id := coalesce((v_new->>'workspace_id')::uuid, (v_old->>'workspace_id')::uuid);
      v_resource_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid, (v_new->>'preset_id')::uuid, (v_old->>'preset_id')::uuid);
    when 'link_preset_blocked_emails' then
      v_workspace_id := coalesce((v_new->>'workspace_id')::uuid, (v_old->>'workspace_id')::uuid);
      v_resource_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid, (v_new->>'preset_id')::uuid, (v_old->>'preset_id')::uuid);
    when 'link_preset_allowed_groups' then
      v_workspace_id := coalesce((v_new->>'workspace_id')::uuid, (v_old->>'workspace_id')::uuid);
      v_resource_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid, (v_new->>'preset_id')::uuid, (v_old->>'preset_id')::uuid);
    when 'link_preset_blocked_groups' then
      v_workspace_id := coalesce((v_new->>'workspace_id')::uuid, (v_old->>'workspace_id')::uuid);
      v_resource_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid, (v_new->>'preset_id')::uuid, (v_old->>'preset_id')::uuid);
    else
      return coalesce(new, old);
  end case;

  if v_link_id is not null then
    select l.document_id, l.data_room_id
      into v_document_id, v_data_room_id
    from public.links l
    where l.id = v_link_id;
  end if;

  if v_workspace_id is null then
    return coalesce(new, old);
  end if;

  insert into public.audit_events (
    workspace_id,
    actor_user_id,
    actor_name,
    actor_email,
    event_type,
    resource_type,
    resource_id,
    data_room_id,
    document_id,
    metadata
  )
  values (
    v_workspace_id,
    v_actor_id,
    v_actor_name,
    v_actor_email,
    lower(tg_op),
    tg_table_name,
    v_resource_id,
    v_data_room_id,
    v_document_id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'table', tg_table_name,
        'operation', lower(tg_op),
        'new', v_new_sanitized,
        'old', v_old_sanitized
      )
    )
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_documents_trigger on public.documents;
create trigger audit_documents_trigger
after insert or update or delete on public.documents
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_data_rooms_trigger on public.data_rooms;
create trigger audit_data_rooms_trigger
after insert or update or delete on public.data_rooms
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_folders_trigger on public.folders;
create trigger audit_folders_trigger
after insert or update or delete on public.folders
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_data_room_documents_trigger on public.data_room_documents;
create trigger audit_data_room_documents_trigger
after insert or update or delete on public.data_room_documents
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_links_trigger on public.links;
create trigger audit_links_trigger
after insert or update or delete on public.links
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_link_allowed_emails_trigger on public.link_allowed_emails;
create trigger audit_link_allowed_emails_trigger
after insert or update or delete on public.link_allowed_emails
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_link_blocked_emails_trigger on public.link_blocked_emails;
create trigger audit_link_blocked_emails_trigger
after insert or update or delete on public.link_blocked_emails
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_link_allowed_groups_trigger on public.link_allowed_groups;
create trigger audit_link_allowed_groups_trigger
after insert or update or delete on public.link_allowed_groups
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_link_blocked_groups_trigger on public.link_blocked_groups;
create trigger audit_link_blocked_groups_trigger
after insert or update or delete on public.link_blocked_groups
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_workspace_user_groups_trigger on public.workspace_user_groups;
create trigger audit_workspace_user_groups_trigger
after insert or update or delete on public.workspace_user_groups
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_workspace_user_group_emails_trigger on public.workspace_user_group_emails;
create trigger audit_workspace_user_group_emails_trigger
after insert or update or delete on public.workspace_user_group_emails
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_link_presets_trigger on public.link_presets;
create trigger audit_link_presets_trigger
after insert or update or delete on public.link_presets
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_link_preset_allowed_emails_trigger on public.link_preset_allowed_emails;
create trigger audit_link_preset_allowed_emails_trigger
after insert or update or delete on public.link_preset_allowed_emails
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_link_preset_blocked_emails_trigger on public.link_preset_blocked_emails;
create trigger audit_link_preset_blocked_emails_trigger
after insert or update or delete on public.link_preset_blocked_emails
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_link_preset_allowed_groups_trigger on public.link_preset_allowed_groups;
create trigger audit_link_preset_allowed_groups_trigger
after insert or update or delete on public.link_preset_allowed_groups
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_link_preset_blocked_groups_trigger on public.link_preset_blocked_groups;
create trigger audit_link_preset_blocked_groups_trigger
after insert or update or delete on public.link_preset_blocked_groups
for each row execute function public.record_audit_event_from_trigger();

-- Atomic replace helpers (prevents partial state on failures)
create or replace function public.replace_link_allowlist_rules(
  p_workspace_id uuid,
  p_link_id uuid,
  p_allowed_emails text[] default array[]::text[],
  p_blocked_emails text[] default array[]::text[],
  p_allowed_group_ids uuid[] default array[]::uuid[],
  p_blocked_group_ids uuid[] default array[]::uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if p_workspace_id is null then
    raise exception 'workspace_id is required';
  end if;
  if p_link_id is null then
    raise exception 'link_id is required';
  end if;
  if v_actor_id is null then
    raise exception 'authenticated user required';
  end if;

  if not public.has_workspace_role(p_workspace_id, array['owner', 'editor']) then
    raise exception 'forbidden';
  end if;

  perform 1 from public.links l
    where l.id = p_link_id and l.workspace_id = p_workspace_id;
  if not found then
    raise exception 'link not found';
  end if;

  delete from public.link_allowed_emails where link_id = p_link_id;
  delete from public.link_blocked_emails where link_id = p_link_id;
  delete from public.link_allowed_groups where link_id = p_link_id;
  delete from public.link_blocked_groups where link_id = p_link_id;

  with blocked as (
    select distinct lower(trim(e)) as email
    from unnest(coalesce(p_blocked_emails, array[]::text[])) e
    where char_length(trim(e)) > 0
  ),
  allowed as (
    select distinct lower(trim(e)) as email
    from unnest(coalesce(p_allowed_emails, array[]::text[])) e
    where char_length(trim(e)) > 0
      and lower(trim(e)) not in (select email from blocked)
  )
  insert into public.link_allowed_emails (workspace_id, link_id, email, created_by)
  select p_workspace_id, p_link_id, a.email, v_actor_id
  from allowed a;

  insert into public.link_blocked_emails (workspace_id, link_id, email, created_by)
  select p_workspace_id, p_link_id, b.email, v_actor_id
  from (
    select distinct lower(trim(e)) as email
    from unnest(coalesce(p_blocked_emails, array[]::text[])) e
    where char_length(trim(e)) > 0
  ) b;

  with blocked as (
    select distinct g as group_id
    from unnest(coalesce(p_blocked_group_ids, array[]::uuid[])) g
    where g is not null
  ),
  allowed as (
    select distinct g as group_id
    from unnest(coalesce(p_allowed_group_ids, array[]::uuid[])) g
    where g is not null
      and g not in (select group_id from blocked)
  )
  insert into public.link_allowed_groups (workspace_id, link_id, group_id, created_by)
  select p_workspace_id, p_link_id, a.group_id, v_actor_id
  from allowed a;

  insert into public.link_blocked_groups (workspace_id, link_id, group_id, created_by)
  select p_workspace_id, p_link_id, b.group_id, v_actor_id
  from (
    select distinct g as group_id
    from unnest(coalesce(p_blocked_group_ids, array[]::uuid[])) g
    where g is not null
  ) b;
end;
$$;

-- NOTE: Supabase's local migrator executes statements via prepared statements.
-- Some environments choke when multiple CREATE FUNCTION blocks are bundled into
-- one prepared statement. Defining these helper RPCs via a single DO block
-- avoids that class of failure.
do $dk_atomic_rpcs$
begin
  execute $dk$
create or replace function public.update_workspace_user_group_atomic(
  p_workspace_id uuid,
  p_group_id uuid,
  p_name text,
  p_emails text[] default array[]::text[]
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_trimmed_name text := trim(both from coalesce(p_name, ''));
begin
  if p_workspace_id is null then
    raise exception 'workspace_id is required';
  end if;
  if p_group_id is null then
    raise exception 'group_id is required';
  end if;
  if char_length(v_trimmed_name) = 0 then
    raise exception 'group name is required';
  end if;
  if v_actor_id is null then
    raise exception 'authenticated user required';
  end if;

  if not public.has_workspace_role(p_workspace_id, array['owner', 'editor']) then
    raise exception 'forbidden';
  end if;

  perform 1
  from public.workspace_user_groups g
  where g.id = p_group_id and g.workspace_id = p_workspace_id;
  if not found then
    raise exception 'group not found';
  end if;

  update public.workspace_user_groups
    set name = v_trimmed_name
  where id = p_group_id and workspace_id = p_workspace_id;

  delete from public.workspace_user_group_emails
  where group_id = p_group_id and workspace_id = p_workspace_id;

  insert into public.workspace_user_group_emails (workspace_id, group_id, email, created_by)
  select
    p_workspace_id,
    p_group_id,
    email,
    v_actor_id
  from (
    select distinct lower(trim(e)) as email
    from unnest(coalesce(p_emails, array[]::text[])) e
    where char_length(trim(e)) > 0
  ) normalized;
end;
$$;
$dk$;

  execute $dk$
create or replace function public.replace_link_preset_rules(
  p_workspace_id uuid,
  p_preset_id uuid,
  p_allowed_emails text[] default array[]::text[],
  p_blocked_emails text[] default array[]::text[],
  p_allowed_group_ids uuid[] default array[]::uuid[],
  p_blocked_group_ids uuid[] default array[]::uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if p_workspace_id is null then
    raise exception 'workspace_id is required';
  end if;
  if p_preset_id is null then
    raise exception 'preset_id is required';
  end if;
  if v_actor_id is null then
    raise exception 'authenticated user required';
  end if;

  if not public.has_workspace_role(p_workspace_id, array['owner', 'editor']) then
    raise exception 'forbidden';
  end if;

  perform 1 from public.link_presets p
    where p.id = p_preset_id and p.workspace_id = p_workspace_id;
  if not found then
    raise exception 'preset not found';
  end if;

  delete from public.link_preset_allowed_emails where preset_id = p_preset_id;
  delete from public.link_preset_blocked_emails where preset_id = p_preset_id;
  delete from public.link_preset_allowed_groups where preset_id = p_preset_id;
  delete from public.link_preset_blocked_groups where preset_id = p_preset_id;

  with blocked as (
    select distinct lower(trim(e)) as email
    from unnest(coalesce(p_blocked_emails, array[]::text[])) e
    where char_length(trim(e)) > 0
  ),
  allowed as (
    select distinct lower(trim(e)) as email
    from unnest(coalesce(p_allowed_emails, array[]::text[])) e
    where char_length(trim(e)) > 0
      and lower(trim(e)) not in (select email from blocked)
  )
  insert into public.link_preset_allowed_emails (workspace_id, preset_id, email, created_by)
  select p_workspace_id, p_preset_id, a.email, v_actor_id
  from allowed a;

  insert into public.link_preset_blocked_emails (workspace_id, preset_id, email, created_by)
  select p_workspace_id, p_preset_id, b.email, v_actor_id
  from (
    select distinct lower(trim(e)) as email
    from unnest(coalesce(p_blocked_emails, array[]::text[])) e
    where char_length(trim(e)) > 0
  ) b;

  with blocked as (
    select distinct g as group_id
    from unnest(coalesce(p_blocked_group_ids, array[]::uuid[])) g
    where g is not null
  ),
  allowed as (
    select distinct g as group_id
    from unnest(coalesce(p_allowed_group_ids, array[]::uuid[])) g
    where g is not null
      and g not in (select group_id from blocked)
  )
  insert into public.link_preset_allowed_groups (workspace_id, preset_id, group_id, created_by)
  select p_workspace_id, p_preset_id, a.group_id, v_actor_id
  from allowed a;

  insert into public.link_preset_blocked_groups (workspace_id, preset_id, group_id, created_by)
  select p_workspace_id, p_preset_id, b.group_id, v_actor_id
  from (
    select distinct g as group_id
    from unnest(coalesce(p_blocked_group_ids, array[]::uuid[])) g
    where g is not null
  ) b;
end;
$$;
$dk$;

  execute $dk$
create or replace function public.upsert_link_preset(
  p_workspace_id uuid,
  p_name text,
  p_settings_json jsonb,
  p_allowed_emails text[] default array[]::text[],
  p_blocked_emails text[] default array[]::text[],
  p_allowed_group_ids uuid[] default array[]::uuid[],
  p_blocked_group_ids uuid[] default array[]::uuid[]
)
returns table (id uuid, name text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_trimmed_name text := trim(both from coalesce(p_name, ''));
  v_preset_id uuid := null;
  v_preset_name text := null;
begin
  if p_workspace_id is null then
    raise exception 'workspace_id is required';
  end if;
  if char_length(v_trimmed_name) = 0 then
    raise exception 'preset name is required';
  end if;
  if v_actor_id is null then
    raise exception 'authenticated user required';
  end if;

  if not public.has_workspace_role(p_workspace_id, array['owner', 'editor']) then
    raise exception 'forbidden';
  end if;

  -- Serialize writers per (workspace_id, lower(name)) to avoid races.
  perform pg_advisory_xact_lock(
    hashtext(p_workspace_id::text || ':' || lower(v_trimmed_name))
  );

  select lp.id, lp.name
    into v_preset_id, v_preset_name
  from public.link_presets lp
  where lp.workspace_id = p_workspace_id
    and lower(lp.name) = lower(v_trimmed_name)
  limit 1;

  if v_preset_id is null then
    begin
      insert into public.link_presets (workspace_id, name, settings_json, created_by)
      values (p_workspace_id, v_trimmed_name, coalesce(p_settings_json, '{}'::jsonb), v_actor_id)
      returning public.link_presets.id, public.link_presets.name
      into v_preset_id, v_preset_name;
    exception
      when unique_violation then
        -- Someone else inserted concurrently; re-fetch and proceed to update.
        select lp.id, lp.name
          into v_preset_id, v_preset_name
        from public.link_presets lp
        where lp.workspace_id = p_workspace_id
          and lower(lp.name) = lower(v_trimmed_name)
        limit 1;
    end;
  end if;

  if v_preset_id is null then
    raise exception 'failed to resolve preset id';
  end if;

  update public.link_presets
    set name = v_trimmed_name,
        settings_json = coalesce(p_settings_json, '{}'::jsonb),
        updated_at = now()
  where id = v_preset_id
    and workspace_id = p_workspace_id;

  perform public.replace_link_preset_rules(
    p_workspace_id,
    v_preset_id,
    p_allowed_emails,
    p_blocked_emails,
    p_allowed_group_ids,
    p_blocked_group_ids
  );

  id := v_preset_id;
  name := coalesce(v_preset_name, v_trimmed_name);
  return next;
end;
$$;
$dk$;
end;
$dk_atomic_rpcs$;

alter table public.workspace_user_groups enable row level security;
alter table public.workspace_user_group_emails enable row level security;
alter table public.link_blocked_emails enable row level security;
alter table public.link_allowed_groups enable row level security;
alter table public.link_blocked_groups enable row level security;
alter table public.link_presets enable row level security;
alter table public.link_preset_allowed_emails enable row level security;
alter table public.link_preset_blocked_emails enable row level security;
alter table public.link_preset_allowed_groups enable row level security;
alter table public.link_preset_blocked_groups enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists workspace_user_groups_select_members on public.workspace_user_groups;
create policy workspace_user_groups_select_members
on public.workspace_user_groups
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_user_groups_write_editors on public.workspace_user_groups;
create policy workspace_user_groups_write_editors
on public.workspace_user_groups
using (public.has_workspace_role(workspace_id, array['owner', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

drop policy if exists workspace_user_group_emails_select_members on public.workspace_user_group_emails;
create policy workspace_user_group_emails_select_members
on public.workspace_user_group_emails
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_user_group_emails_write_editors on public.workspace_user_group_emails;
create policy workspace_user_group_emails_write_editors
on public.workspace_user_group_emails
using (public.has_workspace_role(workspace_id, array['owner', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

drop policy if exists link_blocked_emails_select_members on public.link_blocked_emails;
create policy link_blocked_emails_select_members
on public.link_blocked_emails
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists link_blocked_emails_write_editors on public.link_blocked_emails;
create policy link_blocked_emails_write_editors
on public.link_blocked_emails
using (public.has_workspace_role(workspace_id, array['owner', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

drop policy if exists link_allowed_groups_select_members on public.link_allowed_groups;
create policy link_allowed_groups_select_members
on public.link_allowed_groups
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists link_allowed_groups_write_editors on public.link_allowed_groups;
create policy link_allowed_groups_write_editors
on public.link_allowed_groups
using (public.has_workspace_role(workspace_id, array['owner', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

drop policy if exists link_blocked_groups_select_members on public.link_blocked_groups;
create policy link_blocked_groups_select_members
on public.link_blocked_groups
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists link_blocked_groups_write_editors on public.link_blocked_groups;
create policy link_blocked_groups_write_editors
on public.link_blocked_groups
using (public.has_workspace_role(workspace_id, array['owner', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

drop policy if exists link_presets_select_members on public.link_presets;
create policy link_presets_select_members
on public.link_presets
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists link_presets_write_editors on public.link_presets;
create policy link_presets_write_editors
on public.link_presets
using (public.has_workspace_role(workspace_id, array['owner', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

drop policy if exists link_preset_allowed_emails_select_members on public.link_preset_allowed_emails;
create policy link_preset_allowed_emails_select_members
on public.link_preset_allowed_emails
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists link_preset_allowed_emails_write_editors on public.link_preset_allowed_emails;
create policy link_preset_allowed_emails_write_editors
on public.link_preset_allowed_emails
using (public.has_workspace_role(workspace_id, array['owner', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

drop policy if exists link_preset_blocked_emails_select_members on public.link_preset_blocked_emails;
create policy link_preset_blocked_emails_select_members
on public.link_preset_blocked_emails
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists link_preset_blocked_emails_write_editors on public.link_preset_blocked_emails;
create policy link_preset_blocked_emails_write_editors
on public.link_preset_blocked_emails
using (public.has_workspace_role(workspace_id, array['owner', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

drop policy if exists link_preset_allowed_groups_select_members on public.link_preset_allowed_groups;
create policy link_preset_allowed_groups_select_members
on public.link_preset_allowed_groups
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists link_preset_allowed_groups_write_editors on public.link_preset_allowed_groups;
create policy link_preset_allowed_groups_write_editors
on public.link_preset_allowed_groups
using (public.has_workspace_role(workspace_id, array['owner', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

drop policy if exists link_preset_blocked_groups_select_members on public.link_preset_blocked_groups;
create policy link_preset_blocked_groups_select_members
on public.link_preset_blocked_groups
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists link_preset_blocked_groups_write_editors on public.link_preset_blocked_groups;
create policy link_preset_blocked_groups_write_editors
on public.link_preset_blocked_groups
using (public.has_workspace_role(workspace_id, array['owner', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

drop policy if exists audit_events_select_owners on public.audit_events;
create policy audit_events_select_owners
on public.audit_events
for select
using (public.has_workspace_role(workspace_id, array['owner']));

-- Defense in depth: do not grant write privileges to anon.
-- service_role: full access (server-only), authenticated: controlled DML under RLS.
grant all on table public.workspace_user_groups to service_role;
grant select, insert, update, delete on table public.workspace_user_groups to authenticated;

grant all on table public.workspace_user_group_emails to service_role;
grant select, insert, update, delete on table public.workspace_user_group_emails to authenticated;

grant all on table public.link_blocked_emails to service_role;
grant select, insert, update, delete on table public.link_blocked_emails to authenticated;

grant all on table public.link_allowed_groups to service_role;
grant select, insert, update, delete on table public.link_allowed_groups to authenticated;

grant all on table public.link_blocked_groups to service_role;
grant select, insert, update, delete on table public.link_blocked_groups to authenticated;

grant all on table public.link_presets to service_role;
grant select, insert, update, delete on table public.link_presets to authenticated;

grant all on table public.link_preset_allowed_emails to service_role;
grant select, insert, update, delete on table public.link_preset_allowed_emails to authenticated;

grant all on table public.link_preset_blocked_emails to service_role;
grant select, insert, update, delete on table public.link_preset_blocked_emails to authenticated;

grant all on table public.link_preset_allowed_groups to service_role;
grant select, insert, update, delete on table public.link_preset_allowed_groups to authenticated;

grant all on table public.link_preset_blocked_groups to service_role;
grant select, insert, update, delete on table public.link_preset_blocked_groups to authenticated;

grant all on table public.audit_events to service_role;
grant select on table public.audit_events to authenticated;

-- Keep this as a SINGLE GRANT statement (migration runner uses prepared statements).
grant execute on function
  public.touch_updated_at_column(),
  public.record_internal_audit_event(uuid, text, text, uuid, uuid, uuid, jsonb),
  public.record_audit_event_from_trigger(),
  public.replace_link_allowlist_rules(uuid, uuid, text[], text[], uuid[], uuid[]),
  public.update_workspace_user_group_atomic(uuid, uuid, text, text[]),
  public.replace_link_preset_rules(uuid, uuid, text[], text[], uuid[], uuid[]),
  public.upsert_link_preset(uuid, text, jsonb, text[], text[], uuid[], uuid[])
to authenticated, service_role;
