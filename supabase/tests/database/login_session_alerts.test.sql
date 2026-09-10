begin;
select plan(22);
select has_table('public', 'login_session_events', 'durable sign-in ledger exists');
-- Roll back all fixture accounts, activation, sessions and queue messages.
update public.login_alert_rollout set enabled = false;
insert into auth.users(id, email) values
 ('10000000-0000-4000-8000-000000000001','login-test@example.test'),
 ('10000000-0000-4000-8000-000000000002','pending-test@example.test');
insert into auth.sessions(id,user_id) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
select is((select eligible from public.login_session_events where session_id='20000000-0000-4000-8000-000000000001'),false,'pre-activation session is silent');
select public.activate_login_session_alerts();
insert into auth.sessions(id,user_id) values
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002'),
 ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001');
select is((select eligible from public.login_session_events where session_id='20000000-0000-4000-8000-000000000002'),false,'never-authenticated pending account first session is silent');
select is((select eligible from public.login_session_events where session_id='20000000-0000-4000-8000-000000000003'),true,'every later real session is eligible');
select is((select eligible from public.login_session_events where session_id='20000000-0000-4000-8000-000000000004'),true,'previously authenticated account is eligible after activation');
select is((select count(*)::integer from public.lifecycle_email_jobs where user_id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002') and email_key='login-session'),2,'only eligible sessions enqueue');
select ok((select bool_and(workspace_id is null and queue_message_id is not null) from public.lifecycle_email_jobs where user_id='10000000-0000-4000-8000-000000000002'),'session job has no workspace and has a durable queue message');
select is(public.enrich_login_session_event('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','Chrome on Linux','IN'),true,'later callback can arrive first');
select is(public.enrich_login_session_event('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Chrome on Linux','IN'),true,'first callback can arrive last');
select is((select eligible from public.login_session_events where session_id='20000000-0000-4000-8000-000000000002'),false,'callback order never changes initial suppression');
select is(public.enrich_login_session_event('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','Other device',null),false,'another user cannot enrich a session');
update auth.sessions set updated_at=now() where id='20000000-0000-4000-8000-000000000003';
select is((select count(*)::integer from public.lifecycle_email_jobs where user_id='10000000-0000-4000-8000-000000000002' and email_key='login-session'),1,'refresh and repeated callbacks do not enqueue again');
select public.activate_login_session_alerts();
select is((select eligible from public.login_session_events where session_id='20000000-0000-4000-8000-000000000003'),true,'repeated activation preserves post-rollout eligible events');
delete from auth.sessions where id='20000000-0000-4000-8000-000000000003';
select is((select count(*)::integer from public.login_session_events where session_id='20000000-0000-4000-8000-000000000003'),1,'logout preserves event for worker delivery');
select is(public.enrich_login_session_event('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','Other device',null),false,'revoked session cannot enrich event');
delete from auth.users where id='10000000-0000-4000-8000-000000000002';
select is((select count(*)::integer from public.login_session_events where user_id='10000000-0000-4000-8000-000000000002'),0,'account deletion cancels event');
select is(has_function_privilege('authenticated','public.enrich_login_session_event(uuid,uuid,text,text)','execute'),false,'public callers cannot forge verified context');
select is(has_function_privilege('service_role','public.activate_login_session_alerts()','execute'),false,'application cannot activate rollout');
select is(has_table_privilege('authenticated','public.login_session_events','select'),false,'session event context is not publicly readable');
-- Additional session used to exercise queue retry after a busy delivery claim.
insert into auth.sessions(id,user_id) values
 ('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001');
select is((select eligible from public.login_session_events where session_id='20000000-0000-4000-8000-000000000005'),true,'subsequent session remains eligible for retry checks');
-- Exercise the same deferral RPC as the worker while another sender holds a lease.
update public.lifecycle_email_jobs set status='processing', attempts=1, claimed_at=now()
 where dedupe_key='login-session:10000000-0000-4000-8000-000000000001:20000000-0000-4000-8000-000000000005';
select public.reschedule_lifecycle_email_job(id,now()) from public.lifecycle_email_jobs
 where dedupe_key='login-session:10000000-0000-4000-8000-000000000001:20000000-0000-4000-8000-000000000005';
select is((select status from public.lifecycle_email_jobs where dedupe_key='login-session:10000000-0000-4000-8000-000000000001:20000000-0000-4000-8000-000000000005'),'queued','in-progress delivery deferral requeues instead of archiving');
select ok(exists(select 1 from public.claim_lifecycle_email_jobs(10000,now()) where dedupe_key='login-session:10000000-0000-4000-8000-000000000001:20000000-0000-4000-8000-000000000005' and attempts=2),'deferred job is claimable again with its retry attempt preserved');
select * from finish();
rollback;
