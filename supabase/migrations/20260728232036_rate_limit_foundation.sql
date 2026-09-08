create table public.rate_limit_events (
  bucket text not null,
  identifier text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (bucket, identifier, window_start)
);

comment on table public.rate_limit_events is
  'Atomic fixed-window counters for server-side abuse rate limiting.';

alter table public.rate_limit_events enable row level security;

create policy "rate_limit_events_service_role_only"
on public.rate_limit_events
using (auth.role() = 'service_role'::text)
with check (auth.role() = 'service_role'::text);

create or replace function public.record_rate_limit_attempt(
  p_bucket text,
  p_identifier text,
  p_window_start timestamptz,
  p_increment integer default 1
) returns integer
  language plpgsql
  security definer
  set search_path to public
as $$
declare
  v_count integer;
begin
  insert into public.rate_limit_events (
    bucket,
    identifier,
    window_start,
    count,
    updated_at
  )
  values (
    p_bucket,
    p_identifier,
    p_window_start,
    greatest(coalesce(p_increment, 1), 0),
    now()
  )
  on conflict (bucket, identifier, window_start) do update
    set count = public.rate_limit_events.count + greatest(coalesce(p_increment, 1), 0),
        updated_at = now()
  returning count into v_count;

  return v_count;
end;
$$;

alter function public.record_rate_limit_attempt(text, text, timestamptz, integer)
  owner to postgres;

revoke all on function public.record_rate_limit_attempt(text, text, timestamptz, integer)
  from public;
revoke all on function public.record_rate_limit_attempt(text, text, timestamptz, integer)
  from anon;
revoke all on function public.record_rate_limit_attempt(text, text, timestamptz, integer)
  from authenticated;
grant execute on function public.record_rate_limit_attempt(text, text, timestamptz, integer)
  to service_role;

alter table public.email_otps
  add column attempts integer not null default 0;

comment on column public.email_otps.attempts is
  'Per-code guess counter consumed by a later rate-limiting task.';

create or replace function public.prune_rate_limit_events(
  p_keep_hours integer default 48
) returns integer
  language plpgsql
  security definer
  set search_path to public
as $$
declare
  deleted_count integer;
begin
  delete from public.rate_limit_events
  where window_start < now() - make_interval(hours => p_keep_hours);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

alter function public.prune_rate_limit_events(integer)
  owner to postgres;

revoke all on function public.prune_rate_limit_events(integer) from public;
revoke all on function public.prune_rate_limit_events(integer) from anon;
revoke all on function public.prune_rate_limit_events(integer) from authenticated;
grant execute on function public.prune_rate_limit_events(integer) to service_role;
