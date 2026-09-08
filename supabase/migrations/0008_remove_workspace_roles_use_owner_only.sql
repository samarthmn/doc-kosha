-- Remove workspace member "base role" (owner/editor/viewer) from member/invite/preset rows.
-- Keep a single admin concept: workspace owner = workspaces.created_by.
-- All other permissions are governed by access-level fields (documents_access, data_rooms_access_all, etc).

set search_path = public, auth;

-- ------------------------------------------------------------
-- 1) Owner checks (backwards-compatible helper)
-- ------------------------------------------------------------

create or replace function public.has_workspace_role(ws uuid, roles text[])
returns boolean
language sql
stable
as $$
  select
    (auth.role() = 'service_role')
    or (
      auth.uid() is not null
      and ('owner' = any(roles))
      and exists (
        select 1
        from public.workspaces w
        where w.id = ws
          and w.created_by = auth.uid()
      )
    );
$$;

create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
as $$
  select
    (auth.role() = 'service_role')
    or (
      auth.uid() is not null
      and (
        exists (
          select 1
          from public.workspaces w
          where w.id = ws
            and w.created_by = auth.uid()
        )
        or exists (
          select 1
          from public.workspace_members wm
          where wm.workspace_id = ws
            and wm.user_id = auth.uid()
        )
      )
    );
$$;

-- Owner membership row is still useful for listing members, but it no longer stores a role.
create or replace function public.add_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id)
  values (new.id, new.created_by)
  on conflict do nothing;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2) Update any remaining functions that referenced member roles
-- ------------------------------------------------------------

-- Owners have implicit access; do not create explicit data_room_members rows for owners.
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
    from public.workspaces w
    where w.id = new.workspace_id
      and w.created_by = new.created_by
  ) then
    return new;
  end if;

  insert into public.data_room_members (
    workspace_id,
    data_room_id,
    user_id,
    access_level,
    created_by
  )
  values (
    new.workspace_id,
    new.id,
    new.created_by,
    'editor'::public.access_level,
    new.created_by
  )
  on conflict (data_room_id, user_id) do nothing;

  return new;
end;
$$;

-- Preset seeding trigger: presets are apply-only and no longer store base_role.
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
    documents_access,
    data_rooms_access_all,
    created_by
  )
  values
    (
      new.id,
      'Editor',
      'Full access to documents and data rooms.',
      'editor'::public.access_level,
      'editor'::public.access_level,
      new.created_by
    ),
    (
      new.id,
      'Viewer',
      'Read-only access to documents (no data room access by default).',
      'viewer'::public.access_level,
      'none'::public.access_level,
      new.created_by
    )
  on conflict (workspace_id, name) do nothing;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3) RLS policies that previously relied on workspace_members.role
-- ------------------------------------------------------------

-- workspace_members: owner can manage; users can read their own membership.
drop policy if exists members_insert_owner on public.workspace_members;
create policy members_insert_owner
on public.workspace_members
for insert
with check (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'::text])
);

drop policy if exists members_update_owner on public.workspace_members;
create policy members_update_owner
on public.workspace_members
for update
using (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'::text])
)
with check (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'::text])
);

drop policy if exists members_delete_owner on public.workspace_members;
create policy members_delete_owner
on public.workspace_members
for delete
using (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'::text])
);

-- workspace_invites: owner-only view/manage (admin surface).
drop policy if exists workspace_invites_manage_owner on public.workspace_invites;
create policy workspace_invites_manage_owner
on public.workspace_invites
using (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'::text])
)
with check (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'::text])
);

drop policy if exists workspace_invites_select_members on public.workspace_invites;
create policy workspace_invites_select_members
on public.workspace_invites
for select
using (
  (auth.role() = 'service_role')
  or public.has_workspace_role(workspace_id, array['owner'::text])
);

-- ------------------------------------------------------------
-- 4) Drop base role columns (apply-only presets; access-level controls are persisted)
-- ------------------------------------------------------------

alter table public.workspace_members
  drop column if exists role;

alter table public.workspace_invites
  drop column if exists role;

alter table public.workspace_role_presets
  drop column if exists base_role;
