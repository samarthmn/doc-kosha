create extension if not exists pgmq;

do $$
begin
  if to_regclass('pgmq.q_lifecycle_email_jobs') is null then
    perform pgmq.create('lifecycle_email_jobs');
  end if;
end;
$$;

alter table public.lifecycle_email_jobs
  add column if not exists queue_message_id bigint null;

create unique index if not exists idx_lifecycle_email_jobs_queue_message_id
  on public.lifecycle_email_jobs(queue_message_id)
  where queue_message_id is not null;

create or replace function public.enqueue_lifecycle_email_job(
  p_email_key text,
  p_workspace_id uuid,
  p_user_id uuid default null,
  p_scheduled_for timestamptz default now(),
  p_dedupe_key text default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_job public.lifecycle_email_jobs%rowtype;
  v_message_id bigint;
  v_delay_seconds integer;
begin
  insert into public.lifecycle_email_jobs (
    email_key,
    workspace_id,
    user_id,
    scheduled_for,
    dedupe_key,
    payload
  )
  values (
    p_email_key,
    p_workspace_id,
    p_user_id,
    p_scheduled_for,
    p_dedupe_key,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (dedupe_key) do nothing
  returning * into v_job;

  if v_job.id is null then
    return null;
  end if;

  v_delay_seconds := greatest(
    0,
    ceil(extract(epoch from (v_job.scheduled_for - now())))::integer
  );

  select *
  into v_message_id
  from pgmq.send(
    'lifecycle_email_jobs',
    jsonb_build_object('jobId', v_job.id),
    v_delay_seconds
  );

  update public.lifecycle_email_jobs
  set queue_message_id = v_message_id,
      updated_at = now()
  where id = v_job.id;

  return v_job.id;
end;
$$;

alter function public.enqueue_lifecycle_email_job(
  text,
  uuid,
  uuid,
  timestamptz,
  text,
  jsonb
) owner to postgres;
grant all on function public.enqueue_lifecycle_email_job(
  text,
  uuid,
  uuid,
  timestamptz,
  text,
  jsonb
) to service_role;

create or replace function public.claim_lifecycle_email_jobs(
  p_limit integer default 25,
  p_now timestamptz default now()
)
returns setof public.lifecycle_email_jobs
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_item record;
  v_job public.lifecycle_email_jobs%rowtype;
  v_existing_job public.lifecycle_email_jobs%rowtype;
  v_job_id uuid;
  v_retry_cutoff timestamptz := p_now - interval '10 minutes';
  v_retry_delay_seconds integer;
begin
  for v_item in
    select *
    from pgmq.read('lifecycle_email_jobs', 60, greatest(coalesce(p_limit, 25), 1))
  loop
    begin
      v_job_id := (v_item.message ->> 'jobId')::uuid;
    exception
      when others then
        perform pgmq.archive('lifecycle_email_jobs', v_item.msg_id);
        continue;
    end;

    update public.lifecycle_email_jobs
    set status = 'processing',
        attempts = attempts + 1,
        claimed_at = p_now,
        updated_at = p_now,
        queue_message_id = v_item.msg_id
    where id = v_job_id
      and (
        status in ('queued', 'failed')
        or (status = 'processing' and claimed_at <= v_retry_cutoff)
      )
    returning * into v_job;

    if v_job.id is null then
      select *
      into v_existing_job
      from public.lifecycle_email_jobs
      where id = v_job_id;

      if v_existing_job.status = 'processing'
        and v_existing_job.claimed_at is not null
        and v_existing_job.claimed_at > v_retry_cutoff then
        v_retry_delay_seconds := greatest(
          1,
          ceil(
            extract(
              epoch from (
                (v_existing_job.claimed_at + interval '10 minutes') - p_now
              )
            )
          )::integer
        );

        perform pgmq.set_vt(
          'lifecycle_email_jobs',
          v_item.msg_id,
          v_retry_delay_seconds
        );
        continue;
      end if;

      perform pgmq.archive('lifecycle_email_jobs', v_item.msg_id);
      continue;
    end if;

    return next v_job;
    v_job := null;
  end loop;

  return;
end;
$$;

alter function public.claim_lifecycle_email_jobs(integer, timestamptz) owner to postgres;
grant all on function public.claim_lifecycle_email_jobs(integer, timestamptz) to service_role;

create or replace function public.finalize_lifecycle_email_job(
  p_job_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_job public.lifecycle_email_jobs%rowtype;
begin
  if p_status not in ('sent', 'skipped', 'failed') then
    raise exception 'Unsupported lifecycle job status: %', p_status;
  end if;

  select *
  into v_job
  from public.lifecycle_email_jobs
  where id = p_job_id
  for update;

  if v_job.id is null then
    return;
  end if;

  update public.lifecycle_email_jobs
  set status = p_status,
      processed_at = now(),
      updated_at = now(),
      last_error = case
        when p_reason is null then null
        else left(p_reason, 500)
      end,
      queue_message_id = case
        when p_status in ('sent', 'skipped') then null
        else queue_message_id
      end
  where id = p_job_id;

  if p_status in ('sent', 'skipped') and v_job.queue_message_id is not null then
    perform pgmq.archive('lifecycle_email_jobs', v_job.queue_message_id);
  end if;
end;
$$;

alter function public.finalize_lifecycle_email_job(uuid, text, text) owner to postgres;
grant all on function public.finalize_lifecycle_email_job(uuid, text, text) to service_role;

create or replace function public.reschedule_lifecycle_email_job(
  p_job_id uuid,
  p_scheduled_for timestamptz
)
returns public.lifecycle_email_jobs
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_job public.lifecycle_email_jobs%rowtype;
  v_delay_seconds integer;
begin
  update public.lifecycle_email_jobs
  set scheduled_for = p_scheduled_for,
      status = case
        when status = 'processing' then 'queued'
        else status
      end,
      claimed_at = case
        when status = 'processing' then null
        else claimed_at
      end,
      updated_at = now()
  where id = p_job_id
  returning * into v_job;

  if v_job.id is null then
    return null;
  end if;

  if v_job.queue_message_id is not null then
    v_delay_seconds := greatest(
      0,
      ceil(extract(epoch from (p_scheduled_for - now())))::integer
    );
    perform pgmq.set_vt('lifecycle_email_jobs', v_job.queue_message_id, v_delay_seconds);
  end if;

  return v_job;
end;
$$;

alter function public.reschedule_lifecycle_email_job(uuid, timestamptz) owner to postgres;
grant all on function public.reschedule_lifecycle_email_job(uuid, timestamptz) to service_role;

do $$
declare
  v_job record;
  v_message_id bigint;
  v_delay_seconds integer;
begin
  for v_job in
    select id, scheduled_for
    from public.lifecycle_email_jobs
    where status in ('queued', 'failed')
      and queue_message_id is null
    order by created_at asc
  loop
    v_delay_seconds := greatest(
      0,
      ceil(extract(epoch from (v_job.scheduled_for - now())))::integer
    );

    select *
    into v_message_id
    from pgmq.send(
      'lifecycle_email_jobs',
      jsonb_build_object('jobId', v_job.id),
      v_delay_seconds
    );

    update public.lifecycle_email_jobs
    set queue_message_id = v_message_id,
        updated_at = now()
    where id = v_job.id;
  end loop;
end;
$$;
