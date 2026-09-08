begin;

select plan(9);

create temporary table expected_security_definer_execute_privileges (
  role_name name not null,
  access_tier text not null,
  function_signature text not null,
  primary key (role_name, function_signature)
) on commit drop;

insert into expected_security_definer_execute_privileges (
  role_name,
  access_tier,
  function_signature
)
values
  ('anon', 'identity', 'public.has_workspace_role(uuid,text[])'),
  ('anon', 'identity', 'public.is_workspace_member(uuid)'),
  ('authenticated', 'identity', 'public.has_workspace_role(uuid,text[])'),
  ('authenticated', 'identity', 'public.is_workspace_member(uuid)'),
  ('service_role', 'identity', 'public.has_workspace_role(uuid,text[])'),
  ('service_role', 'identity', 'public.is_workspace_member(uuid)'),
  ('authenticated', 'authenticated', 'public.record_internal_audit_event(uuid,text,text,uuid,uuid,uuid,jsonb)'),
  ('authenticated', 'authenticated', 'public.replace_link_allowlist_rules(uuid,uuid,text[],text[],uuid[],uuid[])'),
  ('authenticated', 'authenticated', 'public.update_workspace_user_group_atomic(uuid,uuid,text,text[])'),
  ('authenticated', 'authenticated', 'public.replace_link_preset_rules(uuid,uuid,text[],text[],uuid[],uuid[])'),
  ('authenticated', 'authenticated', 'public.upsert_link_preset(uuid,text,jsonb,text[],text[],uuid[],uuid[])'),
  ('authenticated', 'authenticated', 'public.replace_link_alc_rules(uuid,uuid,jsonb)'),
  ('authenticated', 'authenticated', 'public.get_link_country_views(uuid,uuid[])'),
  ('authenticated', 'authenticated', 'public.get_document_link_metrics_v2(uuid,uuid,uuid[],text[],timestamptz,timestamptz)'),
  ('authenticated', 'authenticated', 'public.get_document_page_attention_v2(uuid,uuid,uuid[],text[],timestamptz,timestamptz)'),
  ('authenticated', 'authenticated', 'public.get_document_viewer_insights_v2(uuid,uuid,uuid[],text[],timestamptz,timestamptz)'),
  ('authenticated', 'authenticated', 'public.get_document_viewer_pages_v2(uuid,uuid,uuid[],text[],timestamptz,timestamptz)'),
  ('authenticated', 'authenticated', 'public.get_link_country_views_v2(uuid,uuid[],text[],timestamptz,timestamptz)'),
  ('authenticated', 'authenticated', 'public.get_resource_link_metrics_v2(uuid,public.resource_type,uuid,uuid[],timestamptz,timestamptz)'),
  ('authenticated', 'authenticated', 'public.get_documents_metrics_v2(uuid,uuid[],uuid,timestamptz,timestamptz)'),
  ('authenticated', 'authenticated', 'public.get_documents_page_attention_v2(uuid,uuid[],uuid,timestamptz,timestamptz)'),
  ('authenticated', 'authenticated', 'public.get_documents_viewer_insights_v2(uuid,uuid[],uuid,timestamptz,timestamptz)'),
  ('authenticated', 'authenticated', 'public.get_documents_viewer_pages_v2(uuid,uuid[],uuid,timestamptz,timestamptz)'),
  ('authenticated', 'authenticated', 'public.get_data_room_metrics_v2(uuid,uuid[],timestamptz,timestamptz)'),
  ('authenticated', 'authenticated', 'public.get_workspace_kpis_v2(uuid,timestamptz,timestamptz)'),
  ('authenticated', 'authenticated', 'public.get_workspace_most_active_documents_v2(uuid,integer,timestamptz,timestamptz)'),
  ('authenticated', 'authenticated', 'public.get_workspace_top_countries_v2(uuid,integer,timestamptz,timestamptz)'),
  ('authenticated', 'authenticated', 'public.get_document_viewer_insights_export_v2(uuid,uuid,uuid[],text[],timestamptz,timestamptz)'),
  ('authenticated', 'authenticated', 'public.workspace_allows_new_member(uuid)'),
  ('service_role', 'authenticated', 'public.record_internal_audit_event(uuid,text,text,uuid,uuid,uuid,jsonb)'),
  ('service_role', 'authenticated', 'public.replace_link_allowlist_rules(uuid,uuid,text[],text[],uuid[],uuid[])'),
  ('service_role', 'authenticated', 'public.update_workspace_user_group_atomic(uuid,uuid,text,text[])'),
  ('service_role', 'authenticated', 'public.replace_link_preset_rules(uuid,uuid,text[],text[],uuid[],uuid[])'),
  ('service_role', 'authenticated', 'public.upsert_link_preset(uuid,text,jsonb,text[],text[],uuid[],uuid[])'),
  ('service_role', 'authenticated', 'public.replace_link_alc_rules(uuid,uuid,jsonb)'),
  ('service_role', 'authenticated', 'public.get_link_country_views(uuid,uuid[])'),
  ('service_role', 'authenticated', 'public.get_document_link_metrics_v2(uuid,uuid,uuid[],text[],timestamptz,timestamptz)'),
  ('service_role', 'authenticated', 'public.get_document_page_attention_v2(uuid,uuid,uuid[],text[],timestamptz,timestamptz)'),
  ('service_role', 'authenticated', 'public.get_document_viewer_insights_v2(uuid,uuid,uuid[],text[],timestamptz,timestamptz)'),
  ('service_role', 'authenticated', 'public.get_document_viewer_pages_v2(uuid,uuid,uuid[],text[],timestamptz,timestamptz)'),
  ('service_role', 'authenticated', 'public.get_link_country_views_v2(uuid,uuid[],text[],timestamptz,timestamptz)'),
  ('service_role', 'authenticated', 'public.get_resource_link_metrics_v2(uuid,public.resource_type,uuid,uuid[],timestamptz,timestamptz)'),
  ('service_role', 'authenticated', 'public.get_documents_metrics_v2(uuid,uuid[],uuid,timestamptz,timestamptz)'),
  ('service_role', 'authenticated', 'public.get_documents_page_attention_v2(uuid,uuid[],uuid,timestamptz,timestamptz)'),
  ('service_role', 'authenticated', 'public.get_documents_viewer_insights_v2(uuid,uuid[],uuid,timestamptz,timestamptz)'),
  ('service_role', 'authenticated', 'public.get_documents_viewer_pages_v2(uuid,uuid[],uuid,timestamptz,timestamptz)'),
  ('service_role', 'authenticated', 'public.get_data_room_metrics_v2(uuid,uuid[],timestamptz,timestamptz)'),
  ('service_role', 'authenticated', 'public.get_workspace_kpis_v2(uuid,timestamptz,timestamptz)'),
  ('service_role', 'authenticated', 'public.get_workspace_most_active_documents_v2(uuid,integer,timestamptz,timestamptz)'),
  ('service_role', 'authenticated', 'public.get_workspace_top_countries_v2(uuid,integer,timestamptz,timestamptz)'),
  ('service_role', 'authenticated', 'public.get_document_viewer_insights_export_v2(uuid,uuid,uuid[],text[],timestamptz,timestamptz)'),
  ('service_role', 'authenticated', 'public.workspace_allows_new_member(uuid)'),
  ('service_role', 'trusted', 'public.apply_workspace_storage_delta(uuid,bigint)'),
  ('service_role', 'trusted', 'public.auth_user_id_by_email(text)'),
  ('service_role', 'trusted', 'public.get_dashboard_kpis(uuid)'),
  ('service_role', 'trusted', 'public.get_most_active_content(uuid,integer)'),
  ('service_role', 'trusted', 'public.get_top_viewers(uuid,integer)'),
  ('service_role', 'trusted', 'public.increment_document_country_view(uuid,text)'),
  ('service_role', 'trusted', 'public.increment_link_country_view(uuid,uuid,text)'),
  ('service_role', 'trusted', 'public.record_workspace_bandwidth(uuid,bigint,integer,bigint,bigint)'),
  ('service_role', 'trusted', 'public.prune_workspace_bandwidth_daily(integer)'),
  ('service_role', 'trusted', 'public.prune_public_analytics_v2(integer)'),
  ('service_role', 'trusted', 'public.workspace_name_available(text)'),
  ('service_role', 'trusted', 'public.record_public_analytics_event(uuid,uuid,public.resource_type,uuid,uuid,public.analytics_resource_category,text,text,text,text,public.analytics_event_type,integer,bigint,integer)'),
  ('service_role', 'trusted', 'public.record_public_analytics_event_v2(uuid,uuid,public.resource_type,uuid,uuid,text,text,text,text,public.analytics_event_type,integer,bigint,integer,text,text)'),
  ('service_role', 'trusted', 'public.enqueue_lifecycle_email_job(text,uuid,uuid,timestamptz,text,jsonb)'),
  ('service_role', 'trusted', 'public.claim_lifecycle_email_jobs(integer,timestamptz)'),
  ('service_role', 'trusted', 'public.finalize_lifecycle_email_job(uuid,text,text)'),
  ('service_role', 'trusted', 'public.reschedule_lifecycle_email_job(uuid,timestamptz)'),
  ('service_role', 'trusted', 'public.list_inactive_workspace_owner_candidates(timestamptz,integer)'),
  ('service_role', 'trusted', 'public.invoke_lifecycle_email_worker()'),
  ('service_role', 'trusted', 'public.delete_workspace_cascade(uuid)'),
  ('service_role', 'trusted', 'public.delete_data_room_cascade(uuid,uuid)'),
  ('service_role', 'trusted', 'public.workspace_effective_plan_id(uuid)'),
  ('service_role', 'trusted', 'public.lock_workspace_free_plan_guard(uuid)'),
  ('service_role', 'trusted', 'public.add_owner_membership()'),
  ('service_role', 'trusted', 'public.before_insert_set_workspace_id()'),
  ('service_role', 'trusted', 'public.create_notification_settings_for_new_user()'),
  ('service_role', 'trusted', 'public.handle_document_storage_change()'),
  ('service_role', 'trusted', 'public.prevent_nda_template_change()'),
  ('service_role', 'trusted', 'public.snapshot_nda_template()'),
  ('service_role', 'trusted', 'public.set_data_room_documents_workspace_id()'),
  ('service_role', 'trusted', 'public.record_audit_event_from_trigger()'),
  ('service_role', 'trusted', 'public.handle_data_room_created_membership()'),
  ('service_role', 'trusted', 'public.handle_workspace_created_role_presets()'),
  ('service_role', 'trusted', 'public.handle_document_version_storage_change()'),
  ('service_role', 'trusted', 'public.enforce_free_plan_document_limits()'),
  ('service_role', 'trusted', 'public.enforce_free_plan_version_limits()'),
  ('service_role', 'trusted', 'public.enforce_free_plan_member_limit()'),
  ('service_role', 'trusted', 'public.enforce_free_plan_invite_limit()');

select is(
  (
    select count(*)
    from pg_proc as p
    join pg_namespace as n
      on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where n.nspname = 'public'
      and p.prosecdef
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  0::bigint,
  'no public-schema security-definer function has a PUBLIC execute ACL'
);

select is(
  array(
    select p.oid
    from pg_proc as p
    join pg_namespace as n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
    order by p.oid
  ),
  array(
    select function_signature::regprocedure::oid
    from expected_security_definer_execute_privileges
    where role_name = 'anon'
    order by function_signature::regprocedure::oid
  ),
  'anon executes exactly the two reviewed identity helpers'
);

select is(
  array(
    select p.oid
    from pg_proc as p
    join pg_namespace as n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    order by p.oid
  ),
  array(
    select function_signature::regprocedure::oid
    from expected_security_definer_execute_privileges
    where role_name = 'authenticated'
    order by function_signature::regprocedure::oid
  ),
  'authenticated executes exactly the reviewed identity, mutation, analytics-read, and membership helpers'
);

select ok(
  not exists (
    select 1
    from expected_security_definer_execute_privileges
    where access_tier = 'trusted'
      and has_function_privilege('anon', function_signature::regprocedure, 'EXECUTE')
  ),
  'trusted-only security-definer functions are not executable by anon'
);

select ok(
  not exists (
    select 1
    from expected_security_definer_execute_privileges
    where access_tier = 'trusted'
      and has_function_privilege('authenticated', function_signature::regprocedure, 'EXECUTE')
  ),
  'trusted-only security-definer functions are not executable by authenticated'
);

select ok(
  not exists (
    select 1
    from expected_security_definer_execute_privileges
    where role_name = 'service_role'
      and not has_function_privilege('service_role', function_signature::regprocedure, 'EXECUTE')
  ),
  'service_role retains every reviewed client, trusted-only, storage, analytics, lifecycle, deletion, free-plan, and trigger RPC'
);

select ok(
  not exists (
    select 1
    from pg_proc as p
    join pg_namespace as n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ),
  'service_role retains execution of already-hardened public security-definer functions'
);

select ok(
  has_function_privilege(
    'supabase_auth_admin',
    'public.handle_new_auth_user()',
    'EXECUTE'
  ),
  'supabase_auth_admin can execute the auth profile trigger function'
);

select ok(
  has_function_privilege(
    'supabase_auth_admin',
    'public.create_notification_settings_for_new_user()',
    'EXECUTE'
  ),
  'supabase_auth_admin can execute the notification-settings trigger function'
);

select * from finish();

rollback;
