-- Prevent audit triggers from breaking core writes/deletes.
-- For DELETE operations (and any time the referenced row doesn't exist),
-- ensure audit_events.document_id/data_room_id are set to NULL so FK constraints
-- never block mutations.

-- data_room_documents can be deleted via cascade after the parent data_rooms row
-- is already gone. Persist workspace_id on the join row so audit triggers can
-- still resolve it without relying on the parent lookup.
alter table public.data_room_documents
  add column if not exists workspace_id uuid;

update public.data_room_documents drd
set workspace_id = dr.workspace_id
from public.data_rooms dr
where dr.id = drd.data_room_id
  and drd.workspace_id is null;

create or replace function public.set_data_room_documents_workspace_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.workspace_id is null then
    select dr.workspace_id
      into new.workspace_id
    from public.data_rooms dr
    where dr.id = new.data_room_id;
  end if;
  return new;
end;
$$;

drop trigger if exists data_room_documents_set_workspace_id on public.data_room_documents;
create trigger data_room_documents_set_workspace_id
before insert or update of data_room_id on public.data_room_documents
for each row execute function public.set_data_room_documents_workspace_id();

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
      v_workspace_id := coalesce(
        (v_new->>'workspace_id')::uuid,
        (v_old->>'workspace_id')::uuid,
        (select dr.workspace_id from public.data_rooms dr where dr.id = v_data_room_id)
      );
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
  -- If referenced rows don't exist (common for DELETE triggers), NULL them.
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

  begin
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
  exception
    when others then
      raise warning 'audit_events insert failed (table=%, op=%): %',
        tg_table_name,
        lower(tg_op),
        sqlerrm;
  end;

  return coalesce(new, old);
end;
$$;

