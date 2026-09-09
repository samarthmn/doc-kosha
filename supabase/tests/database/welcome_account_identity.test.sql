begin;
select plan(4);
insert into auth.users(id,email,raw_app_meta_data) values
 ('10000000-0000-4000-8000-000000000091','recreated-welcome@example.test','{"provider":"google"}');
create temporary table welcome_claim on commit drop as
select * from public.claim_email_delivery('welcome-user','recreated-welcome@example.test',
 'welcome-user:10000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000091');
select is((select claim_status from welcome_claim),'claimed','first account welcome is claimed');
select is(public.mark_email_delivery_sent((select delivery_id from welcome_claim),(select claim_token from welcome_claim)),true,'welcome delivery is recorded');
select is((select claim_status from public.claim_email_delivery('welcome-user','recreated-welcome@example.test',
 'welcome-user:10000000-0000-4000-8000-000000000091','10000000-0000-4000-8000-000000000091')),'sent','same account never receives another welcome');
delete from auth.users where id='10000000-0000-4000-8000-000000000091';
insert into auth.users(id,email,raw_app_meta_data) values
 ('10000000-0000-4000-8000-000000000092','recreated-welcome@example.test','{"provider":"email"}');
select is((select claim_status from public.claim_email_delivery('welcome-user','recreated-welcome@example.test',
 'welcome-user:10000000-0000-4000-8000-000000000092','10000000-0000-4000-8000-000000000092')),'claimed','deleted Google account recreated with email is a distinct account, even at the same address');
select * from finish();
rollback;
