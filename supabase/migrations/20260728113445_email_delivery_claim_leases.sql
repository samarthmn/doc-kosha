alter table public.email_deliveries
  add column if not exists claimed_at timestamptz;

update public.email_deliveries
set claimed_at = created_at
where claimed_at is null;

alter table public.email_deliveries
  alter column claimed_at set default now(),
  alter column claimed_at set not null;

create or replace function public.claim_email_delivery(
  p_template text,
  p_to_email text,
  p_dedupe_key text default null,
  p_user_id uuid default null,
  p_workspace_id uuid default null,
  p_claim_timeout interval default interval '10 minutes'
)
returns table (
  delivery_id uuid,
  claim_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery_id uuid;
  v_existing_state text;
begin
  insert into public.email_deliveries as delivery (
    template,
    to_email,
    dedupe_key,
    user_id,
    workspace_id,
    state,
    claimed_at
  )
  values (
    p_template,
    p_to_email,
    p_dedupe_key,
    p_user_id,
    p_workspace_id,
    'claimed',
    now()
  )
  on conflict (dedupe_key) where dedupe_key is not null
  do update
  set state = 'claimed',
      claimed_at = now(),
      sent_at = null,
      error = null
  where delivery.state = 'failed'
    or (
      delivery.state = 'claimed'
      and delivery.claimed_at <= now() - greatest(
        coalesce(p_claim_timeout, interval '10 minutes'),
        interval '1 minute'
      )
    )
  returning delivery.id into v_delivery_id;

  if v_delivery_id is not null then
    return query select v_delivery_id, 'claimed'::text;
    return;
  end if;

  select delivery.state
  into v_existing_state
  from public.email_deliveries as delivery
  where delivery.dedupe_key = p_dedupe_key;

  return query
  select
    null::uuid,
    case
      when v_existing_state = 'sent' then 'sent'::text
      else 'in_progress'::text
    end;
end;
$$;

alter function public.claim_email_delivery(
  text,
  text,
  text,
  uuid,
  uuid,
  interval
) owner to postgres;
revoke all on function public.claim_email_delivery(
  text,
  text,
  text,
  uuid,
  uuid,
  interval
) from public, anon, authenticated;
grant execute on function public.claim_email_delivery(
  text,
  text,
  text,
  uuid,
  uuid,
  interval
) to service_role;

create or replace function public.requeue_skipped_founder_help_job(
  p_dedupe_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.lifecycle_email_jobs%rowtype;
  v_message_id bigint;
begin
  select *
  into v_job
  from public.lifecycle_email_jobs
  where dedupe_key = p_dedupe_key
    and email_key = 'founder-help-day-1'
  for update;

  if v_job.id is null
    or v_job.status <> 'skipped'
    or coalesce(v_job.payload ->> 'policyVersion', '') = 'eligible-trial-v2'
    or exists (
      select 1
      from public.email_deliveries
      where template = 'founder-help-day-1'
        and dedupe_key = p_dedupe_key
        and state = 'sent'
    )
  then
    return false;
  end if;

  select *
  into v_message_id
  from pgmq.send(
    'lifecycle_email_jobs',
    jsonb_build_object('jobId', v_job.id),
    0
  );

  update public.lifecycle_email_jobs
  set status = 'queued',
      scheduled_for = now(),
      queue_message_id = v_message_id,
      payload = coalesce(payload, '{}'::jsonb)
        || jsonb_build_object('policyVersion', 'eligible-trial-v2'),
      claimed_at = null,
      processed_at = null,
      last_error = null,
      updated_at = now()
  where id = v_job.id;

  return true;
end;
$$;

alter function public.requeue_skipped_founder_help_job(text) owner to postgres;
revoke all on function public.requeue_skipped_founder_help_job(text)
  from public, anon, authenticated;
grant execute on function public.requeue_skipped_founder_help_job(text)
  to service_role;
