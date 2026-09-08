begin;

select plan(15);

create temporary table captured_delivery_claims (
  claim_name text primary key,
  delivery_id uuid,
  claim_token uuid
) on commit drop;

insert into captured_delivery_claims (
  claim_name,
  delivery_id,
  claim_token
)
select
  'first',
  delivery_id,
  claim_token
from public.claim_email_delivery(
  'founder-help-day-1',
  'lease-test@example.com',
  'founder-help-day-1:lease-test'
)
where claim_status = 'claimed';

select ok(
  (
    select delivery_id is not null and claim_token is not null
    from captured_delivery_claims
    where claim_name = 'first'
  ),
  'a new dedupe key receives an id and fencing token'
);

select is(
  (
    select claim_status
    from public.claim_email_delivery(
      'founder-help-day-1',
      'lease-test@example.com',
      'founder-help-day-1:lease-test'
    )
  ),
  'in_progress',
  'a fresh claim cannot be taken concurrently'
);

update public.email_deliveries
set claimed_at = now() - interval '11 minutes'
where dedupe_key = 'founder-help-day-1:lease-test';

insert into captured_delivery_claims (
  claim_name,
  delivery_id,
  claim_token
)
select
  'second',
  delivery_id,
  claim_token
from public.claim_email_delivery(
  'founder-help-day-1',
  'lease-test@example.com',
  'founder-help-day-1:lease-test'
)
where claim_status = 'claimed';

select is(
  (
    select delivery_id
    from captured_delivery_claims
    where claim_name = 'second'
  ),
  (
    select delivery_id
    from captured_delivery_claims
    where claim_name = 'first'
  ),
  'a stale crash-before-send claim reuses the delivery row'
);

select isnt(
  (
    select claim_token
    from captured_delivery_claims
    where claim_name = 'second'
  ),
  (
    select claim_token
    from captured_delivery_claims
    where claim_name = 'first'
  ),
  'reclaiming a stale delivery rotates its fencing token'
);

select is(
  public.mark_email_delivery_failed(
    (
      select delivery_id
      from captured_delivery_claims
      where claim_name = 'first'
    ),
    (
      select claim_token
      from captured_delivery_claims
      where claim_name = 'first'
    ),
    'stale worker failure'
  ),
  false,
  'an expired worker cannot fail the newer claim'
);

select is(
  public.mark_email_delivery_sent(
    (
      select delivery_id
      from captured_delivery_claims
      where claim_name = 'first'
    ),
    (
      select claim_token
      from captured_delivery_claims
      where claim_name = 'first'
    )
  ),
  false,
  'an expired worker cannot complete the newer claim'
);

select is(
  (
    select state
    from public.email_deliveries
    where dedupe_key = 'founder-help-day-1:lease-test'
  ),
  'claimed',
  'stale terminal updates leave the current lease untouched'
);

select is(
  public.mark_email_delivery_failed(
    (
      select delivery_id
      from captured_delivery_claims
      where claim_name = 'second'
    ),
    (
      select claim_token
      from captured_delivery_claims
      where claim_name = 'second'
    ),
    'smtp unavailable'
  ),
  true,
  'the current worker can mark its own claim failed'
);

insert into captured_delivery_claims (
  claim_name,
  delivery_id,
  claim_token
)
select
  'third',
  delivery_id,
  claim_token
from public.claim_email_delivery(
  'founder-help-day-1',
  'lease-test@example.com',
  'founder-help-day-1:lease-test'
)
where claim_status = 'claimed';

select isnt(
  (
    select claim_token
    from captured_delivery_claims
    where claim_name = 'third'
  ),
  (
    select claim_token
    from captured_delivery_claims
    where claim_name = 'second'
  ),
  'a failed delivery is immediately reclaimed with a new token'
);

select is(
  public.mark_email_delivery_sent(
    (
      select delivery_id
      from captured_delivery_claims
      where claim_name = 'third'
    ),
    (
      select claim_token
      from captured_delivery_claims
      where claim_name = 'third'
    )
  ),
  true,
  'the current worker can complete its own claim'
);

select is(
  public.mark_email_delivery_failed(
    (
      select delivery_id
      from captured_delivery_claims
      where claim_name = 'third'
    ),
    (
      select claim_token
      from captured_delivery_claims
      where claim_name = 'third'
    ),
    'late failure'
  ),
  false,
  'sent is terminal and cannot be downgraded to failed'
);

select is(
  (
    select state
    from public.email_deliveries
    where dedupe_key = 'founder-help-day-1:lease-test'
  ),
  'sent',
  'the delivery ledger remains sent after a late failure'
);

select is(
  (
    select claim_status
    from public.claim_email_delivery(
      'founder-help-day-1',
      'lease-test@example.com',
      'founder-help-day-1:lease-test'
    )
  ),
  'sent',
  'a terminal sent delivery can never be reclaimed'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.mark_email_delivery_sent(uuid,uuid)',
    'execute'
  ),
  false,
  'authenticated users cannot complete delivery claims'
);

select is(
  has_function_privilege(
    'service_role',
    'public.mark_email_delivery_sent(uuid,uuid)',
    'execute'
  ),
  true,
  'the service role can complete delivery claims'
);

select * from finish();

rollback;
