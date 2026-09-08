begin;

select plan(6);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'founder-requeue@example.com',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-0000-0000-000000000011',
    'authenticated',
    'authenticated',
    'founder-next-candidate@example.com',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

insert into public.workspaces (id, name, created_by)
values
  (
    '20000000-0000-0000-0000-000000000002',
    'Founder Requeue Test',
    '20000000-0000-0000-0000-000000000001'
  ),
  (
    '20000000-0000-0000-0000-000000000012',
    'Founder Next Candidate Test',
    '20000000-0000-0000-0000-000000000011'
  );

insert into public.workspace_subscriptions (
  workspace_id,
  plan_id,
  billing_interval,
  status,
  trial_started_at,
  trial_ends_at
)
values
  (
    '20000000-0000-0000-0000-000000000002',
    'essential',
    'month',
    'trialing',
    now() - interval '2 days',
    now() + interval '12 days'
  ),
  (
    '20000000-0000-0000-0000-000000000012',
    'essential',
    'month',
    'trialing',
    now() - interval '2 days',
    now() + interval '12 days'
  );

insert into public.lifecycle_email_jobs (
  id,
  email_key,
  workspace_id,
  user_id,
  scheduled_for,
  dedupe_key,
  payload,
  status,
  processed_at
)
values (
  '20000000-0000-0000-0000-000000000003',
  'founder-help-day-1',
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001',
  now() - interval '1 day',
  'founder-help-day-1:requeue-test',
  '{"trialStartedAt":"2026-07-27T00:00:00.000Z"}'::jsonb,
  'skipped',
  now()
);

insert into public.email_deliveries (
  template,
  to_email,
  user_id,
  workspace_id,
  dedupe_key,
  state
)
values (
  'founder-help-day-1',
  'founder-requeue@example.com',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  'founder-help-day-1:requeue-test',
  'claimed'
);

select ok(
  exists (
    select 1
    from public.list_due_founder_help_candidates(
      now() - interval '1 day',
      now(),
      1
    )
    where workspace_id = '20000000-0000-0000-0000-000000000002'
  ),
  'an old-policy skipped job remains an actionable founder candidate'
);

select ok(
  public.requeue_skipped_founder_help_job(
    'founder-help-day-1:requeue-test'
  ),
  'an old-policy skipped founder job is requeued once'
);

select is(
  (
    select status
    from public.lifecycle_email_jobs
    where id = '20000000-0000-0000-0000-000000000003'
  ),
  'queued',
  'the recovered founder job returns to queued status'
);

select ok(
  (
    select
      queue_message_id is not null
      and payload ->> 'policyVersion' = 'eligible-trial-v2'
      and processed_at is null
    from public.lifecycle_email_jobs
    where id = '20000000-0000-0000-0000-000000000003'
  ),
  'the recovered job has a queue message and the new policy marker'
);

select isnt(
  public.requeue_skipped_founder_help_job(
    'founder-help-day-1:requeue-test'
  ),
  true,
  'the same founder job cannot be requeued twice'
);

select is(
  (
    select workspace_id
    from public.list_due_founder_help_candidates(
      now() - interval '1 day',
      now(),
      1
    )
  ),
  '20000000-0000-0000-0000-000000000012'::uuid,
  'a non-actionable earlier row does not starve the next due founder candidate'
);

select * from finish();

rollback;
