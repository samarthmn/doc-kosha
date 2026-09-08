begin;

select plan(21);

select is(
  public.record_rate_limit_attempt(
    'otp-link',
    'link-1',
    date_trunc('minute', now())
  ),
  1,
  'the first rate-limit attempt returns one'
);

select is(
  public.record_rate_limit_attempt(
    'otp-link',
    'link-1',
    date_trunc('minute', now()),
    2
  ),
  3,
  'repeated attempts atomically return the running count'
);

select is(
  public.record_rate_limit_attempt(
    'otp-email',
    'link-1',
    date_trunc('minute', now())
  ),
  1,
  'rate-limit buckets are isolated'
);

select is(
  public.record_rate_limit_attempt(
    'otp-link',
    'link-2',
    date_trunc('minute', now())
  ),
  1,
  'rate-limit identifiers are isolated'
);

select is(
  public.record_rate_limit_attempt(
    'otp-link',
    'link-1',
    date_trunc('minute', now()) + interval '1 minute'
  ),
  1,
  'rate-limit windows are isolated'
);

select is(
  public.record_rate_limit_attempt(
    'otp-link',
    'link-1',
    date_trunc('minute', now()),
    -10
  ),
  0,
  'a negative increment releases budget and floors at zero'
);

-- Rebuild the count so the following assertions continue from a known value:
-- releasing is now supported so callers can charge before an expensive
-- comparison and refund when it succeeds.
select is(
  public.record_rate_limit_attempt(
    'otp-link',
    'link-1',
    date_trunc('minute', now()),
    3
  ),
  3,
  'charging after a release resumes from the floored count'
);

select is(
  public.record_rate_limit_attempt(
    'otp-link',
    'link-1',
    date_trunc('minute', now()),
    null
  ),
  4,
  'a null increment uses the default increment without decreasing the count'
);

-- Keep the pruning count deterministic on a long-lived local database. The
-- function intentionally prunes every expired bucket, so stale application or
-- earlier e2e rows would otherwise make this assertion depend on local state.
-- The test transaction rolls this cleanup back with the rest of the fixture.
delete from public.rate_limit_events
where window_start < now() - interval '48 hours';

insert into public.rate_limit_events (
  bucket,
  identifier,
  window_start,
  count
)
values
  ('prune-test', 'old', now() - interval '49 hours', 1),
  ('prune-test', 'recent', now() - interval '47 hours', 1);

select is(
  public.prune_rate_limit_events(48),
  1,
  'pruning returns the number of old rate-limit rows removed'
);

select ok(
  not exists (
    select 1
    from public.rate_limit_events
    where bucket = 'prune-test'
      and identifier = 'old'
  ),
  'pruning removes rows older than the retention window'
);

select ok(
  exists (
    select 1
    from public.rate_limit_events
    where bucket = 'prune-test'
      and identifier = 'recent'
  ),
  'pruning retains rows inside the retention window'
);

select has_column(
  'public',
  'email_otps',
  'attempts',
  'email OTPs have a per-code attempts counter'
);

select is(
  (
    select column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'email_otps'
      and column_name = 'attempts'
  ),
  '0',
  'the email OTP attempts counter defaults to zero'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.rate_limit_events'::regclass
  ),
  'row-level security is enabled on rate-limit events'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'rate_limit_events'
      and policyname = 'rate_limit_events_service_role_only'
  ),
  'rate-limit events have the service-role-only policy'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.record_rate_limit_attempt(text,text,timestamp with time zone,integer)',
    'EXECUTE'
  ),
  'the service role can record rate-limit attempts'
);

select isnt(
  has_function_privilege(
    'anon',
    'public.record_rate_limit_attempt(text,text,timestamp with time zone,integer)',
    'EXECUTE'
  ),
  true,
  'anonymous clients cannot record rate-limit attempts'
);

select isnt(
  has_function_privilege(
    'authenticated',
    'public.record_rate_limit_attempt(text,text,timestamp with time zone,integer)',
    'EXECUTE'
  ),
  true,
  'authenticated clients cannot record rate-limit attempts'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.prune_rate_limit_events(integer)',
    'EXECUTE'
  ),
  'the service role can prune rate-limit events'
);

select isnt(
  has_function_privilege(
    'anon',
    'public.prune_rate_limit_events(integer)',
    'EXECUTE'
  ),
  true,
  'anonymous clients cannot prune rate-limit events'
);

select isnt(
  has_function_privilege(
    'authenticated',
    'public.prune_rate_limit_events(integer)',
    'EXECUTE'
  ),
  true,
  'authenticated clients cannot prune rate-limit events'
);

select * from finish();

rollback;
