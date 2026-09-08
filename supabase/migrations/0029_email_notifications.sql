-- Email notifications infrastructure:
-- - user-level preferences
-- - known devices for login activity alerts
-- - onboarding plan reminder scheduling state
-- - idempotent email delivery ledger

create table if not exists public.user_notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  onboarding_reminders_enabled boolean not null default true,
  security_login_alerts_enabled boolean not null default true,
  security_workspace_emails_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_known_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  device_label text null,
  ua_hash text null,
  last_country_code text null,
  primary key (user_id, device_id)
);

create index if not exists idx_user_known_devices_user_last_seen
  on public.user_known_devices(user_id, last_seen_at desc);

create table if not exists public.onboarding_plan_prompts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  context text not null check (context in ('onboarding')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  reminder_sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id, context)
);

create index if not exists idx_onboarding_plan_prompts_due
  on public.onboarding_plan_prompts(first_seen_at asc)
  where reminder_sent_at is null;

create table if not exists public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  template text not null,
  to_email text not null,
  user_id uuid null references auth.users(id) on delete set null,
  workspace_id uuid null references public.workspaces(id) on delete set null,
  dedupe_key text null,
  state text not null default 'claimed' check (state in ('claimed', 'sent', 'failed')),
  error text null,
  created_at timestamptz not null default now(),
  sent_at timestamptz null
);

create unique index if not exists idx_email_deliveries_dedupe_key
  on public.email_deliveries(dedupe_key)
  where dedupe_key is not null;

create index if not exists idx_email_deliveries_template_created
  on public.email_deliveries(template, created_at desc);

alter table public.user_notification_prefs enable row level security;
alter table public.user_known_devices enable row level security;
alter table public.onboarding_plan_prompts enable row level security;
alter table public.email_deliveries enable row level security;

grant all on table public.user_notification_prefs to postgres, service_role;
grant all on table public.user_known_devices to postgres, service_role;
grant all on table public.onboarding_plan_prompts to postgres, service_role;
grant all on table public.email_deliveries to postgres, service_role;

grant select, insert, update on table public.user_notification_prefs to authenticated;

drop policy if exists user_notification_prefs_select_self on public.user_notification_prefs;
create policy user_notification_prefs_select_self
on public.user_notification_prefs
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists user_notification_prefs_insert_self on public.user_notification_prefs;
create policy user_notification_prefs_insert_self
on public.user_notification_prefs
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists user_notification_prefs_update_self on public.user_notification_prefs;
create policy user_notification_prefs_update_self
on public.user_notification_prefs
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_known_devices_service_role_all on public.user_known_devices;
create policy user_known_devices_service_role_all
on public.user_known_devices
for all
using (auth.role() = 'service_role'::text)
with check (auth.role() = 'service_role'::text);

drop policy if exists onboarding_plan_prompts_service_role_all on public.onboarding_plan_prompts;
create policy onboarding_plan_prompts_service_role_all
on public.onboarding_plan_prompts
for all
using (auth.role() = 'service_role'::text)
with check (auth.role() = 'service_role'::text);

drop policy if exists email_deliveries_service_role_all on public.email_deliveries;
create policy email_deliveries_service_role_all
on public.email_deliveries
for all
using (auth.role() = 'service_role'::text)
with check (auth.role() = 'service_role'::text);
