-- Performance optimizations for audit logging:
-- 1) Avoid per-row joins into auth/users/profiles inside triggers/RPC.
--    Use JWT claims when available (auth.jwt()).
-- 2) Avoid extra FK existence checks on INSERT/UPDATE (only needed for DELETE).
-- 3) Add composite indexes matching common feed queries.

-- Composite indexes to match common filters:
-- - workspace feed filtered by workspace_id + document_id/data_room_id, ordered by created_at desc
create index if not exists audit_events_workspace_document_created_at_idx
  on public.audit_events (workspace_id, document_id, created_at desc)
  where document_id is not null;

create index if not exists audit_events_workspace_data_room_created_at_idx
  on public.audit_events (workspace_id, data_room_id, created_at desc)
  where data_room_id is not null;

-- Replace the internal audit event RPC to avoid DB lookups for actor identity.
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

  -- Prefer JWT claims; avoid per-call joins into auth tables.
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

-- Replace audit trigger function to avoid joins into auth/users/profiles
-- and to avoid FK existence checks except on DELETE.
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

