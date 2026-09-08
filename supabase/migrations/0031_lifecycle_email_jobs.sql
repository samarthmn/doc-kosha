-- Lifecycle email delivery state:
-- - durable scheduled lifecycle jobs
-- - persisted subscription cancellation flag
-- - inactivity candidate RPC that can read auth.users safely
-- - SKIP LOCKED job claiming for app-side processors

alter table public.workspace_subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;

create table if not exists public.lifecycle_email_jobs (
  id uuid primary key default gen_random_uuid(),
  email_key text not null,
  workspace_id uuid null references public.workspaces(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  scheduled_for timestamptz not null,
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'sent', 'skipped', 'failed')),
  attempts integer not null default 0,
  claimed_at timestamptz null,
  processed_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_lifecycle_email_jobs_dedupe_key
  on public.lifecycle_email_jobs(dedupe_key);

create index if not exists idx_lifecycle_email_jobs_due
  on public.lifecycle_email_jobs(status, scheduled_for asc)
  where status in ('queued', 'failed');

create index if not exists idx_lifecycle_email_jobs_workspace_key
  on public.lifecycle_email_jobs(workspace_id, email_key, created_at desc);

alter table public.lifecycle_email_jobs enable row level security;

grant all on table public.lifecycle_email_jobs to postgres, service_role;

drop policy if exists lifecycle_email_jobs_service_role_all on public.lifecycle_email_jobs;
create policy lifecycle_email_jobs_service_role_all
on public.lifecycle_email_jobs
for all
using (auth.role() = 'service_role'::text)
with check (auth.role() = 'service_role'::text);

create or replace function public.claim_lifecycle_email_jobs(
  p_limit integer default 25,
  p_now timestamptz default now()
)
returns setof public.lifecycle_email_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select j.id
    from public.lifecycle_email_jobs j
    where j.status in ('queued', 'failed')
      and j.scheduled_for <= p_now
    order by j.scheduled_for asc, j.created_at asc
    for update skip locked
    limit greatest(coalesce(p_limit, 25), 1)
  ),
  updated as (
    update public.lifecycle_email_jobs j
    set status = 'processing',
        attempts = j.attempts + 1,
        claimed_at = p_now,
        updated_at = p_now
    from picked
    where j.id = picked.id
    returning j.*
  )
  select * from updated;
end;
$$;

alter function public.claim_lifecycle_email_jobs(integer, timestamptz) owner to postgres;
grant all on function public.claim_lifecycle_email_jobs(integer, timestamptz) to service_role;

create or replace function public.list_inactive_workspace_owner_candidates(
  p_cutoff timestamptz,
  p_limit integer default 100
)
returns table(
  workspace_id uuid,
  owner_user_id uuid,
  owner_email text,
  workspace_name text,
  last_sign_in_at timestamptz,
  onboarding_reminders_enabled boolean
)
language sql
security definer
set search_path = public, auth
as $$
  select
    w.id as workspace_id,
    w.created_by as owner_user_id,
    u.email::text as owner_email,
    w.name as workspace_name,
    u.last_sign_in_at,
    coalesce(prefs.onboarding_reminders_enabled, true) as onboarding_reminders_enabled
  from public.workspaces w
  join auth.users u
    on u.id = w.created_by
  left join public.user_notification_prefs prefs
    on prefs.user_id = w.created_by
  where u.email is not null
    and coalesce(u.last_sign_in_at, w.created_at) <= p_cutoff
  order by coalesce(u.last_sign_in_at, w.created_at) asc
  limit greatest(coalesce(p_limit, 100), 1);
$$;

alter function public.list_inactive_workspace_owner_candidates(timestamptz, integer) owner to postgres;
grant all on function public.list_inactive_workspace_owner_candidates(timestamptz, integer) to service_role;
