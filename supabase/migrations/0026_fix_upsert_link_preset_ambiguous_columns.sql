-- Fix PL/pgSQL variable/column name ambiguity in `public.upsert_link_preset`.
--
-- Supabase/Postgres can be configured with `plpgsql.variable_conflict = error`,
-- which causes statements like `where id = ...` to fail in functions that
-- `returns table (id uuid, ...)` because `id` is both an OUT parameter variable
-- and a table column.
--
-- Qualify all column references via a table alias to avoid the ambiguity.

set search_path = public, auth;

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

  if not public.can_edit_workspace_documents(p_workspace_id) then
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

  update public.link_presets as lp
    set name = v_trimmed_name,
        settings_json = coalesce(p_settings_json, '{}'::jsonb),
        updated_at = now()
  where lp.id = v_preset_id
    and lp.workspace_id = p_workspace_id;

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

-- Ensure the function remains callable via PostgREST RPC.
grant execute on function
  public.upsert_link_preset(uuid, text, jsonb, text[], text[], uuid[], uuid[])
to authenticated, service_role;

