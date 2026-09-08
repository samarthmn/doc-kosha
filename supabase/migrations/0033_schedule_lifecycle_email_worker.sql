do $$
begin
  if exists (
    select 1
    from pg_available_extensions
    where name = 'pg_net'
  ) then
    create extension if not exists pg_net;
  end if;

  if exists (
    select 1
    from pg_available_extensions
    where name = 'pg_cron'
  ) then
    create extension if not exists pg_cron;
  end if;
end;
$$;

create or replace function public.invoke_lifecycle_email_worker()
returns bigint
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_project_url text;
  v_secret text;
  v_request_id bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;

  select decrypted_secret
  into v_project_url
  from vault.decrypted_secrets
  where name = 'project_url'
  limit 1;

  select decrypted_secret
  into v_secret
  from vault.decrypted_secrets
  where name = 'lifecycle_processor_secret'
  limit 1;

  if coalesce(length(v_project_url), 0) = 0 or coalesce(length(v_secret), 0) = 0 then
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/lifecycle-email-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-lifecycle-processor-secret', v_secret
    ),
    body := jsonb_build_object('triggeredAt', now())
  )
  into v_request_id;

  return v_request_id;
end;
$$;

alter function public.invoke_lifecycle_email_worker() owner to postgres;
grant all on function public.invoke_lifecycle_email_worker() to postgres, service_role;

do $$
declare
  v_has_cron boolean := false;
  v_job_id bigint;
begin
  select exists(select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  if not v_has_cron then
    return;
  end if;

  begin
    select jobid
    into v_job_id
    from cron.job
    where jobname = 'invoke_lifecycle_email_worker_every_minute'
    limit 1;

    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;
  exception
    when undefined_table then
      return;
  end;

  perform cron.schedule(
    'invoke_lifecycle_email_worker_every_minute',
    '* * * * *',
    $schedule$select public.invoke_lifecycle_email_worker();$schedule$
  );
end;
$$;
