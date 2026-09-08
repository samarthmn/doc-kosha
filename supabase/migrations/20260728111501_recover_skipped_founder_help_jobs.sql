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
