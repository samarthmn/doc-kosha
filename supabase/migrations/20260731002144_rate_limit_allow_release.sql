-- Allow a rate-limit charge to be released.
--
-- The original RPC clamped p_increment at 0, so a caller could only ever
-- consume budget. That forced check-then-charge for anything that must not
-- charge on success (a link password: many viewers legitimately submit the
-- CORRECT secret, and only failures should count), which is racy — N
-- concurrent attempts all observe the same pre-charge count.
--
-- With release allowed, callers charge atomically before the expensive
-- comparison and refund on success. The counter floors at 0 so a stray
-- release can never create budget.
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
  v_delta integer := coalesce(p_increment, 1);
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
    greatest(v_delta, 0),
    now()
  )
  on conflict (bucket, identifier, window_start) do update
    set count = greatest(public.rate_limit_events.count + v_delta, 0),
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
