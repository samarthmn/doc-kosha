create or replace function public.list_due_founder_help_candidates(
  p_cutoff timestamptz,
  p_now timestamptz default now(),
  p_limit integer default 100
)
returns table (
  workspace_id uuid,
  owner_user_id uuid,
  trial_started_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    subscription.workspace_id,
    workspace.created_by as owner_user_id,
    subscription.trial_started_at
  from public.workspace_subscriptions as subscription
  join public.workspaces as workspace
    on workspace.id = subscription.workspace_id
  where subscription.status = 'trialing'
    and subscription.trial_started_at is not null
    and subscription.trial_started_at <= p_cutoff
    and subscription.trial_ends_at is not null
    and subscription.trial_ends_at > p_now
    and not exists (
      select 1
      from public.lifecycle_email_jobs as job
      where job.workspace_id = subscription.workspace_id
        and job.email_key = 'founder-help-day-1'
        and (
          job.status <> 'skipped'
          or coalesce(job.payload ->> 'policyVersion', '')
            = 'eligible-trial-v2'
          or exists (
            select 1
            from public.email_deliveries as delivery
            where delivery.template = 'founder-help-day-1'
              and delivery.dedupe_key = job.dedupe_key
              and delivery.state = 'sent'
          )
        )
    )
  order by subscription.trial_started_at asc, subscription.workspace_id asc
  limit greatest(coalesce(p_limit, 100), 1);
$$;

alter function public.list_due_founder_help_candidates(
  timestamptz,
  timestamptz,
  integer
) owner to postgres;
revoke all on function public.list_due_founder_help_candidates(
  timestamptz,
  timestamptz,
  integer
) from public, anon, authenticated;
grant execute on function public.list_due_founder_help_candidates(
  timestamptz,
  timestamptz,
  integer
) to service_role;
