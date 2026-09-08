-- Capture decisions at authentication time, never in browser callback order.
-- This migration intentionally leaves delivery disabled. See docs/sign-in-alerts.md.
-- Serialize installation with session insertion so the baseline has no gap.
lock table auth.sessions in share row exclusive mode;

create table public.login_alert_rollout (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  enabled_at timestamptz
);
insert into public.login_alert_rollout (singleton) values (true);

create table public.user_login_baselines (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_session_id uuid,
  created_at timestamptz not null default now()
);

create table public.login_session_events (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null,
  eligible boolean not null,
  disabled_at timestamptz,
  device_label text check (length(device_label) <= 100),
  country_code text check (country_code ~ '^[A-Z]{2}$')
);
create index login_session_events_user_id_idx on public.login_session_events(user_id);

alter table public.login_alert_rollout enable row level security;
alter table public.user_login_baselines enable row level security;
alter table public.login_session_events enable row level security;
revoke all on public.login_alert_rollout, public.user_login_baselines,
  public.login_session_events from public, anon, authenticated, service_role;
grant select on public.login_alert_rollout to service_role;
grant select, update on public.login_session_events to service_role;
create policy login_session_events_service on public.login_session_events
  for all to service_role using (true) with check (true);
create policy login_alert_rollout_service on public.login_alert_rollout
  for select to service_role using (true);

-- Signed-out accounts still have a baseline; invited/unconfirmed accounts that
-- have never authenticated do not. Session existence covers partially updated
-- auth.users records without relying on user-editable metadata.
insert into public.user_login_baselines (user_id)
select u.id from auth.users u
where u.last_sign_in_at is not null
   or exists (select 1 from auth.sessions s where s.user_id = u.id);
insert into public.login_session_events (session_id, user_id, occurred_at, eligible)
select id, user_id, coalesce(created_at, now()), false from auth.sessions;

create function public.capture_login_session()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_enabled boolean;
  v_first uuid;
  v_eligible boolean;
begin
  -- Shared lock permits unrelated sign-ins concurrently and excludes activation.
  select enabled into v_enabled from public.login_alert_rollout
    where singleton for share;
  insert into public.user_login_baselines (user_id, first_session_id)
    values (new.user_id, new.id)
    on conflict (user_id) do nothing returning user_id into v_first;
  v_eligible := coalesce(v_enabled, false) and v_first is null;
  insert into public.login_session_events (session_id, user_id, occurred_at, eligible)
    values (new.id, new.user_id, coalesce(new.created_at, now()), v_eligible);
  if v_eligible then
    perform public.enqueue_lifecycle_email_job(
      'login-session', null, new.user_id, now() + interval '30 seconds',
      'login-session:' || new.user_id::text || ':' || new.id::text,
      jsonb_build_object('sessionId', new.id));
  end if;
  return new;
end;
$$;
revoke all on function public.capture_login_session() from public, anon, authenticated, service_role;
create trigger capture_login_session after insert on auth.sessions
  for each row execute function public.capture_login_session();

-- Operator-only, atomic and idempotent. Deploy the consumer and verify the worker
-- before running. All records before this serialized boundary remain suppressed.
create function public.activate_login_session_alerts()
returns void language plpgsql security definer set search_path = '' as $$
declare v_enabled boolean;
begin
  select enabled into v_enabled from public.login_alert_rollout
    where singleton for update;
  if v_enabled then return; end if;
  update public.login_session_events set eligible = false;
  update public.login_alert_rollout set enabled = true, enabled_at = clock_timestamp()
    where singleton;
end;
$$;
revoke all on function public.activate_login_session_alerts() from public, anon, authenticated, service_role;

-- Called only after the app verifies the JWT. Never accept a client timestamp or
-- create an event here. Live ownership prevents enrichment using a revoked JWT.
create function public.enrich_login_session_event(
  p_user_id uuid, p_session_id uuid, p_device_label text, p_country_code text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_device_label is null or length(p_device_label) > 100
     or (p_country_code is not null and p_country_code !~ '^[A-Z]{2}$') then
    raise exception 'Invalid sign-in context';
  end if;
  if not exists (select 1 from auth.sessions where id = p_session_id and user_id = p_user_id) then
    return false;
  end if;
  update public.login_session_events
    set device_label = coalesce(device_label, p_device_label),
        country_code = coalesce(country_code, p_country_code)
    where session_id = p_session_id and user_id = p_user_id;
  return found;
end;
$$;
revoke all on function public.enrich_login_session_event(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.enrich_login_session_event(uuid, uuid, text, text) to service_role;
