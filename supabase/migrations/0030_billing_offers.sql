create table if not exists public.billing_offers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null
    check (status = any (array['draft'::text, 'active'::text, 'archived'::text])),
  audience text not null default 'all_signups'
    check (audience = any (array['all_signups'::text])),
  stripe_mode text not null
    check (stripe_mode = any (array['local'::text, 'staging'::text, 'production'::text])),
  plan_id text
    check (plan_id is null or plan_id = any (array['essential'::text, 'plus'::text, 'max'::text])),
  billing_interval text
    check (billing_interval is null or billing_interval = any (array['month'::text, 'year'::text])),
  stripe_discount_source text not null
    check (stripe_discount_source = any (array['coupon'::text, 'promotion_code'::text])),
  stripe_coupon_id text,
  stripe_promotion_code_id text,
  percent_off numeric(5,2),
  amount_off integer,
  currency text,
  duration text not null
    check (duration = any (array['once'::text, 'forever'::text, 'repeating'::text])),
  duration_in_months integer,
  badge_text text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_offers_name_non_empty
    check (char_length(btrim(name)) > 0),
  constraint billing_offers_window_valid
    check (ends_at is null or ends_at > starts_at),
  constraint billing_offers_discount_source_match
    check (
      (
        stripe_discount_source = 'coupon'
        and stripe_coupon_id is not null
        and stripe_promotion_code_id is null
      )
      or (
        stripe_discount_source = 'promotion_code'
        and stripe_promotion_code_id is not null
        and stripe_coupon_id is null
      )
    ),
  constraint billing_offers_discount_amount_xor
    check (((percent_off is not null)::int + (amount_off is not null)::int) = 1),
  constraint billing_offers_percent_off_valid
    check (percent_off is null or (percent_off > 0 and percent_off <= 100)),
  constraint billing_offers_amount_off_valid
    check (amount_off is null or amount_off > 0),
  constraint billing_offers_currency_required_for_amount_off
    check (
      (amount_off is null and currency is null)
      or (
        amount_off is not null
        and currency is not null
        and char_length(currency) = 3
      )
    ),
  constraint billing_offers_duration_months_valid
    check (
      (
        duration = 'repeating'
        and duration_in_months is not null
        and duration_in_months > 0
      )
      or (
        duration <> 'repeating'
        and duration_in_months is null
      )
    )
);

comment on table public.billing_offers is
  'Stripe-backed signup offers that can be toggled in Supabase without redeploying the app.';

comment on column public.billing_offers.starts_at is
  'When the offer becomes redeemable for new signups.';

comment on column public.billing_offers.ends_at is
  'When the offer stops being redeemable for new signups. Null means open-ended.';

comment on column public.billing_offers.duration is
  'Stripe coupon duration: once, forever, or repeating.';

comment on column public.billing_offers.duration_in_months is
  'Required only when duration = repeating. Mirrors Stripe coupon duration_in_months.';

create index if not exists billing_offers_active_lookup_idx
  on public.billing_offers (status, stripe_mode, starts_at desc, priority asc);

create index if not exists billing_offers_plan_interval_idx
  on public.billing_offers (plan_id, billing_interval);

alter table public.billing_offers enable row level security;

drop policy if exists billing_offers_no_access on public.billing_offers;

create policy billing_offers_no_access
on public.billing_offers
for all
using (false)
with check (false);

grant all on table public.billing_offers to anon;
grant all on table public.billing_offers to authenticated;
grant all on table public.billing_offers to service_role;

drop trigger if exists billing_offers_touch_updated_at on public.billing_offers;

create trigger billing_offers_touch_updated_at
before update on public.billing_offers
for each row
execute function public.touch_updated_at_column();
