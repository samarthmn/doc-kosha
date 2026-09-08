-- Internal audit log + link permissions (squashed into 0010_*)
--
-- Note: 0011–0014 were squashed into this migration to avoid migration churn.
-- Internal audit log: restrict recorded event types to the product allowlist and
-- add data-room access grant/revoke events.

set search_path = public, auth;

-- Replace audit trigger function to:
-- - Only record allowlisted events
-- - Avoid noisy UPDATE events (e.g., conversion status) by logging document/folder renames only
-- - Support data_room_members access grant/revoke
create or replace function public.record_audit_event_from_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_claims jsonb := auth.jwt();
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
  v_new_title text := null;
  v_old_title text := null;
  v_new_name text := null;
  v_old_name text := null;
begin
  -- Prefer JWT claims; avoid joins into auth tables inside triggers.
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
      v_new_title := nullif(trim(both from coalesce(v_new->>'title', '')), '');
      v_old_title := nullif(trim(both from coalesce(v_old->>'title', '')), '');
    when 'data_rooms' then
      v_workspace_id := coalesce((v_new->>'workspace_id')::uuid, (v_old->>'workspace_id')::uuid);
      v_resource_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid);
      v_data_room_id := v_resource_id;
    when 'folders' then
      v_workspace_id := coalesce((v_new->>'workspace_id')::uuid, (v_old->>'workspace_id')::uuid);
      v_resource_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid);
      v_data_room_id := coalesce((v_new->>'data_room_id')::uuid, (v_old->>'data_room_id')::uuid);
      v_new_name := nullif(trim(both from coalesce(v_new->>'name', '')), '');
      v_old_name := nullif(trim(both from coalesce(v_old->>'name', '')), '');
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
    when 'data_room_members' then
      v_workspace_id := coalesce((v_new->>'workspace_id')::uuid, (v_old->>'workspace_id')::uuid);
      v_data_room_id := coalesce((v_new->>'data_room_id')::uuid, (v_old->>'data_room_id')::uuid);
      v_resource_id := v_data_room_id;
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

  -- ------------------------------------------------------------
  -- Allowlist filtering (product-defined)
  -- ------------------------------------------------------------
  if tg_table_name = 'documents' then
    -- Upload / delete always logged; rename logged as title-only change.
    if tg_op = 'UPDATE' then
      if v_new_title is distinct from v_old_title then
        null;
      else
        return coalesce(new, old);
      end if;
    end if;
  elsif tg_table_name = 'data_rooms' then
    -- Record data-room creation only (not rename/delete).
    if tg_op <> 'INSERT' then
      return coalesce(new, old);
    end if;
  elsif tg_table_name = 'links' then
    -- Link create/update/delete (document + data room).
    null;
  elsif tg_table_name = 'data_room_documents' then
    -- Upload/delete document inside a data room.
    if tg_op not in ('INSERT', 'DELETE') then
      return coalesce(new, old);
    end if;
  elsif tg_table_name = 'folders' then
    -- Only data-room folders (not workspace document library folders).
    if v_data_room_id is null then
      return coalesce(new, old);
    end if;
    if tg_op = 'UPDATE' then
      if v_new_name is distinct from v_old_name then
        null;
      else
        return coalesce(new, old);
      end if;
    end if;
  elsif tg_table_name = 'data_room_members' then
    -- Access giving/revoke only.
    if tg_op not in ('INSERT', 'DELETE') then
      return coalesce(new, old);
    end if;
  else
    -- Everything else is no longer considered part of the internal audit log.
    return coalesce(new, old);
  end if;

  -- Critical safety: never allow FK constraints on audit_events to block mutations.
  -- Only needed on DELETE (for non-DELETE the referenced row should exist).
  if tg_op = 'DELETE' then
    if v_data_room_id is not null then
      perform 1 from public.data_rooms dr where dr.id = v_data_room_id;
      if not found then
        v_data_room_id := null;
      end if;
    end if;
    if v_document_id is not null then
      perform 1 from public.documents d where d.id = v_document_id;
      if not found then
        v_document_id := null;
      end if;
    end if;
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

-- Ensure data-room access grants/revokes are recorded.
drop trigger if exists audit_data_room_members_trigger on public.data_room_members;
create trigger audit_data_room_members_trigger
after insert or delete on public.data_room_members
for each row execute function public.record_audit_event_from_trigger();


-- =====================================================================

-- ------------------------------------------------------------
-- Squashed: 0011_fix_replace_link_allowlist_rules_permissions.sql
-- ------------------------------------------------------------
-- =====================================================================
-- Editors should be able to manage per-link allowlist rules via RPC.
-- This RPC is SECURITY DEFINER and must enforce access-level permissions
-- (documents_access/data_rooms_access_*), not legacy base roles.

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
  v_link_document_id uuid := null;
  v_link_data_room_id uuid := null;
  v_doc_data_room_id uuid := null;
  v_can_edit boolean := false;
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

  select l.document_id, l.data_room_id
    into v_link_document_id, v_link_data_room_id
  from public.links l
  where l.id = p_link_id and l.workspace_id = p_workspace_id;
  if not found then
    raise exception 'link not found';
  end if;

  if v_link_data_room_id is not null then
    v_can_edit := public.can_edit_data_room(p_workspace_id, v_link_data_room_id);
  elsif v_link_document_id is not null then
    select d.data_room_id
      into v_doc_data_room_id
    from public.documents d
    where d.id = v_link_document_id and d.workspace_id = p_workspace_id;
    if not found then
      raise exception 'document not found';
    end if;

    if v_doc_data_room_id is null then
      v_can_edit := public.can_edit_workspace_documents(p_workspace_id);
    else
      v_can_edit := public.can_edit_data_room(p_workspace_id, v_doc_data_room_id);
    end if;
  else
    raise exception 'unsupported link target';
  end if;

  if not v_can_edit then
    raise exception 'forbidden';
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

-- ------------------------------------------------------------
-- Squashed: 0012_fix_replace_link_preset_rules_permissions.sql
-- ------------------------------------------------------------
-- =====================================================================
-- Editors should be able to manage link preset allowlist rules via RPC.
-- Presets are workspace-scoped; enforce workspace document editor access.

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

  if not public.can_edit_workspace_documents(p_workspace_id) then
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


-- =====================================================================

-- ------------------------------------------------------------
-- Squashed: 0013_fix_update_workspace_user_group_atomic_permissions.sql
-- ------------------------------------------------------------
-- =====================================================================
-- Editors should be able to manage workspace user groups via RPC.
-- These groups are used for link allowlisting; enforce workspace document editor access.

-- NOTE: Supabase local migrator prepares statements; bundling multiple CREATE
-- FUNCTION blocks sometimes causes "cannot insert multiple commands into a
-- prepared statement". Define these RPC replacements via a single DO block.
do $dk_0010_atomic_rpcs$
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

  if not public.can_edit_workspace_documents(p_workspace_id) then
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
  v_overlap_emails text[] := array[]::text[];
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

  if not public.can_edit_data_room(p_workspace_id, v_data_room_id) then
    raise exception 'forbidden';
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

  -- Reject ALC rules that allow emails blocked at the link level.
  with blocked_direct as (
    select distinct lower(trim(be.email)) as email
    from public.link_blocked_emails be
    where be.workspace_id = p_workspace_id
      and be.link_id = p_link_id
      and char_length(trim(be.email)) > 0
  ),
  blocked_group_ids as (
    select distinct bg.group_id
    from public.link_blocked_groups bg
    where bg.workspace_id = p_workspace_id
      and bg.link_id = p_link_id
      and bg.group_id is not null
  ),
  blocked_group_emails as (
    select distinct lower(trim(e.email)) as email
    from public.workspace_user_group_emails e
    join blocked_group_ids g on g.group_id = e.group_id
    where e.workspace_id = p_workspace_id
      and char_length(trim(e.email)) > 0
  ),
  blocked as (
    select email from blocked_direct
    union
    select email from blocked_group_emails
  ),
  alc_direct_emails as (
    select distinct lower(trim(e)) as email
    from jsonb_array_elements_text(
      coalesce(p_payload->'room'->'allowedEmails', '[]'::jsonb)
    ) e
    where char_length(trim(e)) > 0
    union
    select distinct lower(trim(e)) as email
    from jsonb_array_elements(coalesce(p_payload->'folders', '[]'::jsonb)) x
    cross join lateral jsonb_array_elements_text(
      coalesce(x->'allowedEmails', '[]'::jsonb)
    ) e
    where (x ? 'folderId') and char_length(trim(e)) > 0
    union
    select distinct lower(trim(e)) as email
    from jsonb_array_elements(coalesce(p_payload->'documents', '[]'::jsonb)) x
    cross join lateral jsonb_array_elements_text(
      coalesce(x->'allowedEmails', '[]'::jsonb)
    ) e
    where (x ? 'documentId') and char_length(trim(e)) > 0
  ),
  alc_group_ids as (
    select distinct (trim(g))::uuid as group_id
    from jsonb_array_elements_text(
      coalesce(p_payload->'room'->'allowedGroupIds', '[]'::jsonb)
    ) g
    where char_length(trim(g)) > 0
    union
    select distinct (trim(g))::uuid as group_id
    from jsonb_array_elements(coalesce(p_payload->'folders', '[]'::jsonb)) x
    cross join lateral jsonb_array_elements_text(
      coalesce(x->'allowedGroupIds', '[]'::jsonb)
    ) g
    where (x ? 'folderId') and char_length(trim(g)) > 0
    union
    select distinct (trim(g))::uuid as group_id
    from jsonb_array_elements(coalesce(p_payload->'documents', '[]'::jsonb)) x
    cross join lateral jsonb_array_elements_text(
      coalesce(x->'allowedGroupIds', '[]'::jsonb)
    ) g
    where (x ? 'documentId') and char_length(trim(g)) > 0
  ),
  alc_group_emails as (
    select distinct lower(trim(e.email)) as email
    from public.workspace_user_group_emails e
    join alc_group_ids g on g.group_id = e.group_id
    where e.workspace_id = p_workspace_id
      and char_length(trim(e.email)) > 0
  ),
  alc_allowed as (
    select email from alc_direct_emails
    union
    select email from alc_group_emails
  ),
  overlap_emails as (
    select email from alc_allowed
    intersect
    select email from blocked
  )
  select coalesce(array_agg(email order by email), array[]::text[])
  into v_overlap_emails
  from (select email from overlap_emails order by email limit 6) s;

  if coalesce(array_length(v_overlap_emails, 1), 0) > 0 then
    raise exception 'overlapping rules: %', array_to_string(v_overlap_emails, ', ');
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
  with room_allowed as (
    select distinct (trim(g))::uuid as group_id
    from jsonb_array_elements_text(
      coalesce(p_payload->'room'->'allowedGroupIds', '[]'::jsonb)
    ) g
    where char_length(trim(g)) > 0
  )
  insert into public.link_alc_allowed_groups (workspace_id, link_id, group_id, created_by)
  select p_workspace_id, p_link_id, a.group_id, v_actor_id
  from room_allowed a;

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
$dk$;
end;
$dk_0010_atomic_rpcs$;


-- =====================================================================
