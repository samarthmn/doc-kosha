alter table public.email_deliveries
  add column if not exists claim_token uuid default gen_random_uuid();

update public.email_deliveries
set claim_token = gen_random_uuid()
where claim_token is null;

alter table public.email_deliveries
  alter column claim_token set default gen_random_uuid(),
  alter column claim_token set not null;

drop function if exists public.claim_email_delivery(
  text,
  text,
  text,
  uuid,
  uuid,
  interval
);

create function public.claim_email_delivery(
  p_template text,
  p_to_email text,
  p_dedupe_key text default null,
  p_user_id uuid default null,
  p_workspace_id uuid default null,
  p_claim_timeout interval default interval '10 minutes'
)
returns table (
  delivery_id uuid,
  claim_token uuid,
  claim_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery_id uuid;
  v_claim_token uuid;
  v_existing_state text;
begin
  insert into public.email_deliveries as delivery (
    template,
    to_email,
    dedupe_key,
    user_id,
    workspace_id,
    state,
    claimed_at,
    claim_token
  )
  values (
    p_template,
    p_to_email,
    p_dedupe_key,
    p_user_id,
    p_workspace_id,
    'claimed',
    now(),
    gen_random_uuid()
  )
  on conflict (dedupe_key) where dedupe_key is not null
  do update
  set state = 'claimed',
      claimed_at = now(),
      claim_token = gen_random_uuid(),
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
  returning delivery.id, delivery.claim_token
  into v_delivery_id, v_claim_token;

  if v_delivery_id is not null then
    return query
    select v_delivery_id, v_claim_token, 'claimed'::text;
    return;
  end if;

  select delivery.state
  into v_existing_state
  from public.email_deliveries as delivery
  where delivery.dedupe_key = p_dedupe_key;

  return query
  select
    null::uuid,
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

create or replace function public.mark_email_delivery_sent(
  p_delivery_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.email_deliveries
  set state = 'sent',
      sent_at = now(),
      error = null
  where id = p_delivery_id
    and claim_token = p_claim_token
    and state = 'claimed';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

alter function public.mark_email_delivery_sent(uuid, uuid) owner to postgres;
revoke all on function public.mark_email_delivery_sent(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_email_delivery_sent(uuid, uuid)
  to service_role;

create or replace function public.mark_email_delivery_failed(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.email_deliveries
  set state = 'failed',
      error = left(
        coalesce(p_error, 'Failed to send email'),
        500
      )
  where id = p_delivery_id
    and claim_token = p_claim_token
    and state = 'claimed';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

alter function public.mark_email_delivery_failed(uuid, uuid, text)
  owner to postgres;
revoke all on function public.mark_email_delivery_failed(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_email_delivery_failed(uuid, uuid, text)
  to service_role;
