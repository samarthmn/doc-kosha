create index if not exists idx_workspace_subscriptions_due_founder_trial
  on public.workspace_subscriptions (
    trial_started_at,
    workspace_id
  )
  include (trial_ends_at)
  where status = 'trialing'
    and trial_started_at is not null;
