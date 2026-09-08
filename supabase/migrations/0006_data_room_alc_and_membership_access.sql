-- Data-Room Advanced Level Control (ALC) + authenticated membership access control.
--
-- Implements:
-- - Public data-room link ALC tables + atomic replace RPC
-- - Authenticated data-room membership tables + workspace-level access flags
-- - RLS updates for data rooms, folders, documents, links, and storage buckets

set search_path = public, auth;

-- ------------------------------------------------------------
-- 1) ALC tables (workspace-scoped, link-scoped)
-- ------------------------------------------------------------

create table if not exists public.link_alc_allowed_emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  link_id uuid not null references public.links(id) on delete cascade,
  email text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint link_alc_allowed_emails_email_normalized check (
    length(trim(both from email)) > 0 and email = lower(email)
  )
);

create unique index if not exists uniq_link_alc_allowed_emails_link_email
  on public.link_alc_allowed_emails (link_id, email);

create index if not exists idx_link_alc_allowed_emails_link
  on public.link_alc_allowed_emails (link_id);

create table if not exists public.link_alc_allowed_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  link_id uuid not null references public.links(id) on delete cascade,
  group_id uuid not null references public.workspace_user_groups(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.link_alc_allowed_groups
  drop constraint if exists link_alc_allowed_groups_group_workspace_fkey;

alter table public.link_alc_allowed_groups
  add constraint link_alc_allowed_groups_group_workspace_fkey
  foreign key (group_id, workspace_id)
  references public.workspace_user_groups(id, workspace_id)
  on delete cascade;

create unique index if not exists uniq_link_alc_allowed_groups_link_group
  on public.link_alc_allowed_groups (link_id, group_id);

create index if not exists idx_link_alc_allowed_groups_link
  on public.link_alc_allowed_groups (link_id);

-- Composite uniqueness for safer workspace-scoped foreign keys.
create unique index if not exists folders_id_workspace
  on public.folders (id, workspace_id);

create unique index if not exists documents_id_workspace
  on public.documents (id, workspace_id);

create table if not exists public.link_alc_allowed_folders_emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  link_id uuid not null references public.links(id) on delete cascade,
  folder_id uuid not null references public.folders(id) on delete cascade,
  email text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint link_alc_allowed_folders_emails_email_normalized check (
    length(trim(both from email)) > 0 and email = lower(email)
  )
);

alter table public.link_alc_allowed_folders_emails
  drop constraint if exists link_alc_allowed_folders_emails_folder_workspace_fkey;

alter table public.link_alc_allowed_folders_emails
  add constraint link_alc_allowed_folders_emails_folder_workspace_fkey
  foreign key (folder_id, workspace_id)
  references public.folders(id, workspace_id)
  on delete cascade;

create unique index if not exists uniq_link_alc_allowed_folders_emails
  on public.link_alc_allowed_folders_emails (link_id, folder_id, email);

create index if not exists idx_link_alc_allowed_folders_emails_link
  on public.link_alc_allowed_folders_emails (link_id);

create index if not exists idx_link_alc_allowed_folders_emails_folder
  on public.link_alc_allowed_folders_emails (link_id, folder_id);

create index if not exists idx_link_alc_allowed_folders_emails_email
  on public.link_alc_allowed_folders_emails (link_id, email);

create table if not exists public.link_alc_allowed_folders_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  link_id uuid not null references public.links(id) on delete cascade,
  folder_id uuid not null references public.folders(id) on delete cascade,
  group_id uuid not null references public.workspace_user_groups(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.link_alc_allowed_folders_groups
  drop constraint if exists link_alc_allowed_folders_groups_group_workspace_fkey;

alter table public.link_alc_allowed_folders_groups
  add constraint link_alc_allowed_folders_groups_group_workspace_fkey
  foreign key (group_id, workspace_id)
  references public.workspace_user_groups(id, workspace_id)
  on delete cascade;

alter table public.link_alc_allowed_folders_groups
  drop constraint if exists link_alc_allowed_folders_groups_folder_workspace_fkey;

alter table public.link_alc_allowed_folders_groups
  add constraint link_alc_allowed_folders_groups_folder_workspace_fkey
  foreign key (folder_id, workspace_id)
  references public.folders(id, workspace_id)
  on delete cascade;

create unique index if not exists uniq_link_alc_allowed_folders_groups
  on public.link_alc_allowed_folders_groups (link_id, folder_id, group_id);

create index if not exists idx_link_alc_allowed_folders_groups_link
  on public.link_alc_allowed_folders_groups (link_id);

create index if not exists idx_link_alc_allowed_folders_groups_folder
  on public.link_alc_allowed_folders_groups (link_id, folder_id);

create table if not exists public.link_alc_allowed_documents_emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  link_id uuid not null references public.links(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  email text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint link_alc_allowed_documents_emails_email_normalized check (
    length(trim(both from email)) > 0 and email = lower(email)
  )
);

alter table public.link_alc_allowed_documents_emails
  drop constraint if exists link_alc_allowed_documents_emails_document_workspace_fkey;

alter table public.link_alc_allowed_documents_emails
  add constraint link_alc_allowed_documents_emails_document_workspace_fkey
  foreign key (document_id, workspace_id)
  references public.documents(id, workspace_id)
  on delete cascade;

create unique index if not exists uniq_link_alc_allowed_documents_emails
  on public.link_alc_allowed_documents_emails (link_id, document_id, email);

create index if not exists idx_link_alc_allowed_documents_emails_link
  on public.link_alc_allowed_documents_emails (link_id);

create index if not exists idx_link_alc_allowed_documents_emails_document
  on public.link_alc_allowed_documents_emails (link_id, document_id);

create index if not exists idx_link_alc_allowed_documents_emails_email
  on public.link_alc_allowed_documents_emails (link_id, email);

create table if not exists public.link_alc_allowed_documents_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  link_id uuid not null references public.links(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  group_id uuid not null references public.workspace_user_groups(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.link_alc_allowed_documents_groups
  drop constraint if exists link_alc_allowed_documents_groups_group_workspace_fkey;

alter table public.link_alc_allowed_documents_groups
  add constraint link_alc_allowed_documents_groups_group_workspace_fkey
  foreign key (group_id, workspace_id)
  references public.workspace_user_groups(id, workspace_id)
  on delete cascade;

alter table public.link_alc_allowed_documents_groups
  drop constraint if exists link_alc_allowed_documents_groups_document_workspace_fkey;

alter table public.link_alc_allowed_documents_groups
  add constraint link_alc_allowed_documents_groups_document_workspace_fkey
  foreign key (document_id, workspace_id)
  references public.documents(id, workspace_id)
  on delete cascade;

create unique index if not exists uniq_link_alc_allowed_documents_groups
  on public.link_alc_allowed_documents_groups (link_id, document_id, group_id);

create index if not exists idx_link_alc_allowed_documents_groups_link
  on public.link_alc_allowed_documents_groups (link_id);

create index if not exists idx_link_alc_allowed_documents_groups_document
  on public.link_alc_allowed_documents_groups (link_id, document_id);

-- RLS: mirror allowlist tables.
alter table public.link_alc_allowed_emails enable row level security;
alter table public.link_alc_allowed_groups enable row level security;
alter table public.link_alc_allowed_folders_emails enable row level security;
alter table public.link_alc_allowed_folders_groups enable row level security;
alter table public.link_alc_allowed_documents_emails enable row level security;
alter table public.link_alc_allowed_documents_groups enable row level security;

drop policy if exists link_alc_allowed_emails_select_members on public.link_alc_allowed_emails;
create policy link_alc_allowed_emails_select_members
on public.link_alc_allowed_emails
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists link_alc_allowed_emails_write_editors on public.link_alc_allowed_emails;
create policy link_alc_allowed_emails_write_editors
on public.link_alc_allowed_emails
using (public.has_workspace_role(workspace_id, array['owner', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

drop policy if exists link_alc_allowed_groups_select_members on public.link_alc_allowed_groups;
create policy link_alc_allowed_groups_select_members
on public.link_alc_allowed_groups
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists link_alc_allowed_groups_write_editors on public.link_alc_allowed_groups;
create policy link_alc_allowed_groups_write_editors
on public.link_alc_allowed_groups
using (public.has_workspace_role(workspace_id, array['owner', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

drop policy if exists link_alc_allowed_folders_emails_select_members on public.link_alc_allowed_folders_emails;
create policy link_alc_allowed_folders_emails_select_members
on public.link_alc_allowed_folders_emails
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists link_alc_allowed_folders_emails_write_editors on public.link_alc_allowed_folders_emails;
create policy link_alc_allowed_folders_emails_write_editors
on public.link_alc_allowed_folders_emails
using (public.has_workspace_role(workspace_id, array['owner', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

drop policy if exists link_alc_allowed_folders_groups_select_members on public.link_alc_allowed_folders_groups;
create policy link_alc_allowed_folders_groups_select_members
on public.link_alc_allowed_folders_groups
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists link_alc_allowed_folders_groups_write_editors on public.link_alc_allowed_folders_groups;
create policy link_alc_allowed_folders_groups_write_editors
on public.link_alc_allowed_folders_groups
using (public.has_workspace_role(workspace_id, array['owner', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

drop policy if exists link_alc_allowed_documents_emails_select_members on public.link_alc_allowed_documents_emails;
create policy link_alc_allowed_documents_emails_select_members
on public.link_alc_allowed_documents_emails
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists link_alc_allowed_documents_emails_write_editors on public.link_alc_allowed_documents_emails;
create policy link_alc_allowed_documents_emails_write_editors
on public.link_alc_allowed_documents_emails
using (public.has_workspace_role(workspace_id, array['owner', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

drop policy if exists link_alc_allowed_documents_groups_select_members on public.link_alc_allowed_documents_groups;
create policy link_alc_allowed_documents_groups_select_members
on public.link_alc_allowed_documents_groups
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists link_alc_allowed_documents_groups_write_editors on public.link_alc_allowed_documents_groups;
create policy link_alc_allowed_documents_groups_write_editors
on public.link_alc_allowed_documents_groups
using (public.has_workspace_role(workspace_id, array['owner', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

-- Audit triggers (keep consistent with allowlist tables).
drop trigger if exists audit_link_alc_allowed_emails_trigger on public.link_alc_allowed_emails;
create trigger audit_link_alc_allowed_emails_trigger
after insert or update or delete on public.link_alc_allowed_emails
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_link_alc_allowed_groups_trigger on public.link_alc_allowed_groups;
create trigger audit_link_alc_allowed_groups_trigger
after insert or update or delete on public.link_alc_allowed_groups
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_link_alc_allowed_folders_emails_trigger on public.link_alc_allowed_folders_emails;
create trigger audit_link_alc_allowed_folders_emails_trigger
after insert or update or delete on public.link_alc_allowed_folders_emails
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_link_alc_allowed_folders_groups_trigger on public.link_alc_allowed_folders_groups;
create trigger audit_link_alc_allowed_folders_groups_trigger
after insert or update or delete on public.link_alc_allowed_folders_groups
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_link_alc_allowed_documents_emails_trigger on public.link_alc_allowed_documents_emails;
create trigger audit_link_alc_allowed_documents_emails_trigger
after insert or update or delete on public.link_alc_allowed_documents_emails
for each row execute function public.record_audit_event_from_trigger();

drop trigger if exists audit_link_alc_allowed_documents_groups_trigger on public.link_alc_allowed_documents_groups;
create trigger audit_link_alc_allowed_documents_groups_trigger
after insert or update or delete on public.link_alc_allowed_documents_groups
for each row execute function public.record_audit_event_from_trigger();

-- Atomic replace RPC for ALC rules.
create or replace function public.replace_link_alc_rules(
  p_workspace_id uuid,
  p_link_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_data_room_id uuid;
  v_missing_folders int := 0;
  v_missing_documents int := 0;
  v_missing_groups int := 0;
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
  if p_payload is null then
    p_payload := '{}'::jsonb;
  end if;

  if not public.has_workspace_role(p_workspace_id, array['owner', 'editor']) then
    raise exception 'forbidden';
  end if;

  select l.data_room_id
  into v_data_room_id
  from public.links l
  where l.id = p_link_id and l.workspace_id = p_workspace_id;
  if not found then
    raise exception 'link not found';
  end if;
  if v_data_room_id is null then
    raise exception 'link must be a data room link';
  end if;

  -- Validate referenced folders/documents are in the link's data room.
  with requested as (
    select distinct (x->>'folderId')::uuid as folder_id
    from jsonb_array_elements(coalesce(p_payload->'folders', '[]'::jsonb)) x
    where (x ? 'folderId')
  ),
  valid as (
    select r.folder_id
    from requested r
    join public.folders f on f.id = r.folder_id
    where f.workspace_id = p_workspace_id
      and f.data_room_id = v_data_room_id
  )
  select count(*) into v_missing_folders
  from requested r
  left join valid v on v.folder_id = r.folder_id
  where v.folder_id is null;

  if v_missing_folders > 0 then
    raise exception 'one or more folders not found in this data room';
  end if;

  with requested as (
    select distinct (x->>'documentId')::uuid as document_id
    from jsonb_array_elements(coalesce(p_payload->'documents', '[]'::jsonb)) x
    where (x ? 'documentId')
  ),
  valid as (
    select r.document_id
    from requested r
    join public.documents d on d.id = r.document_id
    where d.workspace_id = p_workspace_id
      and d.data_room_id = v_data_room_id
  )
  select count(*) into v_missing_documents
  from requested r
  left join valid v on v.document_id = r.document_id
  where v.document_id is null;

  if v_missing_documents > 0 then
    raise exception 'one or more documents not found in this data room';
  end if;

  -- Clear existing state.
  delete from public.link_alc_allowed_emails where link_id = p_link_id;
  delete from public.link_alc_allowed_groups where link_id = p_link_id;
  delete from public.link_alc_allowed_folders_emails where link_id = p_link_id;
  delete from public.link_alc_allowed_folders_groups where link_id = p_link_id;
  delete from public.link_alc_allowed_documents_emails where link_id = p_link_id;
  delete from public.link_alc_allowed_documents_groups where link_id = p_link_id;

  -- Room-wide allow (emails).
  with room_allowed as (
    select distinct lower(trim(e)) as email
    from jsonb_array_elements_text(
      coalesce(p_payload->'room'->'allowedEmails', '[]'::jsonb)
    ) e
    where char_length(trim(e)) > 0
  )
  insert into public.link_alc_allowed_emails (workspace_id, link_id, email, created_by)
  select p_workspace_id, p_link_id, a.email, v_actor_id
  from room_allowed a;

  -- Room-wide allow (groups).
  with requested as (
    select distinct lower(trim(g)) as group_id_raw
    from jsonb_array_elements_text(
      coalesce(p_payload->'room'->'allowedGroupIds', '[]'::jsonb)
    ) g
    where char_length(trim(g)) > 0
  ),
  requested_valid as (
    select group_id_raw
    from requested
    where group_id_raw ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  valid as (
    select distinct (r.group_id_raw)::uuid as group_id
    from requested_valid r
    join public.workspace_user_groups g
      on g.workspace_id = p_workspace_id
      and g.id = (r.group_id_raw)::uuid
  )
  select count(*) into v_missing_groups
  from requested r
  left join valid v on v.group_id::text = r.group_id_raw
  where v.group_id is null;

  if v_missing_groups > 0 then
    raise exception 'one or more groups are invalid for this workspace';
  end if;

  with requested as (
    select distinct lower(trim(g)) as group_id_raw
    from jsonb_array_elements_text(
      coalesce(p_payload->'room'->'allowedGroupIds', '[]'::jsonb)
    ) g
    where char_length(trim(g)) > 0
  ),
  requested_valid as (
    select group_id_raw
    from requested
    where group_id_raw ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  valid as (
    select distinct (r.group_id_raw)::uuid as group_id
    from requested_valid r
    join public.workspace_user_groups g
      on g.workspace_id = p_workspace_id
      and g.id = (r.group_id_raw)::uuid
  )
  insert into public.link_alc_allowed_groups (workspace_id, link_id, group_id, created_by)
  select p_workspace_id, p_link_id, v.group_id, v_actor_id
  from valid v;

  -- Folder-level allow (emails).
  with folder_rules as (
    select
      (x->>'folderId')::uuid as folder_id,
      x->'allowedEmails' as allowed_emails
    from jsonb_array_elements(coalesce(p_payload->'folders', '[]'::jsonb)) x
    where (x ? 'folderId')
  ),
  normalized as (
    select distinct
      fr.folder_id,
      lower(trim(e)) as email
    from folder_rules fr
    cross join lateral jsonb_array_elements_text(coalesce(fr.allowed_emails, '[]'::jsonb)) e
    where char_length(trim(e)) > 0
  )
  insert into public.link_alc_allowed_folders_emails (workspace_id, link_id, folder_id, email, created_by)
  select p_workspace_id, p_link_id, n.folder_id, n.email, v_actor_id
  from normalized n;

  -- Folder-level allow (groups).
  with folder_rules as (
    select
      (x->>'folderId')::uuid as folder_id,
      x->'allowedGroupIds' as allowed_group_ids
    from jsonb_array_elements(coalesce(p_payload->'folders', '[]'::jsonb)) x
    where (x ? 'folderId')
  ),
  normalized as (
    select distinct
      fr.folder_id,
      (trim(g))::uuid as group_id
    from folder_rules fr
    cross join lateral jsonb_array_elements_text(coalesce(fr.allowed_group_ids, '[]'::jsonb)) g
    where char_length(trim(g)) > 0
  )
  insert into public.link_alc_allowed_folders_groups (workspace_id, link_id, folder_id, group_id, created_by)
  select p_workspace_id, p_link_id, n.folder_id, n.group_id, v_actor_id
  from normalized n;

  -- Document-level allow (emails).
  with document_rules as (
    select
      (x->>'documentId')::uuid as document_id,
      x->'allowedEmails' as allowed_emails
    from jsonb_array_elements(coalesce(p_payload->'documents', '[]'::jsonb)) x
    where (x ? 'documentId')
  ),
  normalized as (
    select distinct
      dr.document_id,
      lower(trim(e)) as email
    from document_rules dr
    cross join lateral jsonb_array_elements_text(coalesce(dr.allowed_emails, '[]'::jsonb)) e
    where char_length(trim(e)) > 0
  )
  insert into public.link_alc_allowed_documents_emails (workspace_id, link_id, document_id, email, created_by)
  select p_workspace_id, p_link_id, n.document_id, n.email, v_actor_id
  from normalized n;

  -- Document-level allow (groups).
  with document_rules as (
    select
      (x->>'documentId')::uuid as document_id,
      x->'allowedGroupIds' as allowed_group_ids
    from jsonb_array_elements(coalesce(p_payload->'documents', '[]'::jsonb)) x
    where (x ? 'documentId')
  ),
  normalized as (
    select distinct
      dr.document_id,
      (trim(g))::uuid as group_id
    from document_rules dr
    cross join lateral jsonb_array_elements_text(coalesce(dr.allowed_group_ids, '[]'::jsonb)) g
    where char_length(trim(g)) > 0
  )
  insert into public.link_alc_allowed_documents_groups (workspace_id, link_id, document_id, group_id, created_by)
  select p_workspace_id, p_link_id, n.document_id, n.group_id, v_actor_id
  from normalized n;
end;
$$;

-- ------------------------------------------------------------
-- 2) Authenticated membership access control
-- ------------------------------------------------------------

-- Access levels are used to decouple per-surface permissions from system role.
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'access_level'
      and n.nspname = 'public'
  ) then
    create type public.access_level as enum ('none', 'viewer', 'editor');
  end if;
end
$$;

alter table public.workspace_members
  add column if not exists documents_access public.access_level not null default 'none';

alter table public.workspace_members
  add column if not exists data_rooms_access_all public.access_level not null default 'none';

alter table public.workspace_invites
  add column if not exists documents_access public.access_level not null default 'none';

alter table public.workspace_invites
  add column if not exists data_rooms_access_all public.access_level not null default 'none';

create unique index if not exists data_rooms_id_workspace
  on public.data_rooms (id, workspace_id);

create unique index if not exists workspace_invites_id_workspace
  on public.workspace_invites (id, workspace_id);

create table if not exists public.data_room_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  data_room_id uuid not null references public.data_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_level public.access_level not null default 'viewer',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (data_room_id, user_id)
);

alter table public.data_room_members
  drop constraint if exists data_room_members_room_workspace_fkey;

alter table public.data_room_members
  add constraint data_room_members_room_workspace_fkey
  foreign key (data_room_id, workspace_id)
  references public.data_rooms(id, workspace_id)
  on delete cascade;

create index if not exists idx_data_room_members_workspace_user
  on public.data_room_members (workspace_id, user_id);

create index if not exists idx_data_room_members_workspace_user_access_level
  on public.data_room_members (workspace_id, user_id, access_level);

create index if not exists idx_data_room_members_room
  on public.data_room_members (data_room_id);

create table if not exists public.workspace_invite_data_room_access (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invite_id uuid not null references public.workspace_invites(id) on delete cascade,
  data_room_id uuid not null references public.data_rooms(id) on delete cascade,
  access_level public.access_level not null default 'viewer',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.workspace_invite_data_room_access
  drop constraint if exists workspace_invite_data_room_access_invite_workspace_fkey;

alter table public.workspace_invite_data_room_access
  add constraint workspace_invite_data_room_access_invite_workspace_fkey
  foreign key (invite_id, workspace_id)
  references public.workspace_invites(id, workspace_id)
  on delete cascade;

alter table public.workspace_invite_data_room_access
  drop constraint if exists workspace_invite_data_room_access_room_workspace_fkey;

alter table public.workspace_invite_data_room_access
  add constraint workspace_invite_data_room_access_room_workspace_fkey
  foreign key (data_room_id, workspace_id)
  references public.data_rooms(id, workspace_id)
  on delete cascade;

create unique index if not exists uniq_invite_room_access
  on public.workspace_invite_data_room_access (invite_id, data_room_id);

create index if not exists idx_workspace_invite_data_room_access_invite
  on public.workspace_invite_data_room_access (invite_id);

create index if not exists idx_workspace_invite_data_room_access_workspace
  on public.workspace_invite_data_room_access (workspace_id);

-- ------------------------------------------------------------
-- 2.1) Role presets (owner-managed)
-- ------------------------------------------------------------

create table if not exists public.workspace_role_presets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  base_role public.user_role not null,
  documents_access public.access_level not null default 'none',
  data_rooms_access_all public.access_level not null default 'none',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_role_presets_name_nonempty check (
    length(trim(both from name)) > 0
  ),
  constraint workspace_role_presets_base_role_not_owner check (
    base_role in ('editor'::public.user_role, 'viewer'::public.user_role)
  )
);

create unique index if not exists workspace_role_presets_id_workspace
  on public.workspace_role_presets (id, workspace_id);

create unique index if not exists uniq_workspace_role_presets_workspace_name
  on public.workspace_role_presets (workspace_id, name);

create index if not exists idx_workspace_role_presets_workspace
  on public.workspace_role_presets (workspace_id);

create table if not exists public.workspace_role_preset_data_rooms (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  preset_id uuid not null references public.workspace_role_presets(id) on delete cascade,
  data_room_id uuid not null references public.data_rooms(id) on delete cascade,
  access_level public.access_level not null default 'viewer',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (preset_id, data_room_id),
  constraint workspace_role_preset_data_rooms_access_level_not_none check (
    access_level in ('viewer'::public.access_level, 'editor'::public.access_level)
  )
);

alter table public.workspace_role_preset_data_rooms
  drop constraint if exists workspace_role_preset_data_rooms_preset_workspace_fkey;

alter table public.workspace_role_preset_data_rooms
  add constraint workspace_role_preset_data_rooms_preset_workspace_fkey
  foreign key (preset_id, workspace_id)
  references public.workspace_role_presets(id, workspace_id)
  on delete cascade;

alter table public.workspace_role_preset_data_rooms
  drop constraint if exists workspace_role_preset_data_rooms_room_workspace_fkey;

alter table public.workspace_role_preset_data_rooms
  add constraint workspace_role_preset_data_rooms_room_workspace_fkey
  foreign key (data_room_id, workspace_id)
  references public.data_rooms(id, workspace_id)
  on delete cascade;

create index if not exists idx_workspace_role_preset_data_rooms_preset
  on public.workspace_role_preset_data_rooms (preset_id);

create index if not exists idx_workspace_role_preset_data_rooms_workspace
  on public.workspace_role_preset_data_rooms (workspace_id);

-- Attach presets to members/invites (optional auditing/display).
alter table public.workspace_members
  add column if not exists role_preset_id uuid references public.workspace_role_presets(id) on delete set null;

alter table public.workspace_invites
  add column if not exists role_preset_id uuid references public.workspace_role_presets(id) on delete set null;

-- RLS for presets: owner-only.
alter table public.workspace_role_presets enable row level security;
alter table public.workspace_role_preset_data_rooms enable row level security;

drop policy if exists workspace_role_presets_select_owner on public.workspace_role_presets;
create policy workspace_role_presets_select_owner
on public.workspace_role_presets
for select
using (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'])
);

drop policy if exists workspace_role_presets_write_owner on public.workspace_role_presets;
create policy workspace_role_presets_write_owner
on public.workspace_role_presets
using (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'])
)
with check (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'])
);

drop policy if exists workspace_role_preset_data_rooms_select_owner on public.workspace_role_preset_data_rooms;
create policy workspace_role_preset_data_rooms_select_owner
on public.workspace_role_preset_data_rooms
for select
using (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'])
);

drop policy if exists workspace_role_preset_data_rooms_write_owner on public.workspace_role_preset_data_rooms;
create policy workspace_role_preset_data_rooms_write_owner
on public.workspace_role_preset_data_rooms
using (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'])
)
with check (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'])
);

-- Seed built-in presets for existing + new workspaces.
insert into public.workspace_role_presets (
  workspace_id,
  name,
  description,
  base_role,
  documents_access,
  data_rooms_access_all,
  created_by
)
select
  w.id,
  v.name,
  v.description,
  v.base_role,
  v.documents_access,
  v.data_rooms_access_all,
  w.created_by
from public.workspaces w
cross join (
  values
    (
      'Editor',
      'Full access to documents and data rooms.',
      'editor'::public.user_role,
      'editor'::public.access_level,
      'editor'::public.access_level
    ),
    (
      'Viewer',
      'Read-only access to documents (no data room access by default).',
      'viewer'::public.user_role,
      'viewer'::public.access_level,
      'none'::public.access_level
    )
) as v(name, description, base_role, documents_access, data_rooms_access_all)
on conflict (workspace_id, name) do nothing;

create or replace function public.handle_workspace_created_role_presets()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.workspace_role_presets (
    workspace_id,
    name,
    description,
    base_role,
    documents_access,
    data_rooms_access_all,
    created_by
  )
  values
    (
      new.id,
      'Editor',
      'Full access to documents and data rooms.',
      'editor'::public.user_role,
      'editor'::public.access_level,
      'editor'::public.access_level,
      new.created_by
    ),
    (
      new.id,
      'Viewer',
      'Read-only access to documents (no data room access by default).',
      'viewer'::public.user_role,
      'viewer'::public.access_level,
      'none'::public.access_level,
      new.created_by
    )
  on conflict (workspace_id, name) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_workspace_role_presets_seed on public.workspaces;
create trigger trg_workspace_role_presets_seed
after insert on public.workspaces
for each row execute function public.handle_workspace_created_role_presets();

-- Helper functions for access checks (used in RLS + storage policies).
create or replace function public.can_access_workspace_documents(ws uuid)
returns boolean
language sql
stable
as $$
  select
    public.workspace_has_entitlement(ws)
    and (
      public.has_workspace_role(ws, array['owner'])
      or (
        public.is_workspace_member(ws)
        and exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = ws
            and wm.user_id = auth.uid()
            and wm.documents_access in ('viewer'::public.access_level, 'editor'::public.access_level)
        )
      )
    );
$$;

create or replace function public.can_edit_workspace_documents(ws uuid)
returns boolean
language sql
stable
as $$
  select
    public.workspace_has_entitlement(ws)
    and (
      public.has_workspace_role(ws, array['owner'])
      or (
        public.is_workspace_member(ws)
        and exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = ws
            and wm.user_id = auth.uid()
            and wm.documents_access = 'editor'::public.access_level
        )
      )
    );
$$;

create or replace function public.can_access_data_room(ws uuid, room_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.workspace_has_entitlement(ws)
    and (
      public.has_workspace_role(ws, array['owner'])
      or (
        public.is_workspace_member(ws)
        and (
          exists (
            select 1
            from public.workspace_members wm
            where wm.workspace_id = ws
              and wm.user_id = auth.uid()
              and wm.data_rooms_access_all in ('viewer'::public.access_level, 'editor'::public.access_level)
          )
          or exists (
            select 1
            from public.data_room_members drm
            where drm.workspace_id = ws
              and drm.data_room_id = room_id
              and drm.user_id = auth.uid()
              and drm.access_level in ('viewer'::public.access_level, 'editor'::public.access_level)
          )
        )
      )
    );
$$;

create or replace function public.can_edit_data_room(ws uuid, room_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.workspace_has_entitlement(ws)
    and (
      public.has_workspace_role(ws, array['owner'])
      or (
        public.is_workspace_member(ws)
        and (
          exists (
            select 1
            from public.workspace_members wm
            where wm.workspace_id = ws
              and wm.user_id = auth.uid()
              and wm.data_rooms_access_all = 'editor'::public.access_level
          )
          or exists (
            select 1
            from public.data_room_members drm
            where drm.workspace_id = ws
              and drm.data_room_id = room_id
              and drm.user_id = auth.uid()
              and drm.access_level = 'editor'::public.access_level
          )
        )
      )
    );
$$;

-- data_room_members RLS (owner can list/manage; users can see their own membership).
alter table public.data_room_members enable row level security;

drop policy if exists data_room_members_select_owner_or_self on public.data_room_members;
create policy data_room_members_select_owner_or_self
on public.data_room_members
for select
using (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'])
  or user_id = auth.uid()
);

drop policy if exists data_room_members_insert_owner on public.data_room_members;
create policy data_room_members_insert_owner
on public.data_room_members
for insert
with check (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'])
);

drop policy if exists data_room_members_update_owner on public.data_room_members;
create policy data_room_members_update_owner
on public.data_room_members
for update
using (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'])
)
with check (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'])
);

drop policy if exists data_room_members_delete_owner on public.data_room_members;
create policy data_room_members_delete_owner
on public.data_room_members
for delete
using (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'])
);

-- workspace_invite_data_room_access RLS (owner-only management).
alter table public.workspace_invite_data_room_access enable row level security;

drop policy if exists workspace_invite_data_room_access_select_owner on public.workspace_invite_data_room_access;
create policy workspace_invite_data_room_access_select_owner
on public.workspace_invite_data_room_access
for select
using (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'])
);

drop policy if exists workspace_invite_data_room_access_write_owner on public.workspace_invite_data_room_access;
create policy workspace_invite_data_room_access_write_owner
on public.workspace_invite_data_room_access
using (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'])
)
with check (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'])
);

-- Automatically grant room access to the creator when a data room is created
-- by an editor (owners always have implicit access).
create or replace function public.handle_data_room_created_membership()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.created_by is null then
    return new;
  end if;

  if exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = new.workspace_id
      and wm.user_id = new.created_by
      and wm.role = 'owner'::public.user_role
  ) then
    -- Do not create explicit membership rows for owners by default.
    return new;
  end if;

  insert into public.data_room_members (workspace_id, data_room_id, user_id, access_level, created_by)
  values (new.workspace_id, new.id, new.created_by, 'editor'::public.access_level, new.created_by)
  on conflict (data_room_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_data_room_creator_membership on public.data_rooms;
create trigger trg_data_room_creator_membership
after insert on public.data_rooms
for each row execute function public.handle_data_room_created_membership();

-- ------------------------------------------------------------
-- 3) RLS updates (data rooms / documents / folders / links)
-- ------------------------------------------------------------

-- data_rooms: select requires access, not just workspace membership.
drop policy if exists data_rooms_select on public.data_rooms;
create policy data_rooms_select
on public.data_rooms
for select
using (public.can_access_data_room(workspace_id, id));

-- data_rooms CUD: insert requires editor role; update/delete require edit access.
drop policy if exists data_rooms_cud_editor on public.data_rooms;

create policy data_rooms_insert_editor
on public.data_rooms
for insert
with check (
  public.has_workspace_role(workspace_id, array['owner', 'editor'])
  and public.workspace_has_entitlement(workspace_id)
);

create policy data_rooms_update_editor
on public.data_rooms
for update
using (
  public.can_edit_data_room(workspace_id, id)
)
with check (
  public.can_edit_data_room(workspace_id, id)
);

create policy data_rooms_delete_editor
on public.data_rooms
for delete
using (
  public.can_edit_data_room(workspace_id, id)
);

-- folders: select respects documents + data-room membership rules.
drop policy if exists folders_select on public.folders;
create policy folders_select
on public.folders
for select
using (
  public.workspace_has_entitlement(workspace_id)
  and (
    (data_room_id is null and public.can_access_workspace_documents(workspace_id))
    or (data_room_id is not null and public.can_access_data_room(workspace_id, data_room_id))
  )
);

drop policy if exists folders_cud_editor on public.folders;
create policy folders_cud_editor
on public.folders
using (
  public.workspace_has_entitlement(workspace_id)
  and (
    (data_room_id is null and public.can_edit_workspace_documents(workspace_id))
    or (data_room_id is not null and public.can_edit_data_room(workspace_id, data_room_id))
  )
)
with check (
  public.workspace_has_entitlement(workspace_id)
  and (
    (data_room_id is null and public.can_edit_workspace_documents(workspace_id))
    or (data_room_id is not null and public.can_edit_data_room(workspace_id, data_room_id))
  )
);

-- documents: select respects documents + data-room membership rules.
drop policy if exists documents_select on public.documents;
create policy documents_select
on public.documents
for select
using (
  public.workspace_has_entitlement(workspace_id)
  and (
    (data_room_id is null and public.can_access_workspace_documents(workspace_id))
    or (data_room_id is not null and public.can_access_data_room(workspace_id, data_room_id))
  )
);

drop policy if exists documents_cud_editor on public.documents;
create policy documents_cud_editor
on public.documents
using (
  public.workspace_has_entitlement(workspace_id)
  and (
    (data_room_id is null and public.can_edit_workspace_documents(workspace_id))
    or (data_room_id is not null and public.can_edit_data_room(workspace_id, data_room_id))
  )
)
with check (
  public.workspace_has_entitlement(workspace_id)
  and (
    (data_room_id is null and public.can_edit_workspace_documents(workspace_id))
    or (data_room_id is not null and public.can_edit_data_room(workspace_id, data_room_id))
  )
);

-- data_room_documents: restrict to data-room access (defense-in-depth).
drop policy if exists dr_docs_select on public.data_room_documents;
create policy dr_docs_select
on public.data_room_documents
for select
using (
  exists (
    select 1
    from public.data_rooms dr
    where dr.id = data_room_documents.data_room_id
      and public.can_access_data_room(dr.workspace_id, dr.id)
  )
);

drop policy if exists dr_docs_cud_editor on public.data_room_documents;
create policy dr_docs_cud_editor
on public.data_room_documents
using (
  exists (
    select 1
    from public.data_rooms dr
    where dr.id = data_room_documents.data_room_id
      and public.can_edit_data_room(dr.workspace_id, dr.id)
  )
)
with check (
  exists (
    select 1
    from public.data_rooms dr
    where dr.id = data_room_documents.data_room_id
      and public.can_edit_data_room(dr.workspace_id, dr.id)
  )
);

-- links: select and CUD are limited to accessible resources.
drop policy if exists links_select on public.links;
create policy links_select
on public.links
for select
using (
  public.workspace_has_entitlement(workspace_id)
  and (
    public.has_workspace_role(workspace_id, array['owner'])
    or (
      public.is_workspace_member(workspace_id)
      and (
        (data_room_id is not null and public.can_access_data_room(workspace_id, data_room_id))
        or (
          document_id is not null
          and exists (
            select 1 from public.documents d
            where d.id = links.document_id
          )
        )
      )
    )
  )
);

drop policy if exists links_cud_editor on public.links;

create policy links_insert_editor
on public.links
for insert
with check (
  public.workspace_has_entitlement(workspace_id)
  and (
    (data_room_id is not null and public.can_edit_data_room(workspace_id, data_room_id))
    or (
      document_id is not null
      and exists (
        select 1
        from public.documents d
        where d.id = links.document_id
          and d.workspace_id = links.workspace_id
          and (
            (d.data_room_id is null and public.can_edit_workspace_documents(d.workspace_id))
            or (d.data_room_id is not null and public.can_edit_data_room(d.workspace_id, d.data_room_id))
          )
      )
    )
  )
);

create policy links_update_editor
on public.links
for update
using (
  public.workspace_has_entitlement(workspace_id)
  and (
    (data_room_id is not null and public.can_edit_data_room(workspace_id, data_room_id))
    or (
      document_id is not null
      and exists (
        select 1
        from public.documents d
        where d.id = links.document_id
          and d.workspace_id = links.workspace_id
          and (
            (d.data_room_id is null and public.can_edit_workspace_documents(d.workspace_id))
            or (d.data_room_id is not null and public.can_edit_data_room(d.workspace_id, d.data_room_id))
          )
      )
    )
  )
)
with check (
  public.workspace_has_entitlement(workspace_id)
  and (
    (data_room_id is not null and public.can_edit_data_room(workspace_id, data_room_id))
    or (
      document_id is not null
      and exists (
        select 1
        from public.documents d
        where d.id = links.document_id
          and d.workspace_id = links.workspace_id
          and (
            (d.data_room_id is null and public.can_edit_workspace_documents(d.workspace_id))
            or (d.data_room_id is not null and public.can_edit_data_room(d.workspace_id, d.data_room_id))
          )
      )
    )
  )
);

create policy links_delete_editor
on public.links
for delete
using (
  public.workspace_has_entitlement(workspace_id)
  and (
    (data_room_id is not null and public.can_edit_data_room(workspace_id, data_room_id))
    or (
      document_id is not null
      and exists (
        select 1
        from public.documents d
        where d.id = links.document_id
          and d.workspace_id = links.workspace_id
          and (
            (d.data_room_id is null and public.can_edit_workspace_documents(d.workspace_id))
            or (d.data_room_id is not null and public.can_edit_data_room(d.workspace_id, d.data_room_id))
          )
      )
    )
  )
);

-- ------------------------------------------------------------
-- 4) Storage hardening for new access rules
-- ------------------------------------------------------------

set search_path = storage, public, auth;

-- Data-room buckets should require data-room access (not just workspace membership).
drop policy if exists ws_read_data_room on storage.objects;
create policy ws_read_data_room
on storage.objects
for select
using (
  bucket_id = 'data-room'
  and split_part(name, '/', 1) = 'workspaces'
  and split_part(name, '/', 3) = 'data-rooms'
  and public.can_access_data_room((split_part(name, '/', 2))::uuid, (split_part(name, '/', 4))::uuid)
  and exists (
    select 1
    from public.data_rooms dr
    where dr.id = (split_part(objects.name, '/', 4))::uuid
      and dr.workspace_id = (split_part(objects.name, '/', 2))::uuid
  )
);

drop policy if exists ws_read_converted_data_room on storage.objects;
create policy ws_read_converted_data_room
on storage.objects
for select
using (
  bucket_id = 'converted-data-room'
  and split_part(name, '/', 1) = 'workspaces'
  and split_part(name, '/', 3) = 'data-rooms'
  and public.can_access_data_room((split_part(name, '/', 2))::uuid, (split_part(name, '/', 4))::uuid)
  and exists (
    select 1
    from public.data_rooms dr
    where dr.id = (split_part(objects.name, '/', 4))::uuid
      and dr.workspace_id = (split_part(objects.name, '/', 2))::uuid
  )
);

drop policy if exists ws_write_data_room on storage.objects;
create policy ws_write_data_room
on storage.objects
for insert
with check (
  bucket_id = 'data-room'
  and split_part(name, '/', 1) = 'workspaces'
  and split_part(name, '/', 3) = 'data-rooms'
  and public.can_edit_data_room((split_part(name, '/', 2))::uuid, (split_part(name, '/', 4))::uuid)
  and exists (
    select 1
    from public.data_rooms dr
    where dr.id = (split_part(objects.name, '/', 4))::uuid
      and dr.workspace_id = (split_part(objects.name, '/', 2))::uuid
  )
);

drop policy if exists ws_update_data_room on storage.objects;
create policy ws_update_data_room
on storage.objects
for update
using (
  bucket_id = 'data-room'
  and split_part(name, '/', 1) = 'workspaces'
  and split_part(name, '/', 3) = 'data-rooms'
  and public.can_edit_data_room((split_part(name, '/', 2))::uuid, (split_part(name, '/', 4))::uuid)
  and exists (
    select 1
    from public.data_rooms dr
    where dr.id = (split_part(objects.name, '/', 4))::uuid
      and dr.workspace_id = (split_part(objects.name, '/', 2))::uuid
  )
)
with check (
  bucket_id = 'data-room'
  and split_part(name, '/', 1) = 'workspaces'
  and split_part(name, '/', 3) = 'data-rooms'
  and public.can_edit_data_room((split_part(name, '/', 2))::uuid, (split_part(name, '/', 4))::uuid)
  and exists (
    select 1
    from public.data_rooms dr
    where dr.id = (split_part(objects.name, '/', 4))::uuid
      and dr.workspace_id = (split_part(objects.name, '/', 2))::uuid
  )
);

drop policy if exists ws_delete_data_room on storage.objects;
create policy ws_delete_data_room
on storage.objects
for delete
using (
  bucket_id = 'data-room'
  and split_part(name, '/', 1) = 'workspaces'
  and split_part(name, '/', 3) = 'data-rooms'
  and public.can_edit_data_room((split_part(name, '/', 2))::uuid, (split_part(name, '/', 4))::uuid)
  and exists (
    select 1
    from public.data_rooms dr
    where dr.id = (split_part(objects.name, '/', 4))::uuid
      and dr.workspace_id = (split_part(objects.name, '/', 2))::uuid
  )
);

drop policy if exists ws_write_converted_data_room on storage.objects;
create policy ws_write_converted_data_room
on storage.objects
for insert
with check (
  bucket_id = 'converted-data-room'
  and split_part(name, '/', 1) = 'workspaces'
  and split_part(name, '/', 3) = 'data-rooms'
  and public.can_edit_data_room((split_part(name, '/', 2))::uuid, (split_part(name, '/', 4))::uuid)
  and exists (
    select 1
    from public.data_rooms dr
    where dr.id = (split_part(objects.name, '/', 4))::uuid
      and dr.workspace_id = (split_part(objects.name, '/', 2))::uuid
  )
);

drop policy if exists ws_update_converted_data_room on storage.objects;
create policy ws_update_converted_data_room
on storage.objects
for update
using (
  bucket_id = 'converted-data-room'
  and split_part(name, '/', 1) = 'workspaces'
  and split_part(name, '/', 3) = 'data-rooms'
  and public.can_edit_data_room((split_part(name, '/', 2))::uuid, (split_part(name, '/', 4))::uuid)
  and exists (
    select 1
    from public.data_rooms dr
    where dr.id = (split_part(objects.name, '/', 4))::uuid
      and dr.workspace_id = (split_part(objects.name, '/', 2))::uuid
  )
)
with check (
  bucket_id = 'converted-data-room'
  and split_part(name, '/', 1) = 'workspaces'
  and split_part(name, '/', 3) = 'data-rooms'
  and public.can_edit_data_room((split_part(name, '/', 2))::uuid, (split_part(name, '/', 4))::uuid)
  and exists (
    select 1
    from public.data_rooms dr
    where dr.id = (split_part(objects.name, '/', 4))::uuid
      and dr.workspace_id = (split_part(objects.name, '/', 2))::uuid
  )
);

drop policy if exists ws_delete_converted_data_room on storage.objects;
create policy ws_delete_converted_data_room
on storage.objects
for delete
using (
  bucket_id = 'converted-data-room'
  and split_part(name, '/', 1) = 'workspaces'
  and split_part(name, '/', 3) = 'data-rooms'
  and public.can_edit_data_room((split_part(name, '/', 2))::uuid, (split_part(name, '/', 4))::uuid)
  and exists (
    select 1
    from public.data_rooms dr
    where dr.id = (split_part(objects.name, '/', 4))::uuid
      and dr.workspace_id = (split_part(objects.name, '/', 2))::uuid
  )
);

-- Documents buckets should respect documents access level.
drop policy if exists ws_read_documents on storage.objects;
create policy ws_read_documents
on storage.objects
for select
using (
  bucket_id = 'documents'
  and split_part(name, '/', 1) = 'workspaces'
  and public.can_access_workspace_documents((split_part(name, '/', 2))::uuid)
);

drop policy if exists ws_read_converted_docs on storage.objects;
create policy ws_read_converted_docs
on storage.objects
for select
using (
  bucket_id = 'converted-documents'
  and split_part(name, '/', 1) = 'workspaces'
  and public.can_access_workspace_documents((split_part(name, '/', 2))::uuid)
);

drop policy if exists ws_write_documents on storage.objects;
create policy ws_write_documents
on storage.objects
for insert
with check (
  bucket_id = 'documents'
  and split_part(name, '/', 1) = 'workspaces'
  and public.can_edit_workspace_documents((split_part(name, '/', 2))::uuid)
);

drop policy if exists ws_update_documents on storage.objects;
create policy ws_update_documents
on storage.objects
for update
using (
  bucket_id = 'documents'
  and split_part(name, '/', 1) = 'workspaces'
  and public.can_edit_workspace_documents((split_part(name, '/', 2))::uuid)
)
with check (
  bucket_id = 'documents'
  and split_part(name, '/', 1) = 'workspaces'
  and public.can_edit_workspace_documents((split_part(name, '/', 2))::uuid)
);

drop policy if exists ws_delete_documents on storage.objects;
create policy ws_delete_documents
on storage.objects
for delete
using (
  bucket_id = 'documents'
  and split_part(name, '/', 1) = 'workspaces'
  and public.can_edit_workspace_documents((split_part(name, '/', 2))::uuid)
);

drop policy if exists ws_write_converted_docs on storage.objects;
create policy ws_write_converted_docs
on storage.objects
for insert
with check (
  bucket_id = 'converted-documents'
  and split_part(name, '/', 1) = 'workspaces'
  and public.can_edit_workspace_documents((split_part(name, '/', 2))::uuid)
);

drop policy if exists ws_update_converted_docs on storage.objects;
create policy ws_update_converted_docs
on storage.objects
for update
using (
  bucket_id = 'converted-documents'
  and split_part(name, '/', 1) = 'workspaces'
  and public.can_edit_workspace_documents((split_part(name, '/', 2))::uuid)
)
with check (
  bucket_id = 'converted-documents'
  and split_part(name, '/', 1) = 'workspaces'
  and public.can_edit_workspace_documents((split_part(name, '/', 2))::uuid)
);

drop policy if exists ws_delete_converted_docs on storage.objects;
create policy ws_delete_converted_docs
on storage.objects
for delete
using (
  bucket_id = 'converted-documents'
  and split_part(name, '/', 1) = 'workspaces'
  and public.can_edit_workspace_documents((split_part(name, '/', 2))::uuid)
);

-- ------------------------------------------------------------
-- 4b) Internal audit logging (allow viewer)
-- ------------------------------------------------------------

-- Allow all workspace members (owner/editor/viewer) to record
-- internal audit events for authenticated usage telemetry.
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
  v_claims jsonb := auth.jwt();
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

  if not public.has_workspace_role(p_workspace_id, array['owner', 'editor', 'viewer']) then
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

  if p_resource_id is null then
    raise exception 'resource_id is required';
  end if;

  if v_resource_type = 'data_room' then
    if not public.can_access_data_room(p_workspace_id, p_resource_id) then
      raise exception 'forbidden';
    end if;
  elsif v_resource_type = 'document' then
    if not exists (
      select 1
      from public.documents d
      where d.id = p_resource_id
        and d.workspace_id = p_workspace_id
    ) then
      raise exception 'forbidden';
    end if;
  end if;

  v_actor_email := nullif(trim(both from coalesce(v_claims->>'email', '')), '');
  v_actor_name := nullif(
    trim(
      both from coalesce(
        v_claims->'user_metadata'->>'full_name',
        v_claims->'user_metadata'->>'name',
        ''
      )
    ),
    ''
  );

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

-- ------------------------------------------------------------
-- 5) Grants (defense-in-depth)
-- ------------------------------------------------------------

set search_path = public, auth;

grant all on table public.link_alc_allowed_emails to service_role;
grant select, insert, update, delete on table public.link_alc_allowed_emails to authenticated;

grant all on table public.link_alc_allowed_groups to service_role;
grant select, insert, update, delete on table public.link_alc_allowed_groups to authenticated;

grant all on table public.link_alc_allowed_folders_emails to service_role;
grant select, insert, update, delete on table public.link_alc_allowed_folders_emails to authenticated;

grant all on table public.link_alc_allowed_folders_groups to service_role;
grant select, insert, update, delete on table public.link_alc_allowed_folders_groups to authenticated;

grant all on table public.link_alc_allowed_documents_emails to service_role;
grant select, insert, update, delete on table public.link_alc_allowed_documents_emails to authenticated;

grant all on table public.link_alc_allowed_documents_groups to service_role;
grant select, insert, update, delete on table public.link_alc_allowed_documents_groups to authenticated;

grant all on table public.data_room_members to service_role;
grant select, insert, update, delete on table public.data_room_members to authenticated;

grant all on table public.workspace_invite_data_room_access to service_role;
grant select, insert, update, delete on table public.workspace_invite_data_room_access to authenticated;

grant all on table public.workspace_role_presets to service_role;
grant select, insert, update, delete on table public.workspace_role_presets to authenticated;

grant all on table public.workspace_role_preset_data_rooms to service_role;
grant select, insert, update, delete on table public.workspace_role_preset_data_rooms to authenticated;

-- Keep this as a SINGLE GRANT statement (migration runner uses prepared statements).
grant execute on function
  public.replace_link_alc_rules(uuid, uuid, jsonb),
  public.record_internal_audit_event(uuid, text, text, uuid, uuid, uuid, jsonb),
  public.can_access_workspace_documents(uuid),
  public.can_edit_workspace_documents(uuid),
  public.can_access_data_room(uuid, uuid),
  public.can_edit_data_room(uuid, uuid),
  public.handle_data_room_created_membership()
to authenticated, service_role;
