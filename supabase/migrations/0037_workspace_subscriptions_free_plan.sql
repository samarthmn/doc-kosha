alter table public.workspace_subscriptions
  drop constraint if exists workspace_subscriptions_plan_id_check;

alter table public.workspace_subscriptions
  add constraint workspace_subscriptions_plan_id_check
  check (plan_id = any (array['free'::text, 'essential'::text, 'plus'::text, 'max'::text]));

create or replace function public.workspace_effective_plan_id(ws uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.plan_id
      from public.workspace_subscriptions s
      where s.workspace_id = ws
        and (
          (s.status = 'active' and (s.current_period_ends_at is null or s.current_period_ends_at > now()))
          or (s.status = 'trialing' and s.trial_ends_at is not null and s.trial_ends_at > now())
        )
    ),
    'free'
  );
$$;

alter function public.workspace_effective_plan_id(uuid) owner to postgres;
grant execute on function public.workspace_effective_plan_id(uuid) to authenticated, service_role;

create or replace function public.lock_workspace_free_plan_guard(ws uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(37037, hashtext(ws::text));

  perform 1
  from public.workspaces w
  where w.id = ws
  for update;
end;
$$;

alter function public.lock_workspace_free_plan_guard(uuid) owner to postgres;
grant execute on function public.lock_workspace_free_plan_guard(uuid) to authenticated, service_role;

create or replace function public.enforce_free_plan_document_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id text;
  v_used_bytes bigint;
  v_old_size bigint := 0;
  v_new_size bigint := greatest(coalesce(new.size_bytes, 0), 0);
  v_free_storage_limit bigint := 262144000;
begin
  v_plan_id := public.workspace_effective_plan_id(new.workspace_id);

  if v_plan_id <> 'free' then
    return new;
  end if;

  perform public.lock_workspace_free_plan_guard(new.workspace_id);

  if lower(coalesce(new.file_type, '')) <> 'pdf' then
    raise exception 'Free workspaces support PDF uploads only'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.workspace_id = new.workspace_id then
    v_old_size := greatest(coalesce(old.size_bytes, 0), 0);
  end if;

  select coalesce(s.storage_used_bytes, 0)
    into v_used_bytes
  from public.workspace_storage_current s
  where s.workspace_id = new.workspace_id;

  v_used_bytes := coalesce(v_used_bytes, 0);

  if greatest(0, v_used_bytes - v_old_size) + v_new_size > v_free_storage_limit then
    raise exception 'Free workspace storage limit exceeded'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

alter function public.enforce_free_plan_document_limits() owner to postgres;

drop trigger if exists enforce_free_plan_document_limits on public.documents;
create trigger enforce_free_plan_document_limits
before insert or update of workspace_id, file_type, size_bytes on public.documents
for each row execute function public.enforce_free_plan_document_limits();

create or replace function public.enforce_free_plan_version_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_plan_id text;
begin
  select d.workspace_id
    into v_workspace_id
  from public.documents d
  where d.id = new.document_id;

  if v_workspace_id is null then
    return new;
  end if;

  v_plan_id := public.workspace_effective_plan_id(v_workspace_id);
  if v_plan_id <> 'free' then
    return new;
  end if;

  perform public.lock_workspace_free_plan_guard(v_workspace_id);

  if coalesce(new.state, 'retained') <> 'pruned' then
    raise exception 'Free workspaces do not include previous versions'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

alter function public.enforce_free_plan_version_limits() owner to postgres;

drop trigger if exists enforce_free_plan_version_limits on public.document_versions;
create trigger enforce_free_plan_version_limits
before insert or update of document_id, state on public.document_versions
for each row execute function public.enforce_free_plan_version_limits();

create or replace function public.workspace_allows_new_member(ws uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_member_count integer;
begin
  if public.workspace_effective_plan_id(ws) <> 'free' then
    return true;
  end if;

  perform public.lock_workspace_free_plan_guard(ws);

  select count(*)
    into v_member_count
  from public.workspace_members wm
  where wm.workspace_id = ws;

  return v_member_count < 1;
end;
$$;

alter function public.workspace_allows_new_member(uuid) owner to postgres;
grant execute on function public.workspace_allows_new_member(uuid) to authenticated, service_role;

create or replace function public.enforce_free_plan_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_members integer;
begin
  if public.workspace_effective_plan_id(new.workspace_id) <> 'free' then
    return new;
  end if;

  perform public.lock_workspace_free_plan_guard(new.workspace_id);

  if tg_op = 'UPDATE' then
    select count(*)
      into v_existing_members
    from public.workspace_members wm
    where wm.workspace_id = new.workspace_id
      and not (
        wm.workspace_id = old.workspace_id
        and wm.user_id = old.user_id
      );
  else
    select count(*)
      into v_existing_members
    from public.workspace_members wm
    where wm.workspace_id = new.workspace_id;
  end if;

  if v_existing_members >= 1 then
    raise exception 'Free workspaces include one owner only'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

alter function public.enforce_free_plan_member_limit() owner to postgres;

drop trigger if exists enforce_free_plan_member_limit on public.workspace_members;
create trigger enforce_free_plan_member_limit
before insert or update of workspace_id, user_id on public.workspace_members
for each row execute function public.enforce_free_plan_member_limit();

create or replace function public.enforce_free_plan_invite_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_count integer;
begin
  if public.workspace_effective_plan_id(new.workspace_id) <> 'free' then
    return new;
  end if;

  perform public.lock_workspace_free_plan_guard(new.workspace_id);

  if new.accepted_at is not null or new.revoked_at is not null then
    return new;
  end if;

  select count(*)
    into v_member_count
  from public.workspace_members wm
  where wm.workspace_id = new.workspace_id;

  if v_member_count >= 1 then
    raise exception 'Free workspaces include one owner only'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

alter function public.enforce_free_plan_invite_limit() owner to postgres;

drop trigger if exists enforce_free_plan_invite_limit on public.workspace_invites;
create trigger enforce_free_plan_invite_limit
before insert or update of workspace_id, accepted_at, revoked_at on public.workspace_invites
for each row execute function public.enforce_free_plan_invite_limit();

drop policy if exists members_insert_owner on public.workspace_members;
create policy members_insert_owner
on public.workspace_members
for insert
with check (
  auth.role() = 'service_role'::text
  or (
    public.has_workspace_role(workspace_id, array['owner'::text])
    and public.workspace_allows_new_member(workspace_id)
  )
);

drop policy if exists workspace_invites_manage_owner on public.workspace_invites;
create policy workspace_invites_manage_owner
on public.workspace_invites
using (
  auth.role() = 'service_role'::text
  or public.has_workspace_role(workspace_id, array['owner'::text])
)
with check (
  auth.role() = 'service_role'::text
  or (
    public.has_workspace_role(workspace_id, array['owner'::text])
    and (
      accepted_at is not null
      or revoked_at is not null
      or public.workspace_allows_new_member(workspace_id)
    )
  )
);

drop policy if exists workspace_subscriptions_write_owner on public.workspace_subscriptions;
drop policy if exists workspace_subscriptions_service_role_write on public.workspace_subscriptions;
create policy workspace_subscriptions_service_role_write
on public.workspace_subscriptions
for all
using (auth.role() = 'service_role'::text)
with check (auth.role() = 'service_role'::text);
