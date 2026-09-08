-- Phase A: future functions created by postgres in public default to trusted-only execution.
-- PostgreSQL's built-in PUBLIC function grant is global, so clear global grants before
-- clearing the schema-specific grants inherited from the initial public defaults.
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

-- Phase B: remove untrusted execution from every current public SECURITY DEFINER function.
do $$
declare
  security_definer_function regprocedure;
begin
  for security_definer_function in
    select p.oid::regprocedure
    from pg_proc as p
    join pg_namespace as n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      security_definer_function
    );
  end loop;
end;
$$;

-- Phase C: explicit client-role allowlists.
grant execute on function
  public.has_workspace_role(uuid, text[]),
  public.is_workspace_member(uuid)
to anon, authenticated, service_role;

grant execute on function
  public.record_internal_audit_event(uuid, text, text, uuid, uuid, uuid, jsonb),
  public.replace_link_allowlist_rules(uuid, uuid, text[], text[], uuid[], uuid[]),
  public.update_workspace_user_group_atomic(uuid, uuid, text, text[]),
  public.replace_link_preset_rules(uuid, uuid, text[], text[], uuid[], uuid[]),
  public.upsert_link_preset(uuid, text, jsonb, text[], text[], uuid[], uuid[]),
  public.replace_link_alc_rules(uuid, uuid, jsonb),
  public.get_link_country_views(uuid, uuid[]),
  public.get_document_link_metrics_v2(uuid, uuid, uuid[], text[], timestamptz, timestamptz),
  public.get_document_page_attention_v2(uuid, uuid, uuid[], text[], timestamptz, timestamptz),
  public.get_document_viewer_insights_v2(uuid, uuid, uuid[], text[], timestamptz, timestamptz),
  public.get_document_viewer_pages_v2(uuid, uuid, uuid[], text[], timestamptz, timestamptz),
  public.get_link_country_views_v2(uuid, uuid[], text[], timestamptz, timestamptz),
  public.get_resource_link_metrics_v2(uuid, public.resource_type, uuid, uuid[], timestamptz, timestamptz),
  public.get_documents_metrics_v2(uuid, uuid[], uuid, timestamptz, timestamptz),
  public.get_documents_page_attention_v2(uuid, uuid[], uuid, timestamptz, timestamptz),
  public.get_documents_viewer_insights_v2(uuid, uuid[], uuid, timestamptz, timestamptz),
  public.get_documents_viewer_pages_v2(uuid, uuid[], uuid, timestamptz, timestamptz),
  public.get_data_room_metrics_v2(uuid, uuid[], timestamptz, timestamptz),
  public.get_workspace_kpis_v2(uuid, timestamptz, timestamptz),
  public.get_workspace_most_active_documents_v2(uuid, integer, timestamptz, timestamptz),
  public.get_workspace_top_countries_v2(uuid, integer, timestamptz, timestamptz),
  public.get_document_viewer_insights_export_v2(uuid, uuid, uuid[], text[], timestamptz, timestamptz),
  public.workspace_allows_new_member(uuid)
to authenticated, service_role;

-- Phase D: exact trusted-role grants.
grant execute on function
  public.apply_workspace_storage_delta(uuid, bigint),
  public.auth_user_id_by_email(text),
  public.get_dashboard_kpis(uuid),
  public.get_most_active_content(uuid, integer),
  public.get_top_viewers(uuid, integer),
  public.increment_document_country_view(uuid, text),
  public.increment_link_country_view(uuid, uuid, text),
  public.record_workspace_bandwidth(uuid, bigint, integer, bigint, bigint),
  public.prune_workspace_bandwidth_daily(integer),
  public.prune_public_analytics_v2(integer),
  public.workspace_name_available(text),
  public.record_public_analytics_event(
    uuid,
    uuid,
    public.resource_type,
    uuid,
    uuid,
    public.analytics_resource_category,
    text,
    text,
    text,
    text,
    public.analytics_event_type,
    integer,
    bigint,
    integer
  ),
  public.record_public_analytics_event_v2(
    uuid,
    uuid,
    public.resource_type,
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    public.analytics_event_type,
    integer,
    bigint,
    integer,
    text,
    text
  ),
  public.enqueue_lifecycle_email_job(text, uuid, uuid, timestamptz, text, jsonb),
  public.claim_lifecycle_email_jobs(integer, timestamptz),
  public.finalize_lifecycle_email_job(uuid, text, text),
  public.reschedule_lifecycle_email_job(uuid, timestamptz),
  public.list_inactive_workspace_owner_candidates(timestamptz, integer),
  public.invoke_lifecycle_email_worker(),
  public.delete_workspace_cascade(uuid),
  public.delete_data_room_cascade(uuid, uuid),
  public.workspace_effective_plan_id(uuid),
  public.lock_workspace_free_plan_guard(uuid),
  public.add_owner_membership(),
  public.before_insert_set_workspace_id(),
  public.create_notification_settings_for_new_user(),
  public.handle_document_storage_change(),
  public.prevent_nda_template_change(),
  public.snapshot_nda_template(),
  public.set_data_room_documents_workspace_id(),
  public.record_audit_event_from_trigger(),
  public.handle_data_room_created_membership(),
  public.handle_workspace_created_role_presets(),
  public.handle_document_version_storage_change(),
  public.enforce_free_plan_document_limits(),
  public.enforce_free_plan_version_limits(),
  public.enforce_free_plan_member_limit(),
  public.enforce_free_plan_invite_limit()
to service_role;

grant execute on function
  public.handle_new_auth_user(),
  public.create_notification_settings_for_new_user()
to supabase_auth_admin;
