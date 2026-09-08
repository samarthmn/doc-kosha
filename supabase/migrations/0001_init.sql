


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';

CREATE SCHEMA IF NOT EXISTS "extensions";

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";



CREATE TYPE "public"."access_type" AS ENUM (
    'public',
    'protected'
);


ALTER TYPE "public"."access_type" OWNER TO "postgres";


CREATE TYPE "public"."analytics_event_type" AS ENUM (
    'view',
    'download',
    'page_view',
    'section_time'
);


ALTER TYPE "public"."analytics_event_type" OWNER TO "postgres";


CREATE TYPE "public"."analytics_resource_category" AS ENUM (
    'doc',
    'image',
    'audio',
    'video',
    'data_room'
);


ALTER TYPE "public"."analytics_resource_category" OWNER TO "postgres";


CREATE TYPE "public"."resource_type" AS ENUM (
    'document',
    'folder',
    'data_room'
);


ALTER TYPE "public"."resource_type" OWNER TO "postgres";


CREATE TYPE "public"."subscription_status" AS ENUM (
    'none',
    'trialing',
    'active',
    'past_due',
    'canceled',
    'expired',
    'incomplete'
);


ALTER TYPE "public"."subscription_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'owner',
    'editor',
    'viewer'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_owner_membership"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."add_owner_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_workspace_storage_delta"("p_workspace_id" "uuid", "p_delta" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_new_total bigint;
begin
  if p_workspace_id is null or coalesce(p_delta, 0) = 0 then
    return;
  end if;

  insert into public.workspace_storage_current (workspace_id, storage_used_bytes, updated_at)
  values (p_workspace_id, greatest(p_delta, 0), now())
  on conflict (workspace_id) do update
    set storage_used_bytes = greatest(
          0,
          public.workspace_storage_current.storage_used_bytes + p_delta
        ),
        updated_at = now()
  returning storage_used_bytes into v_new_total;

  insert into public.workspace_storage_daily (workspace_id, day, storage_used_bytes, updated_at)
  values (p_workspace_id, current_date, greatest(v_new_total, 0), now())
  on conflict (workspace_id, day) do update
    set storage_used_bytes = greatest(v_new_total, 0),
        updated_at = now();
end;
$$;


ALTER FUNCTION "public"."apply_workspace_storage_delta"("p_workspace_id" "uuid", "p_delta" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_user_id_by_email"("p_email" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select u.id
  from auth.users u
  where lower(u.email) = lower(p_email)
  limit 1
$$;


ALTER FUNCTION "public"."auth_user_id_by_email"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."before_insert_set_workspace_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.workspace_id is null then
    new.workspace_id := public.resolve_workspace_for_ingest(new.link_id, new.resource_id);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."before_insert_set_workspace_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_notification_settings_for_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Insert defaults with all values true; ignore if already exists
  insert into public.notification_settings (
    user_id,
    email_notifications,
    browser_notifications,
    weekly_reports,
    security_alerts
  ) values (
    new.id,
    true,
    false,
    true,
    true
  ) on conflict (user_id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."create_notification_settings_for_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_kpis"("p_workspace_id" "uuid") RETURNS TABLE("total_views" bigint, "unique_viewers" bigint, "total_downloads" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  select
    coalesce(sum(ar.total_views), 0) as total_views,
    (
      select count(distinct arv.viewer_key)
      from analytics_resource_viewers arv
      where arv.workspace_id = p_workspace_id
    ) as unique_viewers,
    coalesce(sum(ar.total_downloads), 0) as total_downloads
  from analytics_resources ar
  where ar.workspace_id = p_workspace_id;
end;
$$;


ALTER FUNCTION "public"."get_dashboard_kpis"("p_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_link_country_views"("p_workspace_id" "uuid", "p_link_ids" "uuid"[]) RETURNS TABLE("country_code" "text", "total_views" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if array_length(p_link_ids, 1) is null or array_length(p_link_ids, 1) = 0 then
    return;
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    return;
  end if;

  return query
    select
      lav.country_code,
      sum(lav.total_views)::bigint as total_views
    from public.analytics_link_country_views lav
    where lav.workspace_id = p_workspace_id
      and lav.link_id = any(p_link_ids)
    group by lav.country_code
    order by total_views desc
    limit 20;
end;
$$;


ALTER FUNCTION "public"."get_link_country_views"("p_workspace_id" "uuid", "p_link_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_most_active_content"("p_workspace_id" "uuid", "p_limit" integer DEFAULT 5) RETURNS TABLE("resource_id" "uuid", "resource_type" "public"."resource_type", "title" "text", "total_views" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  select
    ar.resource_id,
    ar.resource_type,
    case
      when ar.resource_type = 'document' then max(d.title)
      when ar.resource_type = 'data_room' then max(dr.name)
      else 'Unknown'
    end as title,
    sum(ar.total_views) as total_views
  from analytics_resources ar
  left join documents d on ar.resource_id = d.id and ar.resource_type = 'document'
  left join data_rooms dr on ar.resource_id = dr.id and ar.resource_type = 'data_room'
  where ar.workspace_id = p_workspace_id
  group by ar.resource_id, ar.resource_type
  order by total_views desc
  limit p_limit;
end;
$$;


ALTER FUNCTION "public"."get_most_active_content"("p_workspace_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_top_viewers"("p_workspace_id" "uuid", "p_limit" integer DEFAULT 5) RETURNS TABLE("email" "text", "view_count" bigint, "last_seen_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  select
    arv.viewer_email as email,
    sum(arv.view_count) as view_count,
    max(arv.last_seen_at) as last_seen_at
  from analytics_resource_viewers arv
  where arv.workspace_id = p_workspace_id
    and arv.viewer_email is not null
    and trim(arv.viewer_email) <> ''
  group by arv.viewer_email
  order by view_count desc
  limit p_limit;
end;
$$;


ALTER FUNCTION "public"."get_top_viewers"("p_workspace_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_document_storage_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_old_size bigint := coalesce(old.size_bytes, 0);
  v_new_size bigint := coalesce(new.size_bytes, 0);
begin
  if tg_op = 'INSERT' then
    perform public.apply_workspace_storage_delta(new.workspace_id, v_new_size);
    return new;
  elsif tg_op = 'DELETE' then
    perform public.apply_workspace_storage_delta(old.workspace_id, -v_old_size);
    return old;
  else
    if new.workspace_id <> old.workspace_id then
      perform public.apply_workspace_storage_delta(old.workspace_id, -v_old_size);
      perform public.apply_workspace_storage_delta(new.workspace_id, v_new_size);
    else
      perform public.apply_workspace_storage_delta(new.workspace_id, v_new_size - v_old_size);
    end if;
    return new;
  end if;
end;
$$;


ALTER FUNCTION "public"."handle_document_storage_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_workspace_role"("ws" "uuid", "roles" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists(
    select 1
    from public.workspace_members wm
    where wm.workspace_id = ws
      and wm.user_id = auth.uid()
      and wm.role::text = any(roles)
  );
$$;


ALTER FUNCTION "public"."has_workspace_role"("ws" "uuid", "roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_document_country_view"("p_workspace_id" "uuid", "p_country_code" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.analytics_document_country_views (workspace_id, country_code, total_views, updated_at)
  values (p_workspace_id, p_country_code, 1, now())
  on conflict (workspace_id, country_code) do update
  set total_views = public.analytics_document_country_views.total_views + 1,
      updated_at = now();
end;
$$;


ALTER FUNCTION "public"."increment_document_country_view"("p_workspace_id" "uuid", "p_country_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_link_country_view"("p_workspace_id" "uuid", "p_link_id" "uuid", "p_country_code" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_country text;
begin
  if p_workspace_id is null or p_link_id is null then
    return;
  end if;

  v_country := nullif(trim(both from coalesce(p_country_code, '')), '');
  if v_country is null then
    return;
  end if;

  insert into public.analytics_link_country_views (
    workspace_id,
    link_id,
    country_code,
    total_views,
    updated_at
  )
  values (
    p_workspace_id,
    p_link_id,
    upper(v_country),
    1,
    now()
  )
  on conflict (workspace_id, link_id, country_code) do update
  set
    total_views = public.analytics_link_country_views.total_views + 1,
    updated_at = now();
end;
$$;


ALTER FUNCTION "public"."increment_link_country_view"("p_workspace_id" "uuid", "p_link_id" "uuid", "p_country_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_workspace_member"("ws" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists(
    select 1 from public.workspace_members wm
    where wm.workspace_id = ws and wm.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_workspace_member"("ws" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_nda_template_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if old.nda_template_id is distinct from new.nda_template_id then
    raise exception 'NDA template cannot be changed after link creation';
  end if;
  if old.nda_template_snapshot_html is distinct from new.nda_template_snapshot_html then
    raise exception 'NDA template snapshot cannot be changed';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_nda_template_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_public_analytics_event"("p_workspace_id" "uuid", "p_link_id" "uuid", "p_resource_type" "public"."resource_type", "p_resource_id" "uuid", "p_document_id" "uuid", "p_resource_category" "public"."analytics_resource_category", "p_viewer_key" "text", "p_viewer_email" "text", "p_anonymous_user_id" "text", "p_session_id" "text", "p_event" "public"."analytics_event_type", "p_page_number" integer, "p_duration_ms" bigint, "p_section_offset" integer) RETURNS TABLE("is_unique_view" boolean, "is_revisit" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_now timestamptz := now();
  v_view_increment int := case when p_event = 'view' then 1 else 0 end;
  v_download_increment int := case when p_event = 'download' then 1 else 0 end;
  v_time_increment bigint := case
    when p_event in ('page_view','section_time') then coalesce(p_duration_ms, 0)
    else 0
  end;
  v_page_increment int := 0;
  v_session_page_row_count int := 0;
  v_is_new_session_page boolean := false;
  v_existing_views bigint := 0;
  v_is_unique boolean := false;
  v_is_revisit boolean := false;
  v_page_existing bigint := 0;
  v_page_unique boolean := false;
begin
  if p_workspace_id is null then
    raise exception 'workspace_id is required';
  end if;
  if p_viewer_key is null then
    raise exception 'viewer_key is required';
  end if;

  -- Page view counters should be based on unique (session_id × page_number)
  -- per link/document. If session_id is missing, fall back to legacy behavior
  -- (increment per event) for backward compatibility.
  if p_event = 'page_view'
     and p_document_id is not null
     and p_page_number is not null then
    if nullif(p_session_id, '') is null then
      v_is_new_session_page := true;
    else
      insert into public.analytics_session_pages (
        workspace_id,
        document_id,
        link_id,
        session_id,
        page_number,
        created_at
      )
      values (
        p_workspace_id,
        p_document_id,
        p_link_id,
        p_session_id,
        p_page_number,
        v_now
      )
      on conflict (document_id, link_id, session_id, page_number) do nothing;

      get diagnostics v_session_page_row_count = row_count;
      v_is_new_session_page := (v_session_page_row_count > 0);
    end if;
  end if;

  v_page_increment := case
    when p_event = 'page_view' and v_is_new_session_page then 1
    else 0
  end;

  select view_count
  into v_existing_views
  from public.analytics_resource_viewers
  where workspace_id = p_workspace_id
    and resource_type = p_resource_type
    and resource_id = p_resource_id
    and link_id = p_link_id
    and viewer_key = p_viewer_key
  for update;

  if not found then
    v_is_unique := (p_event = 'view');
    insert into public.analytics_resource_viewers (
      workspace_id,
      resource_type,
      resource_id,
      link_id,
      document_id,
      resource_category,
      viewer_key,
      viewer_email,
      anonymous_user_id,
      view_count,
      download_count,
      total_time_ms,
      first_seen_at,
      last_seen_at,
      last_session_id
    )
    values (
      p_workspace_id,
      p_resource_type,
      p_resource_id,
      p_link_id,
      p_document_id,
      p_resource_category,
      p_viewer_key,
      p_viewer_email,
      p_anonymous_user_id,
      v_view_increment,
      v_download_increment,
      v_time_increment,
      v_now,
      v_now,
      p_session_id
    );
  else
    v_is_unique := (p_event = 'view' and v_existing_views = 0);
    v_is_revisit := (p_event = 'view' and v_existing_views > 0);
    update public.analytics_resource_viewers
      set view_count = view_count + v_view_increment,
          download_count = download_count + v_download_increment,
          total_time_ms = total_time_ms + v_time_increment,
          last_seen_at = v_now,
          last_session_id = coalesce(p_session_id, last_session_id),
          viewer_email = coalesce(p_viewer_email, viewer_email),
          anonymous_user_id = coalesce(p_anonymous_user_id, anonymous_user_id)
      where workspace_id = p_workspace_id
        and resource_type = p_resource_type
        and resource_id = p_resource_id
        and link_id = p_link_id
        and viewer_key = p_viewer_key;
  end if;

  insert into public.analytics_resources (
    workspace_id,
    resource_type,
    resource_id,
    link_id,
    document_id,
    resource_category,
    total_views,
    unique_viewers,
    total_revisits,
    total_downloads,
    total_time_ms,
    total_page_views,
    created_at,
    updated_at,
    first_viewed_at,
    last_viewed_at
  )
  values (
    p_workspace_id,
    p_resource_type,
    p_resource_id,
    p_link_id,
    p_document_id,
    p_resource_category,
    v_view_increment,
    case when v_is_unique then 1 else 0 end,
    case when v_is_revisit then 1 else 0 end,
    v_download_increment,
    v_time_increment,
    v_page_increment,
    v_now,
    v_now,
    case when v_view_increment > 0 then v_now else null end,
    case when v_view_increment > 0 then v_now else null end
  )
  on conflict (workspace_id, resource_type, resource_id, link_id) do update
  set total_views = public.analytics_resources.total_views + v_view_increment,
      unique_viewers = public.analytics_resources.unique_viewers + case when v_is_unique then 1 else 0 end,
      total_revisits = public.analytics_resources.total_revisits + case when v_is_revisit then 1 else 0 end,
      total_downloads = public.analytics_resources.total_downloads + v_download_increment,
      total_time_ms = public.analytics_resources.total_time_ms + v_time_increment,
      total_page_views = public.analytics_resources.total_page_views + v_page_increment,
      updated_at = v_now,
      first_viewed_at = coalesce(
        public.analytics_resources.first_viewed_at,
        case when v_view_increment > 0 then v_now else null end
      ),
      last_viewed_at = case
        when v_view_increment > 0 then v_now
        else public.analytics_resources.last_viewed_at
      end;

  if p_event = 'page_view'
     and p_document_id is not null
     and p_page_number is not null then
    select view_count
    into v_page_existing
    from public.analytics_viewer_pages
    where workspace_id = p_workspace_id
      and document_id = p_document_id
      and link_id = p_link_id
      and viewer_key = p_viewer_key
      and page_number = p_page_number
    for update;

    if not found then
      v_page_unique := true;
      insert into public.analytics_viewer_pages (
        workspace_id,
        document_id,
        link_id,
        viewer_key,
        page_number,
        total_time_ms,
        view_count,
        first_seen_at,
        last_seen_at
      )
      values (
        p_workspace_id,
        p_document_id,
        p_link_id,
        p_viewer_key,
        p_page_number,
        coalesce(p_duration_ms, 0),
        v_page_increment,
        v_now,
        v_now
      );
    else
      v_page_unique := false;
      update public.analytics_viewer_pages
        set total_time_ms = total_time_ms + coalesce(p_duration_ms, 0),
            view_count = view_count + v_page_increment,
            last_seen_at = v_now
        where workspace_id = p_workspace_id
          and document_id = p_document_id
          and link_id = p_link_id
          and viewer_key = p_viewer_key
          and page_number = p_page_number;
    end if;

    insert into public.analytics_document_pages (
      workspace_id,
      document_id,
      link_id,
      page_number,
      total_page_views,
      unique_viewers,
      total_time_ms,
      created_at,
      updated_at
    )
    values (
      p_workspace_id,
      p_document_id,
      p_link_id,
      p_page_number,
      v_page_increment,
      case when v_page_unique then 1 else 0 end,
      coalesce(p_duration_ms, 0),
      v_now,
      v_now
    )
    on conflict (document_id, link_id, page_number) do update
    set total_page_views = public.analytics_document_pages.total_page_views + v_page_increment,
        unique_viewers = public.analytics_document_pages.unique_viewers + case when v_page_unique then 1 else 0 end,
        total_time_ms = public.analytics_document_pages.total_time_ms + coalesce(p_duration_ms, 0),
        updated_at = v_now;
  end if;

  if p_event = 'section_time'
     and p_document_id is not null
     and p_section_offset is not null then
    insert into public.analytics_media_sections (
      workspace_id,
      document_id,
      link_id,
      section_offset,
      total_time_ms,
      created_at,
      updated_at
    )
    values (
      p_workspace_id,
      p_document_id,
      p_link_id,
      p_section_offset,
      coalesce(p_duration_ms, 0),
      v_now,
      v_now
    )
    on conflict (document_id, link_id, section_offset) do update
    set total_time_ms = public.analytics_media_sections.total_time_ms + coalesce(p_duration_ms, 0),
        updated_at = v_now;
  end if;

  return query select v_is_unique, v_is_revisit;
end;
$$;


ALTER FUNCTION "public"."record_public_analytics_event"("p_workspace_id" "uuid", "p_link_id" "uuid", "p_resource_type" "public"."resource_type", "p_resource_id" "uuid", "p_document_id" "uuid", "p_resource_category" "public"."analytics_resource_category", "p_viewer_key" "text", "p_viewer_email" "text", "p_anonymous_user_id" "text", "p_session_id" "text", "p_event" "public"."analytics_event_type", "p_page_number" integer, "p_duration_ms" bigint, "p_section_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_workspace_bandwidth"(
  "p_workspace_id" "uuid",
  "p_bytes" bigint,
  "p_downloads" integer DEFAULT 0,
  "p_r2_class_a_ops" bigint DEFAULT 0,
  "p_r2_class_b_ops" bigint DEFAULT 0
) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Allow tracking if we have bytes, downloads, or ops
  if p_workspace_id is null then
    return;
  end if;
  if coalesce(p_bytes, 0) <= 0
     and coalesce(p_downloads, 0) <= 0
     and coalesce(p_r2_class_a_ops, 0) <= 0
     and coalesce(p_r2_class_b_ops, 0) <= 0 then
    return;
  end if;

  insert into public.workspace_bandwidth_daily (
    workspace_id,
    day,
    bytes_served,
    downloads_count,
    r2_class_a_ops,
    r2_class_b_ops,
    updated_at
  )
  values (
    p_workspace_id,
    current_date,
    greatest(coalesce(p_bytes, 0), 0),
    greatest(coalesce(p_downloads, 0), 0),
    greatest(coalesce(p_r2_class_a_ops, 0), 0),
    greatest(coalesce(p_r2_class_b_ops, 0), 0),
    now()
  )
  on conflict (workspace_id, day) do update
    set bytes_served = public.workspace_bandwidth_daily.bytes_served + greatest(coalesce(p_bytes, 0), 0),
        downloads_count = public.workspace_bandwidth_daily.downloads_count + greatest(coalesce(p_downloads, 0), 0),
        r2_class_a_ops = public.workspace_bandwidth_daily.r2_class_a_ops + greatest(coalesce(p_r2_class_a_ops, 0), 0),
        r2_class_b_ops = public.workspace_bandwidth_daily.r2_class_b_ops + greatest(coalesce(p_r2_class_b_ops, 0), 0),
        updated_at = now();
end;
$$;


ALTER FUNCTION "public"."record_workspace_bandwidth"("p_workspace_id" "uuid", "p_bytes" bigint, "p_downloads" integer, "p_r2_class_a_ops" bigint, "p_r2_class_b_ops" bigint) OWNER TO "postgres";


-- Retention helper function: prune bandwidth data older than specified days
CREATE OR REPLACE FUNCTION "public"."prune_workspace_bandwidth_daily"("p_keep_days" integer DEFAULT 365) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  deleted_count integer;
begin
  delete from public.workspace_bandwidth_daily
  where day < current_date - p_keep_days;
  
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

ALTER FUNCTION "public"."prune_workspace_bandwidth_daily"("p_keep_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_public_link"("document_id" "uuid", "link_id" "uuid", "email" "text", "password" "text", "accept_nda" boolean) RETURNS TABLE("can_download" boolean, "apply_watermark" boolean, "dynamic_watermark_variables" boolean, "dynamic_watermark_email" boolean, "dynamic_watermark_ip" boolean, "watermark_id" "uuid", "email_verification" boolean, "screenshot_protection" boolean, "expires_at" timestamp with time zone, "show_qas" boolean, "curated_qas" "jsonb", "show_feedback" boolean, "email_notify" boolean, "doc_id" "uuid", "title" "text", "file_type" "text", "num_pages" integer, "storage_path" "text", "converted_storage_path" "text", "workspace_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  l links%rowtype;
  d documents%rowtype;
  ws_name text;
begin
  select * into l from public.links where id = link_id;
  if not found or l.document_id is distinct from document_id then
    raise exception 'NOT_FOUND';
  end if;

  if l.revoked_at is not null then
    raise exception 'REVOKED';
  end if;
  if l.expires_at is not null and l.expires_at < now() then
    raise exception 'EXPIRED';
  end if;

  if l.password_hash is not null then
    if password is null or crypt(password, l.password_hash) <> l.password_hash then
      raise exception 'BAD_PASSWORD';
    end if;
  end if;

  select * into d from public.documents where id = document_id;
  select name into ws_name from public.workspaces where id = d.workspace_id;

  can_download := l.can_download;
  apply_watermark := l.apply_watermark;
  dynamic_watermark_email := coalesce(l.dynamic_watermark_email, false);
  dynamic_watermark_ip := coalesce(l.dynamic_watermark_ip, false);
  dynamic_watermark_variables := dynamic_watermark_email or dynamic_watermark_ip;
  watermark_id := l.watermark_id;
  email_verification := l.email_verification;
  screenshot_protection := l.screenshot_protection;
  expires_at := l.expires_at;
  show_qas := l.show_qas;
  curated_qas := l.curated_qas;
  show_feedback := l.show_feedback;
  email_notify := l.email_notify;
  doc_id := l.document_id;
  title := d.title;
  file_type := d.file_type;
  num_pages := d.num_pages;
  storage_path := d.storage_path;
  converted_storage_path := d.converted_storage_path;
  workspace_name := ws_name;
  return next;
end;
$$;


ALTER FUNCTION "public"."resolve_public_link"("document_id" "uuid", "link_id" "uuid", "email" "text", "password" "text", "accept_nda" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."resolve_public_link"("document_id" "uuid", "link_id" "uuid", "email" "text", "password" "text", "accept_nda" boolean) IS 'Resolves a public document link and exposes watermark selection + dynamic flags; email/NDA gates enforced by API layer';



CREATE OR REPLACE FUNCTION "public"."resolve_workspace_for_ingest"("_link_id" "uuid", "_resource_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce(
    (select workspace_id from public.links where id = _link_id),
    (select workspace_id from public.documents where id = _resource_id)
  );
$$;


ALTER FUNCTION "public"."resolve_workspace_for_ingest"("_link_id" "uuid", "_resource_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end; $$;


ALTER FUNCTION "public"."set_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."snapshot_nda_template"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  tpl_body text;
  tpl_ws uuid;
begin
  if new.nda_gate is true then
    if new.nda_template_id is null then
      raise exception 'NDA template is required when NDA gating is enabled';
    end if;

    select body_html, workspace_id
      into tpl_body, tpl_ws
    from public.nda_templates
    where id = new.nda_template_id
      and archived_at is null;

    if tpl_body is null then
      raise exception 'NDA template not found or archived';
    end if;

    if tpl_ws is distinct from new.workspace_id then
      raise exception 'NDA template does not belong to this workspace';
    end if;

    if new.nda_template_snapshot_html is null then
      new.nda_template_snapshot_html := tpl_body;
    end if;
  else
    new.nda_template_id := null;
    new.nda_template_snapshot_html := null;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."snapshot_nda_template"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_set_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."tg_set_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."workspace_has_entitlement"("ws" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce(
    (
      select
        (
          (s.status = 'active' and (s.current_period_ends_at is null or s.current_period_ends_at > now()))
          or (s.status = 'trialing' and s.trial_ends_at is not null and s.trial_ends_at > now())
        )
      from public.workspace_subscriptions s
      where s.workspace_id = ws
    ),
    false
  );
$$;


ALTER FUNCTION "public"."workspace_has_entitlement"("ws" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."workspace_name_available"("target_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
   select not exists (
     select 1
     from public.workspaces w
     where lower(trim(w.name)) = lower(trim(target_name))
   );
 $$;


ALTER FUNCTION "public"."workspace_name_available"("target_name" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."analytics_document_country_views" (
    "workspace_id" "uuid" NOT NULL,
    "country_code" "text" NOT NULL,
    "total_views" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."analytics_document_country_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_document_pages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "document_id" "uuid" NOT NULL,
    "link_id" "uuid" NOT NULL,
    "page_number" integer NOT NULL,
    "total_page_views" bigint DEFAULT 0 NOT NULL,
    "unique_viewers" bigint DEFAULT 0 NOT NULL,
    "total_time_ms" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "analytics_document_pages_page_number_check" CHECK (("page_number" > 0))
);


ALTER TABLE "public"."analytics_document_pages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_link_country_views" (
    "workspace_id" "uuid" NOT NULL,
    "link_id" "uuid" NOT NULL,
    "country_code" "text" NOT NULL,
    "total_views" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."analytics_link_country_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_media_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "document_id" "uuid" NOT NULL,
    "link_id" "uuid" NOT NULL,
    "section_offset" integer NOT NULL,
    "total_time_ms" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "analytics_media_sections_section_offset_check" CHECK (("section_offset" >= 0))
);


ALTER TABLE "public"."analytics_media_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_resource_viewers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "resource_type" "public"."resource_type" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "link_id" "uuid" NOT NULL,
    "document_id" "uuid",
    "resource_category" "public"."analytics_resource_category" NOT NULL,
    "viewer_key" "text" NOT NULL,
    "viewer_email" "text",
    "anonymous_user_id" "text",
    "view_count" bigint DEFAULT 0 NOT NULL,
    "download_count" bigint DEFAULT 0 NOT NULL,
    "total_time_ms" bigint DEFAULT 0 NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_session_id" "text"
);


ALTER TABLE "public"."analytics_resource_viewers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "resource_type" "public"."resource_type" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "link_id" "uuid" NOT NULL,
    "document_id" "uuid",
    "resource_category" "public"."analytics_resource_category" NOT NULL,
    "total_views" bigint DEFAULT 0 NOT NULL,
    "unique_viewers" bigint DEFAULT 0 NOT NULL,
    "total_revisits" bigint DEFAULT 0 NOT NULL,
    "total_downloads" bigint DEFAULT 0 NOT NULL,
    "total_time_ms" bigint DEFAULT 0 NOT NULL,
    "total_page_views" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "first_viewed_at" timestamp with time zone,
    "last_viewed_at" timestamp with time zone
);


ALTER TABLE "public"."analytics_resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_session_pages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "document_id" "uuid" NOT NULL,
    "link_id" "uuid" NOT NULL,
    "session_id" "text" NOT NULL,
    "page_number" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "analytics_session_pages_page_number_check" CHECK (("page_number" > 0)),
    CONSTRAINT "analytics_session_pages_session_id_check" CHECK (("char_length"("session_id") > 0))
);


ALTER TABLE "public"."analytics_session_pages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_viewer_pages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "document_id" "uuid" NOT NULL,
    "link_id" "uuid" NOT NULL,
    "viewer_key" "text" NOT NULL,
    "page_number" integer NOT NULL,
    "total_time_ms" bigint DEFAULT 0 NOT NULL,
    "view_count" bigint DEFAULT 0 NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "analytics_viewer_pages_page_number_check" CHECK (("page_number" > 0))
);


ALTER TABLE "public"."analytics_viewer_pages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."branding" (
    "workspace_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "company_name" "text",
    "website_url" "text",
    "logo_storage_path" "text",
    "watermark_title" "text",
    "watermark_color" "text",
    "watermark_font_size" real,
    "watermark_opacity" real
);


ALTER TABLE "public"."branding" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_domains" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "domain" "text" NOT NULL,
    "verification_token" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "verified_at" timestamp with time zone,
    "cname_target" "text" DEFAULT 'cname.vercel-dns.com'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "custom_domains_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."custom_domains" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_room_documents" (
    "data_room_id" "uuid" NOT NULL,
    "document_id" "uuid" NOT NULL
);


ALTER TABLE "public"."data_room_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_disabled" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."data_rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "folder_id" "uuid",
    "title" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "size_bytes" bigint NOT NULL,
    "num_pages" integer,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "converted_storage_path" "text",
    "conversion_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "data_room_id" "uuid"
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_otps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid",
    "link_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "code_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "data_room_id" "uuid",
    CONSTRAINT "email_otps_purpose_check" CHECK (("purpose" = ANY (ARRAY['view'::"text", 'nda'::"text"]))),
    CONSTRAINT "email_otps_resource_check" CHECK (((("document_id" IS NOT NULL) AND ("data_room_id" IS NULL)) OR (("document_id" IS NULL) AND ("data_room_id" IS NOT NULL))))
);


ALTER TABLE "public"."email_otps" OWNER TO "postgres";


COMMENT ON TABLE "public"."email_otps" IS 'OTP codes for email verification (view access and NDA signing)';



CREATE TABLE IF NOT EXISTS "public"."feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "link_id" "uuid",
    "resource_type" "public"."resource_type" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "form_schema" "jsonb",
    "submission" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "parent_folder_id" "uuid",
    "name" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "data_room_id" "uuid"
);


ALTER TABLE "public"."folders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."link_allowed_emails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "link_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "link_allowed_emails_email_normalized" CHECK ((("length"(TRIM(BOTH FROM "email")) > 0) AND ("email" = "lower"("email"))))
);


ALTER TABLE "public"."link_allowed_emails" OWNER TO "postgres";


COMMENT ON TABLE "public"."link_allowed_emails" IS 'Per-link email allowlist enforcing viewer identity.';



COMMENT ON COLUMN "public"."link_allowed_emails"."email" IS 'Normalized (lowercase) email address granted access.';



CREATE TABLE IF NOT EXISTS "public"."links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "document_id" "uuid",
    "folder_id" "uuid",
    "data_room_id" "uuid",
    "access" "public"."access_type" DEFAULT 'public'::"public"."access_type" NOT NULL,
    "password_hash" "text",
    "email_notify" boolean DEFAULT false NOT NULL,
    "expires_at" timestamp with time zone,
    "can_download" boolean DEFAULT false NOT NULL,
    "email_verification" boolean DEFAULT false NOT NULL,
    "screenshot_protection" boolean DEFAULT true NOT NULL,
    "apply_watermark" boolean DEFAULT true NOT NULL,
    "dynamic_watermark_variables" boolean DEFAULT false NOT NULL,
    "open_once" boolean DEFAULT false NOT NULL,
    "nda_gate" boolean DEFAULT false NOT NULL,
    "revoked_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "show_qas" boolean DEFAULT false NOT NULL,
    "curated_qas" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "show_feedback" boolean DEFAULT false NOT NULL,
    "name" "text" DEFAULT 'Untitled link'::"text" NOT NULL,
    "collect_email_for_analytics" boolean DEFAULT false NOT NULL,
    "nda_template_id" "uuid",
    "nda_template_snapshot_html" "text",
    "watermark_id" "uuid",
    "dynamic_watermark_email" boolean DEFAULT false NOT NULL,
    "dynamic_watermark_ip" boolean DEFAULT false NOT NULL,
    CONSTRAINT "collect_email_requires_verification" CHECK ((("collect_email_for_analytics" = false) OR ("email_verification" = true)))
);


ALTER TABLE "public"."links" OWNER TO "postgres";


COMMENT ON COLUMN "public"."links"."can_download" IS 'Allow downloads (default: false for security)';



COMMENT ON COLUMN "public"."links"."screenshot_protection" IS 'Screenshot protection (default: true)';



COMMENT ON COLUMN "public"."links"."apply_watermark" IS 'Show watermark overlay (default: true)';



COMMENT ON COLUMN "public"."links"."show_qas" IS 'Toggle to display curated Q&A list on public viewer';



COMMENT ON COLUMN "public"."links"."curated_qas" IS 'Array of {question: string, answer: string} objects for display';



COMMENT ON COLUMN "public"."links"."name" IS 'Human-friendly label shown in management UI';



COMMENT ON COLUMN "public"."links"."nda_template_id" IS 'Selected NDA template at link creation (null for default template)';



COMMENT ON COLUMN "public"."links"."nda_template_snapshot_html" IS 'Pinned copy of the template body_html at link creation';



COMMENT ON COLUMN "public"."links"."watermark_id" IS 'Optional workspace watermark template to apply';



COMMENT ON COLUMN "public"."links"."dynamic_watermark_email" IS 'Include verified email beneath watermark';



COMMENT ON COLUMN "public"."links"."dynamic_watermark_ip" IS 'Include viewer IP beneath watermark';



CREATE TABLE IF NOT EXISTS "public"."nda_signatures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "document_id" "uuid",
    "link_id" "uuid",
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "signed_pdf_path" "text",
    "signed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "data_room_id" "uuid",
    CONSTRAINT "nda_signatures_resource_check" CHECK (((("document_id" IS NOT NULL) AND ("data_room_id" IS NULL)) OR (("document_id" IS NULL) AND ("data_room_id" IS NOT NULL))))
);


ALTER TABLE "public"."nda_signatures" OWNER TO "postgres";


COMMENT ON TABLE "public"."nda_signatures" IS 'Per-document NDA signatures with viewer details';



CREATE TABLE IF NOT EXISTS "public"."nda_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "body_html" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    CONSTRAINT "nda_templates_name_check" CHECK (("char_length"("name") <= 120))
);


ALTER TABLE "public"."nda_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."nda_templates" IS 'Custom NDA templates per workspace; body_html is the editable clause text.';



CREATE TABLE IF NOT EXISTS "public"."notification_settings" (
    "user_id" "uuid" NOT NULL,
    "email_notifications" boolean DEFAULT true NOT NULL,
    "browser_notifications" boolean DEFAULT false NOT NULL,
    "weekly_reports" boolean DEFAULT true NOT NULL,
    "security_alerts" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "company" "text",
    "industry" "text",
    "job_title" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "primary_use_case" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "link_id" "uuid",
    "resource_type" "public"."resource_type" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text",
    "author_email_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."qas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."watermarks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "definition" "jsonb" NOT NULL,
    "image_storage_path" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."watermarks" OWNER TO "postgres";


COMMENT ON TABLE "public"."watermarks" IS 'Workspace-level watermark templates (text/image/hybrid + layout settings)';



COMMENT ON COLUMN "public"."watermarks"."definition" IS 'JSON payload describing watermark pattern, spacing, text/image config, and dynamic settings';



CREATE TABLE IF NOT EXISTS "public"."workspace_bandwidth_daily" (
    "workspace_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "bytes_served" bigint DEFAULT 0 NOT NULL,
    "downloads_count" bigint DEFAULT 0 NOT NULL,
    "r2_class_a_ops" bigint DEFAULT 0 NOT NULL,
    "r2_class_b_ops" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspace_bandwidth_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."user_role" NOT NULL,
    "invited_by" "uuid",
    "invited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_by" "uuid",
    "accepted_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."workspace_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_members" (
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspace_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_storage_current" (
    "workspace_id" "uuid" NOT NULL,
    "storage_used_bytes" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspace_storage_current" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_storage_daily" (
    "workspace_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "storage_used_bytes" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspace_storage_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_subscriptions" (
    "workspace_id" "uuid" NOT NULL,
    "plan_id" "text" NOT NULL,
    "billing_interval" "text" NOT NULL,
    "status" "public"."subscription_status" DEFAULT 'none'::"public"."subscription_status" NOT NULL,
    "provider" "text" DEFAULT 'manual'::"text" NOT NULL,
    "provider_customer_id" "text",
    "provider_subscription_id" "text",
    "trial_started_at" timestamp with time zone,
    "trial_ends_at" timestamp with time zone,
    "trial_used_at" timestamp with time zone,
    "current_period_started_at" timestamp with time zone,
    "current_period_ends_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workspace_subscriptions_billing_interval_check" CHECK (("billing_interval" = ANY (ARRAY['month'::"text", 'year'::"text"]))),
    CONSTRAINT "workspace_subscriptions_plan_id_check" CHECK (("plan_id" = ANY (ARRAY['essential'::"text", 'plus'::"text", 'max'::"text"]))),
    CONSTRAINT "workspace_subscriptions_provider_check" CHECK (("provider" = ANY (ARRAY['manual'::"text", 'stripe'::"text"])))
);


ALTER TABLE "public"."workspace_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "active_custom_domain_id" "uuid"
);


ALTER TABLE "public"."workspaces" OWNER TO "postgres";


ALTER TABLE ONLY "public"."analytics_document_country_views"
    ADD CONSTRAINT "analytics_document_country_views_pkey" PRIMARY KEY ("workspace_id", "country_code");



ALTER TABLE ONLY "public"."analytics_document_pages"
    ADD CONSTRAINT "analytics_document_pages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analytics_document_pages"
    ADD CONSTRAINT "analytics_document_pages_unique_page" UNIQUE ("document_id", "link_id", "page_number");



ALTER TABLE ONLY "public"."analytics_link_country_views"
    ADD CONSTRAINT "analytics_link_country_views_pkey" PRIMARY KEY ("workspace_id", "link_id", "country_code");



ALTER TABLE ONLY "public"."analytics_media_sections"
    ADD CONSTRAINT "analytics_media_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analytics_media_sections"
    ADD CONSTRAINT "analytics_media_sections_unique_slot" UNIQUE ("document_id", "link_id", "section_offset");



ALTER TABLE ONLY "public"."analytics_resource_viewers"
    ADD CONSTRAINT "analytics_resource_viewers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analytics_resource_viewers"
    ADD CONSTRAINT "analytics_resource_viewers_unique_viewer" UNIQUE ("resource_type", "resource_id", "link_id", "viewer_key");



ALTER TABLE ONLY "public"."analytics_resources"
    ADD CONSTRAINT "analytics_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analytics_resources"
    ADD CONSTRAINT "analytics_resources_unique_resource" UNIQUE ("workspace_id", "resource_type", "resource_id", "link_id");



ALTER TABLE ONLY "public"."analytics_session_pages"
    ADD CONSTRAINT "analytics_session_pages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analytics_session_pages"
    ADD CONSTRAINT "analytics_session_pages_unique_session_page" UNIQUE ("document_id", "link_id", "session_id", "page_number");



ALTER TABLE ONLY "public"."analytics_viewer_pages"
    ADD CONSTRAINT "analytics_viewer_pages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analytics_viewer_pages"
    ADD CONSTRAINT "analytics_viewer_pages_unique_viewer_page" UNIQUE ("document_id", "link_id", "viewer_key", "page_number");



ALTER TABLE ONLY "public"."branding"
    ADD CONSTRAINT "branding_pkey" PRIMARY KEY ("workspace_id");



ALTER TABLE ONLY "public"."custom_domains"
    ADD CONSTRAINT "custom_domains_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_domains"
    ADD CONSTRAINT "custom_domains_workspace_id_domain_key" UNIQUE ("workspace_id", "domain");



ALTER TABLE ONLY "public"."data_room_documents"
    ADD CONSTRAINT "data_room_documents_pkey" PRIMARY KEY ("data_room_id", "document_id");



ALTER TABLE ONLY "public"."data_rooms"
    ADD CONSTRAINT "data_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_otps"
    ADD CONSTRAINT "email_otps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."link_allowed_emails"
    ADD CONSTRAINT "link_allowed_emails_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."links"
    ADD CONSTRAINT "links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nda_signatures"
    ADD CONSTRAINT "nda_signatures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nda_templates"
    ADD CONSTRAINT "nda_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qas"
    ADD CONSTRAINT "qas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."watermarks"
    ADD CONSTRAINT "watermarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_bandwidth_daily"
    ADD CONSTRAINT "workspace_bandwidth_daily_pkey" PRIMARY KEY ("workspace_id", "day");



ALTER TABLE ONLY "public"."workspace_invites"
    ADD CONSTRAINT "workspace_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("workspace_id", "user_id");



ALTER TABLE ONLY "public"."workspace_storage_current"
    ADD CONSTRAINT "workspace_storage_current_pkey" PRIMARY KEY ("workspace_id");



ALTER TABLE ONLY "public"."workspace_storage_daily"
    ADD CONSTRAINT "workspace_storage_daily_pkey" PRIMARY KEY ("workspace_id", "day");



ALTER TABLE ONLY "public"."workspace_subscriptions"
    ADD CONSTRAINT "workspace_subscriptions_pkey" PRIMARY KEY ("workspace_id");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id");



CREATE INDEX "data_rooms_workspace_disabled_idx" ON "public"."data_rooms" USING "btree" ("workspace_id", "is_disabled");



CREATE INDEX "idx_analytics_document_pages_workspace" ON "public"."analytics_document_pages" USING "btree" ("workspace_id", "document_id");



CREATE INDEX "idx_analytics_media_sections_workspace" ON "public"."analytics_media_sections" USING "btree" ("workspace_id", "document_id");



CREATE INDEX "idx_analytics_resource_viewers_workspace" ON "public"."analytics_resource_viewers" USING "btree" ("workspace_id", "resource_type", "resource_id");



CREATE INDEX "idx_analytics_resources_workspace" ON "public"."analytics_resources" USING "btree" ("workspace_id", "updated_at" DESC);



CREATE INDEX "idx_analytics_session_pages_workspace" ON "public"."analytics_session_pages" USING "btree" ("workspace_id", "document_id");



CREATE INDEX "idx_documents_data_room" ON "public"."documents" USING "btree" ("data_room_id");



CREATE INDEX "idx_documents_title_trgm" ON "public"."documents" USING "gin" ("title" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_documents_workspace" ON "public"."documents" USING "btree" ("workspace_id");



CREATE INDEX "idx_email_otps_data_room_email_purpose" ON "public"."email_otps" USING "btree" ("data_room_id", "email", "purpose") WHERE ("consumed_at" IS NULL);



CREATE INDEX "idx_email_otps_doc_email_purpose" ON "public"."email_otps" USING "btree" ("document_id", "email", "purpose");



CREATE INDEX "idx_email_otps_expires" ON "public"."email_otps" USING "btree" ("expires_at") WHERE ("consumed_at" IS NULL);



CREATE INDEX "idx_email_otps_link_email_purpose" ON "public"."email_otps" USING "btree" ("link_id", "email", "purpose");



CREATE INDEX "idx_folders_data_room" ON "public"."folders" USING "btree" ("data_room_id");



CREATE INDEX "idx_link_allowed_emails_workspace" ON "public"."link_allowed_emails" USING "btree" ("workspace_id");



CREATE INDEX "idx_link_country_views_link" ON "public"."analytics_link_country_views" USING "btree" ("link_id", "updated_at" DESC);



CREATE INDEX "idx_nda_signatures_data_room" ON "public"."nda_signatures" USING "btree" ("data_room_id");



CREATE INDEX "idx_nda_signatures_workspace" ON "public"."nda_signatures" USING "btree" ("workspace_id");



CREATE INDEX "idx_nda_templates_workspace" ON "public"."nda_templates" USING "btree" ("workspace_id");



CREATE INDEX "idx_nda_templates_workspace_active" ON "public"."nda_templates" USING "btree" ("workspace_id") WHERE ("archived_at" IS NULL);



CREATE INDEX "idx_watermarks_workspace" ON "public"."watermarks" USING "btree" ("workspace_id");



CREATE UNIQUE INDEX "idx_workspace_invites_unique_active" ON "public"."workspace_invites" USING "btree" ("workspace_id", "lower"("email")) WHERE (("accepted_at" IS NULL) AND ("revoked_at" IS NULL));



CREATE INDEX "idx_workspace_invites_workspace" ON "public"."workspace_invites" USING "btree" ("workspace_id");



CREATE UNIQUE INDEX "uniq_link_allowed_emails_link_email" ON "public"."link_allowed_emails" USING "btree" ("link_id", "email");



CREATE UNIQUE INDEX "uniq_nda_sig_link_email" ON "public"."nda_signatures" USING "btree" ("link_id", "email") WHERE ("link_id" IS NOT NULL);



CREATE UNIQUE INDEX "uniq_watermarks_workspace_name" ON "public"."watermarks" USING "btree" ("workspace_id", "name");



CREATE UNIQUE INDEX "uq_custom_domains_domain_global" ON "public"."custom_domains" USING "btree" ("lower"("domain"));



CREATE UNIQUE INDEX "workspaces_name_ci_unique_idx" ON "public"."workspaces" USING "btree" ("lower"(TRIM(BOTH FROM "name")));



CREATE OR REPLACE TRIGGER "trg_add_owner" AFTER INSERT ON "public"."workspaces" FOR EACH ROW EXECUTE FUNCTION "public"."add_owner_membership"();



CREATE OR REPLACE TRIGGER "trg_custom_domains_set_timestamp" BEFORE UPDATE ON "public"."custom_domains" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_timestamp"();



CREATE OR REPLACE TRIGGER "trg_documents_workspace_storage" AFTER INSERT OR DELETE OR UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."handle_document_storage_change"();



CREATE OR REPLACE TRIGGER "trg_notification_settings_updated" BEFORE UPDATE ON "public"."notification_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_timestamp"();



CREATE OR REPLACE TRIGGER "trg_prevent_nda_template_change" BEFORE UPDATE ON "public"."links" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_nda_template_change"();



CREATE OR REPLACE TRIGGER "trg_set_ws_feedback" BEFORE INSERT ON "public"."feedback" FOR EACH ROW EXECUTE FUNCTION "public"."before_insert_set_workspace_id"();



CREATE OR REPLACE TRIGGER "trg_set_ws_qas" BEFORE INSERT ON "public"."qas" FOR EACH ROW EXECUTE FUNCTION "public"."before_insert_set_workspace_id"();



CREATE OR REPLACE TRIGGER "trg_snapshot_nda_template" BEFORE INSERT ON "public"."links" FOR EACH ROW EXECUTE FUNCTION "public"."snapshot_nda_template"();



ALTER TABLE ONLY "public"."analytics_document_country_views"
    ADD CONSTRAINT "analytics_document_country_views_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_document_pages"
    ADD CONSTRAINT "analytics_document_pages_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_document_pages"
    ADD CONSTRAINT "analytics_document_pages_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_document_pages"
    ADD CONSTRAINT "analytics_document_pages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_link_country_views"
    ADD CONSTRAINT "analytics_link_country_views_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_link_country_views"
    ADD CONSTRAINT "analytics_link_country_views_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_media_sections"
    ADD CONSTRAINT "analytics_media_sections_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_media_sections"
    ADD CONSTRAINT "analytics_media_sections_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_media_sections"
    ADD CONSTRAINT "analytics_media_sections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_resource_viewers"
    ADD CONSTRAINT "analytics_resource_viewers_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_resource_viewers"
    ADD CONSTRAINT "analytics_resource_viewers_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_resource_viewers"
    ADD CONSTRAINT "analytics_resource_viewers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_resources"
    ADD CONSTRAINT "analytics_resources_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_resources"
    ADD CONSTRAINT "analytics_resources_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_resources"
    ADD CONSTRAINT "analytics_resources_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_session_pages"
    ADD CONSTRAINT "analytics_session_pages_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_session_pages"
    ADD CONSTRAINT "analytics_session_pages_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_session_pages"
    ADD CONSTRAINT "analytics_session_pages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_viewer_pages"
    ADD CONSTRAINT "analytics_viewer_pages_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_viewer_pages"
    ADD CONSTRAINT "analytics_viewer_pages_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_viewer_pages"
    ADD CONSTRAINT "analytics_viewer_pages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."branding"
    ADD CONSTRAINT "branding_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_domains"
    ADD CONSTRAINT "custom_domains_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."data_room_documents"
    ADD CONSTRAINT "data_room_documents_data_room_id_fkey" FOREIGN KEY ("data_room_id") REFERENCES "public"."data_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."data_room_documents"
    ADD CONSTRAINT "data_room_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."data_rooms"
    ADD CONSTRAINT "data_rooms_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."data_rooms"
    ADD CONSTRAINT "data_rooms_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_data_room_id_fkey" FOREIGN KEY ("data_room_id") REFERENCES "public"."data_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_otps"
    ADD CONSTRAINT "email_otps_data_room_id_fkey" FOREIGN KEY ("data_room_id") REFERENCES "public"."data_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_otps"
    ADD CONSTRAINT "email_otps_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_otps"
    ADD CONSTRAINT "email_otps_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_data_room_id_fkey" FOREIGN KEY ("data_room_id") REFERENCES "public"."data_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_parent_folder_id_fkey" FOREIGN KEY ("parent_folder_id") REFERENCES "public"."folders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."link_allowed_emails"
    ADD CONSTRAINT "link_allowed_emails_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."link_allowed_emails"
    ADD CONSTRAINT "link_allowed_emails_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."link_allowed_emails"
    ADD CONSTRAINT "link_allowed_emails_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."links"
    ADD CONSTRAINT "links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."links"
    ADD CONSTRAINT "links_data_room_id_fkey" FOREIGN KEY ("data_room_id") REFERENCES "public"."data_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."links"
    ADD CONSTRAINT "links_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."links"
    ADD CONSTRAINT "links_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."links"
    ADD CONSTRAINT "links_nda_template_id_fkey" FOREIGN KEY ("nda_template_id") REFERENCES "public"."nda_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."links"
    ADD CONSTRAINT "links_watermark_id_fkey" FOREIGN KEY ("watermark_id") REFERENCES "public"."watermarks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."links"
    ADD CONSTRAINT "links_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nda_signatures"
    ADD CONSTRAINT "nda_signatures_data_room_id_fkey" FOREIGN KEY ("data_room_id") REFERENCES "public"."data_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nda_signatures"
    ADD CONSTRAINT "nda_signatures_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nda_signatures"
    ADD CONSTRAINT "nda_signatures_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."nda_signatures"
    ADD CONSTRAINT "nda_signatures_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nda_templates"
    ADD CONSTRAINT "nda_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."nda_templates"
    ADD CONSTRAINT "nda_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."qas"
    ADD CONSTRAINT "qas_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."qas"
    ADD CONSTRAINT "qas_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."watermarks"
    ADD CONSTRAINT "watermarks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_bandwidth_daily"
    ADD CONSTRAINT "workspace_bandwidth_daily_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_invites"
    ADD CONSTRAINT "workspace_invites_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workspace_invites"
    ADD CONSTRAINT "workspace_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workspace_invites"
    ADD CONSTRAINT "workspace_invites_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_storage_current"
    ADD CONSTRAINT "workspace_storage_current_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_storage_daily"
    ADD CONSTRAINT "workspace_storage_daily_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_subscriptions"
    ADD CONSTRAINT "workspace_subscriptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_active_custom_domain_id_fkey" FOREIGN KEY ("active_custom_domain_id") REFERENCES "public"."custom_domains"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE "public"."analytics_document_country_views" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "analytics_document_country_views_cud_service" ON "public"."analytics_document_country_views" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "analytics_document_country_views_select_members" ON "public"."analytics_document_country_views" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."analytics_document_pages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "analytics_document_pages_cud_service" ON "public"."analytics_document_pages" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "analytics_document_pages_select_members" ON "public"."analytics_document_pages" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."analytics_link_country_views" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "analytics_link_country_views_cud_service" ON "public"."analytics_link_country_views" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "analytics_link_country_views_select_members" ON "public"."analytics_link_country_views" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."analytics_media_sections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "analytics_media_sections_cud_service" ON "public"."analytics_media_sections" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "analytics_media_sections_select_members" ON "public"."analytics_media_sections" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."analytics_resource_viewers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "analytics_resource_viewers_cud_service" ON "public"."analytics_resource_viewers" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "analytics_resource_viewers_select_members" ON "public"."analytics_resource_viewers" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."analytics_resources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "analytics_resources_cud_service" ON "public"."analytics_resources" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "analytics_resources_select_members" ON "public"."analytics_resources" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."analytics_session_pages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "analytics_session_pages_cud_service" ON "public"."analytics_session_pages" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."analytics_viewer_pages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "analytics_viewer_pages_cud_service" ON "public"."analytics_viewer_pages" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "analytics_viewer_pages_select_members" ON "public"."analytics_viewer_pages" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "bandwidth_daily_manage_service" ON "public"."workspace_bandwidth_daily" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "bandwidth_daily_select_members" ON "public"."workspace_bandwidth_daily" FOR SELECT USING ((("auth"."role"() = 'service_role'::"text") OR "public"."is_workspace_member"("workspace_id")));



ALTER TABLE "public"."branding" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "branding_select" ON "public"."branding" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "branding_upsert_owner" ON "public"."branding" USING ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text"])) WITH CHECK ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text"]));



ALTER TABLE "public"."custom_domains" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "custom_domains_cud_owner" ON "public"."custom_domains" USING ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text"])) WITH CHECK ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text"]));



CREATE POLICY "custom_domains_select_members" ON "public"."custom_domains" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."data_room_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."data_rooms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "data_rooms_cud_editor" ON "public"."data_rooms" USING (("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'editor'::"text"]) AND "public"."workspace_has_entitlement"("workspace_id"))) WITH CHECK (("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'editor'::"text"]) AND "public"."workspace_has_entitlement"("workspace_id")));



CREATE POLICY "data_rooms_select" ON "public"."data_rooms" FOR SELECT USING (("public"."is_workspace_member"("workspace_id") AND "public"."workspace_has_entitlement"("workspace_id")));



ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "documents_cud_editor" ON "public"."documents" USING (("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'editor'::"text"]) AND "public"."workspace_has_entitlement"("workspace_id"))) WITH CHECK (("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'editor'::"text"]) AND "public"."workspace_has_entitlement"("workspace_id")));



CREATE POLICY "documents_select" ON "public"."documents" FOR SELECT USING (("public"."is_workspace_member"("workspace_id") AND "public"."workspace_has_entitlement"("workspace_id")));



CREATE POLICY "dr_docs_cud_editor" ON "public"."data_room_documents" USING ((EXISTS ( SELECT 1
   FROM "public"."data_rooms" "dr"
  WHERE (("dr"."id" = "data_room_documents"."data_room_id") AND "public"."has_workspace_role"("dr"."workspace_id", ARRAY['owner'::"text", 'editor'::"text"]) AND "public"."workspace_has_entitlement"("dr"."workspace_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."data_rooms" "dr"
  WHERE (("dr"."id" = "data_room_documents"."data_room_id") AND "public"."has_workspace_role"("dr"."workspace_id", ARRAY['owner'::"text", 'editor'::"text"]) AND "public"."workspace_has_entitlement"("dr"."workspace_id")))));



CREATE POLICY "dr_docs_select" ON "public"."data_room_documents" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."data_rooms" "dr"
  WHERE (("dr"."id" = "data_room_documents"."data_room_id") AND "public"."is_workspace_member"("dr"."workspace_id") AND "public"."workspace_has_entitlement"("dr"."workspace_id")))));



ALTER TABLE "public"."email_otps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "email_otps_service_role_only" ON "public"."email_otps" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feedback_insert_public_via_link" ON "public"."feedback" FOR INSERT WITH CHECK ((("link_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."links" "l"
  WHERE (("l"."id" = "feedback"."link_id") AND ("l"."document_id" = "feedback"."resource_id"))))));



CREATE POLICY "feedback_insert_service_role" ON "public"."feedback" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "feedback_select_members" ON "public"."feedback" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."folders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "folders_cud_editor" ON "public"."folders" USING (("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'editor'::"text"]) AND "public"."workspace_has_entitlement"("workspace_id"))) WITH CHECK (("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'editor'::"text"]) AND "public"."workspace_has_entitlement"("workspace_id")));



CREATE POLICY "folders_select" ON "public"."folders" FOR SELECT USING (("public"."is_workspace_member"("workspace_id") AND "public"."workspace_has_entitlement"("workspace_id")));



ALTER TABLE "public"."link_allowed_emails" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "link_allowed_emails_select_members" ON "public"."link_allowed_emails" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "link_allowed_emails_write_editors" ON "public"."link_allowed_emails" USING ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'editor'::"text"])) WITH CHECK ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'editor'::"text"]));



ALTER TABLE "public"."links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "links_cud_editor" ON "public"."links" USING (("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'editor'::"text"]) AND "public"."workspace_has_entitlement"("workspace_id"))) WITH CHECK (("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'editor'::"text"]) AND "public"."workspace_has_entitlement"("workspace_id")));



CREATE POLICY "links_select" ON "public"."links" FOR SELECT USING (("public"."is_workspace_member"("workspace_id") AND "public"."workspace_has_entitlement"("workspace_id")));



CREATE POLICY "members_delete_owner" ON "public"."workspace_members" FOR DELETE USING ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "me"
  WHERE (("me"."workspace_id" = "workspace_members"."workspace_id") AND ("me"."user_id" = "auth"."uid"()) AND ("me"."role" = 'owner'::"public"."user_role"))))));



CREATE POLICY "members_insert_owner" ON "public"."workspace_members" FOR INSERT WITH CHECK ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "me"
  WHERE (("me"."workspace_id" = "workspace_members"."workspace_id") AND ("me"."user_id" = "auth"."uid"()) AND ("me"."role" = 'owner'::"public"."user_role"))))));



CREATE POLICY "members_select_own" ON "public"."workspace_members" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "members_update_owner" ON "public"."workspace_members" FOR UPDATE USING ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "me"
  WHERE (("me"."workspace_id" = "workspace_members"."workspace_id") AND ("me"."user_id" = "auth"."uid"()) AND ("me"."role" = 'owner'::"public"."user_role")))))) WITH CHECK ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "me"
  WHERE (("me"."workspace_id" = "workspace_members"."workspace_id") AND ("me"."user_id" = "auth"."uid"()) AND ("me"."role" = 'owner'::"public"."user_role"))))));



ALTER TABLE "public"."nda_signatures" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nda_signatures_insert_service_role" ON "public"."nda_signatures" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "nda_signatures_select_members" ON "public"."nda_signatures" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."nda_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nda_templates_cud_owner" ON "public"."nda_templates" USING (("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text"]) AND "public"."workspace_has_entitlement"("workspace_id"))) WITH CHECK (("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text"]) AND "public"."workspace_has_entitlement"("workspace_id")));



CREATE POLICY "nda_templates_select" ON "public"."nda_templates" FOR SELECT USING (("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'editor'::"text"]) AND "public"."workspace_has_entitlement"("workspace_id")));



ALTER TABLE "public"."notification_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_settings_self_access" ON "public"."notification_settings" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_self_access" ON "public"."profiles" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."qas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "qas_insert_public_via_link" ON "public"."qas" FOR INSERT WITH CHECK ((("link_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."links" "l"
  WHERE (("l"."id" = "qas"."link_id") AND ("l"."document_id" = "qas"."resource_id"))))));



CREATE POLICY "qas_insert_service_role" ON "public"."qas" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "qas_select_members" ON "public"."qas" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "storage_current_select_members" ON "public"."workspace_storage_current" FOR SELECT USING ((("auth"."role"() = 'service_role'::"text") OR "public"."is_workspace_member"("workspace_id")));



CREATE POLICY "storage_daily_select_members" ON "public"."workspace_storage_daily" FOR SELECT USING ((("auth"."role"() = 'service_role'::"text") OR "public"."is_workspace_member"("workspace_id")));



ALTER TABLE "public"."watermarks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "watermarks_cud_contributor" ON "public"."watermarks" USING ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text", 'contributor'::"text"])) WITH CHECK ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text", 'admin'::"text", 'contributor'::"text"]));



CREATE POLICY "watermarks_select_members" ON "public"."watermarks" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



ALTER TABLE "public"."workspace_bandwidth_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspace_invites_manage_owner" ON "public"."workspace_invites" USING ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "me"
  WHERE (("me"."workspace_id" = "workspace_invites"."workspace_id") AND ("me"."user_id" = "auth"."uid"()) AND ("me"."role" = 'owner'::"public"."user_role")))))) WITH CHECK ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "me"
  WHERE (("me"."workspace_id" = "workspace_invites"."workspace_id") AND ("me"."user_id" = "auth"."uid"()) AND ("me"."role" = 'owner'::"public"."user_role"))))));



CREATE POLICY "workspace_invites_select_members" ON "public"."workspace_invites" FOR SELECT USING ((("auth"."role"() = 'service_role'::"text") OR "public"."is_workspace_member"("workspace_id")));



ALTER TABLE "public"."workspace_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_storage_current" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_storage_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspace_subscriptions_read" ON "public"."workspace_subscriptions" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "workspace_subscriptions_write_owner" ON "public"."workspace_subscriptions" USING ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text"])) WITH CHECK ("public"."has_workspace_role"("workspace_id", ARRAY['owner'::"text"]));



ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspaces_insert_self" ON "public"."workspaces" FOR INSERT WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "workspaces_select_members" ON "public"."workspaces" FOR SELECT USING (("public"."is_workspace_member"("id") OR ("created_by" = "auth"."uid"())));



CREATE POLICY "workspaces_update_owner" ON "public"."workspaces" FOR UPDATE USING ("public"."has_workspace_role"("id", ARRAY['owner'::"text"])) WITH CHECK ("public"."has_workspace_role"("id", ARRAY['owner'::"text"]));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."add_owner_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."add_owner_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_owner_membership"() TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_workspace_storage_delta"("p_workspace_id" "uuid", "p_delta" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."apply_workspace_storage_delta"("p_workspace_id" "uuid", "p_delta" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_workspace_storage_delta"("p_workspace_id" "uuid", "p_delta" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."auth_user_id_by_email"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auth_user_id_by_email"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."auth_user_id_by_email"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_user_id_by_email"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."before_insert_set_workspace_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."before_insert_set_workspace_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."before_insert_set_workspace_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notification_settings_for_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_notification_settings_for_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notification_settings_for_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_kpis"("p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_kpis"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_kpis"("p_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_link_country_views"("p_workspace_id" "uuid", "p_link_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_link_country_views"("p_workspace_id" "uuid", "p_link_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_link_country_views"("p_workspace_id" "uuid", "p_link_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_most_active_content"("p_workspace_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_most_active_content"("p_workspace_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_most_active_content"("p_workspace_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_top_viewers"("p_workspace_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_viewers"("p_workspace_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_viewers"("p_workspace_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_document_storage_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_document_storage_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_document_storage_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_workspace_role"("ws" "uuid", "roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."has_workspace_role"("ws" "uuid", "roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_workspace_role"("ws" "uuid", "roles" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_document_country_view"("p_workspace_id" "uuid", "p_country_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_document_country_view"("p_workspace_id" "uuid", "p_country_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_document_country_view"("p_workspace_id" "uuid", "p_country_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_link_country_view"("p_workspace_id" "uuid", "p_link_id" "uuid", "p_country_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_link_country_view"("p_workspace_id" "uuid", "p_link_id" "uuid", "p_country_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_link_country_view"("p_workspace_id" "uuid", "p_link_id" "uuid", "p_country_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_workspace_member"("ws" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("ws" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("ws" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_nda_template_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_nda_template_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_nda_template_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_public_analytics_event"("p_workspace_id" "uuid", "p_link_id" "uuid", "p_resource_type" "public"."resource_type", "p_resource_id" "uuid", "p_document_id" "uuid", "p_resource_category" "public"."analytics_resource_category", "p_viewer_key" "text", "p_viewer_email" "text", "p_anonymous_user_id" "text", "p_session_id" "text", "p_event" "public"."analytics_event_type", "p_page_number" integer, "p_duration_ms" bigint, "p_section_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."record_public_analytics_event"("p_workspace_id" "uuid", "p_link_id" "uuid", "p_resource_type" "public"."resource_type", "p_resource_id" "uuid", "p_document_id" "uuid", "p_resource_category" "public"."analytics_resource_category", "p_viewer_key" "text", "p_viewer_email" "text", "p_anonymous_user_id" "text", "p_session_id" "text", "p_event" "public"."analytics_event_type", "p_page_number" integer, "p_duration_ms" bigint, "p_section_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_public_analytics_event"("p_workspace_id" "uuid", "p_link_id" "uuid", "p_resource_type" "public"."resource_type", "p_resource_id" "uuid", "p_document_id" "uuid", "p_resource_category" "public"."analytics_resource_category", "p_viewer_key" "text", "p_viewer_email" "text", "p_anonymous_user_id" "text", "p_session_id" "text", "p_event" "public"."analytics_event_type", "p_page_number" integer, "p_duration_ms" bigint, "p_section_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."record_workspace_bandwidth"("p_workspace_id" "uuid", "p_bytes" bigint, "p_downloads" integer, "p_r2_class_a_ops" bigint, "p_r2_class_b_ops" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."record_workspace_bandwidth"("p_workspace_id" "uuid", "p_bytes" bigint, "p_downloads" integer, "p_r2_class_a_ops" bigint, "p_r2_class_b_ops" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_workspace_bandwidth"("p_workspace_id" "uuid", "p_bytes" bigint, "p_downloads" integer, "p_r2_class_a_ops" bigint, "p_r2_class_b_ops" bigint) TO "service_role";

GRANT ALL ON FUNCTION "public"."prune_workspace_bandwidth_daily"("p_keep_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."prune_workspace_bandwidth_daily"("p_keep_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."prune_workspace_bandwidth_daily"("p_keep_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_public_link"("document_id" "uuid", "link_id" "uuid", "email" "text", "password" "text", "accept_nda" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_public_link"("document_id" "uuid", "link_id" "uuid", "email" "text", "password" "text", "accept_nda" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_public_link"("document_id" "uuid", "link_id" "uuid", "email" "text", "password" "text", "accept_nda" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_workspace_for_ingest"("_link_id" "uuid", "_resource_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_workspace_for_ingest"("_link_id" "uuid", "_resource_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_workspace_for_ingest"("_link_id" "uuid", "_resource_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."snapshot_nda_template"() TO "anon";
GRANT ALL ON FUNCTION "public"."snapshot_nda_template"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."snapshot_nda_template"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_set_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_set_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_set_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."workspace_has_entitlement"("ws" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."workspace_has_entitlement"("ws" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."workspace_has_entitlement"("ws" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."workspace_name_available"("target_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."workspace_name_available"("target_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."workspace_name_available"("target_name" "text") TO "service_role";



GRANT ALL ON TABLE "public"."analytics_document_country_views" TO "anon";
GRANT ALL ON TABLE "public"."analytics_document_country_views" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_document_country_views" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_document_pages" TO "anon";
GRANT ALL ON TABLE "public"."analytics_document_pages" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_document_pages" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_link_country_views" TO "anon";
GRANT ALL ON TABLE "public"."analytics_link_country_views" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_link_country_views" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_media_sections" TO "anon";
GRANT ALL ON TABLE "public"."analytics_media_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_media_sections" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_resource_viewers" TO "anon";
GRANT ALL ON TABLE "public"."analytics_resource_viewers" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_resource_viewers" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_resources" TO "anon";
GRANT ALL ON TABLE "public"."analytics_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_resources" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_session_pages" TO "anon";
GRANT ALL ON TABLE "public"."analytics_session_pages" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_session_pages" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_viewer_pages" TO "anon";
GRANT ALL ON TABLE "public"."analytics_viewer_pages" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_viewer_pages" TO "service_role";



GRANT ALL ON TABLE "public"."branding" TO "anon";
GRANT ALL ON TABLE "public"."branding" TO "authenticated";
GRANT ALL ON TABLE "public"."branding" TO "service_role";



GRANT ALL ON TABLE "public"."custom_domains" TO "anon";
GRANT ALL ON TABLE "public"."custom_domains" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_domains" TO "service_role";



GRANT ALL ON TABLE "public"."data_room_documents" TO "anon";
GRANT ALL ON TABLE "public"."data_room_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."data_room_documents" TO "service_role";



GRANT ALL ON TABLE "public"."data_rooms" TO "anon";
GRANT ALL ON TABLE "public"."data_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."data_rooms" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."email_otps" TO "anon";
GRANT ALL ON TABLE "public"."email_otps" TO "authenticated";
GRANT ALL ON TABLE "public"."email_otps" TO "service_role";



GRANT ALL ON TABLE "public"."feedback" TO "anon";
GRANT ALL ON TABLE "public"."feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback" TO "service_role";



GRANT ALL ON TABLE "public"."folders" TO "anon";
GRANT ALL ON TABLE "public"."folders" TO "authenticated";
GRANT ALL ON TABLE "public"."folders" TO "service_role";



GRANT ALL ON TABLE "public"."link_allowed_emails" TO "anon";
GRANT ALL ON TABLE "public"."link_allowed_emails" TO "authenticated";
GRANT ALL ON TABLE "public"."link_allowed_emails" TO "service_role";



GRANT ALL ON TABLE "public"."links" TO "anon";
GRANT ALL ON TABLE "public"."links" TO "authenticated";
GRANT ALL ON TABLE "public"."links" TO "service_role";



GRANT ALL ON TABLE "public"."nda_signatures" TO "anon";
GRANT ALL ON TABLE "public"."nda_signatures" TO "authenticated";
GRANT ALL ON TABLE "public"."nda_signatures" TO "service_role";



GRANT ALL ON TABLE "public"."nda_templates" TO "anon";
GRANT ALL ON TABLE "public"."nda_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."nda_templates" TO "service_role";



GRANT ALL ON TABLE "public"."notification_settings" TO "anon";
GRANT ALL ON TABLE "public"."notification_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_settings" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."qas" TO "anon";
GRANT ALL ON TABLE "public"."qas" TO "authenticated";
GRANT ALL ON TABLE "public"."qas" TO "service_role";



GRANT ALL ON TABLE "public"."watermarks" TO "anon";
GRANT ALL ON TABLE "public"."watermarks" TO "authenticated";
GRANT ALL ON TABLE "public"."watermarks" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_bandwidth_daily" TO "anon";
GRANT ALL ON TABLE "public"."workspace_bandwidth_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_bandwidth_daily" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_invites" TO "anon";
GRANT ALL ON TABLE "public"."workspace_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_invites" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_members" TO "anon";
GRANT ALL ON TABLE "public"."workspace_members" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_members" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_storage_current" TO "anon";
GRANT ALL ON TABLE "public"."workspace_storage_current" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_storage_current" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_storage_daily" TO "anon";
GRANT ALL ON TABLE "public"."workspace_storage_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_storage_daily" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."workspace_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."workspaces" TO "anon";
GRANT ALL ON TABLE "public"."workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workspaces" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








-- -----------------------------------------------------------------------------
-- Supabase internal wiring (generated)
-- Buckets, storage policies, auth triggers
-- Generated at: 2026-01-21T13:04:22Z
-- -----------------------------------------------------------------------------

SET search_path = storage, public, auth;

-- Storage buckets
insert into storage.buckets (id, name, public) values ('branding-assets', 'branding-assets', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('converted-data-room', 'converted-data-room', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('converted-documents', 'converted-documents', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('data-room', 'data-room', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;

-- Storage RLS policies on storage.objects
drop policy if exists branding_assets_delete on storage.objects;
create policy branding_assets_delete on storage.objects for delete using (((bucket_id = 'branding-assets'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text])));
drop policy if exists branding_assets_read on storage.objects;
create policy branding_assets_read on storage.objects for select using (((bucket_id = 'branding-assets'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND is_workspace_member((split_part(name, '/'::text, 2))::uuid)));
drop policy if exists branding_assets_update on storage.objects;
create policy branding_assets_update on storage.objects for update using (((bucket_id = 'branding-assets'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text]))) with check (((bucket_id = 'branding-assets'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text])));
drop policy if exists branding_assets_write on storage.objects;
create policy branding_assets_write on storage.objects for insert with check (((bucket_id = 'branding-assets'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text])));
drop policy if exists ws_delete_converted_data_room on storage.objects;
create policy ws_delete_converted_data_room on storage.objects for delete using (((bucket_id = 'converted-data-room'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND (split_part(name, '/'::text, 3) = 'data-rooms'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text, 'editor'::text]) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid) AND (EXISTS ( SELECT 1
   FROM data_rooms dr
  WHERE ((dr.id = (split_part(objects.name, '/'::text, 4))::uuid) AND (dr.workspace_id = (split_part(objects.name, '/'::text, 2))::uuid))))));
drop policy if exists ws_delete_converted_docs on storage.objects;
create policy ws_delete_converted_docs on storage.objects for delete using (((bucket_id = 'converted-documents'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text, 'editor'::text]) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid)));
drop policy if exists ws_delete_data_room on storage.objects;
create policy ws_delete_data_room on storage.objects for delete using (((bucket_id = 'data-room'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND (split_part(name, '/'::text, 3) = 'data-rooms'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text, 'editor'::text]) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid) AND (EXISTS ( SELECT 1
   FROM data_rooms dr
  WHERE ((dr.id = (split_part(objects.name, '/'::text, 4))::uuid) AND (dr.workspace_id = (split_part(objects.name, '/'::text, 2))::uuid))))));
drop policy if exists ws_delete_documents on storage.objects;
create policy ws_delete_documents on storage.objects for delete using (((bucket_id = 'documents'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text, 'editor'::text]) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid)));
drop policy if exists ws_read_converted_data_room on storage.objects;
create policy ws_read_converted_data_room on storage.objects for select using (((bucket_id = 'converted-data-room'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND (split_part(name, '/'::text, 3) = 'data-rooms'::text) AND is_workspace_member((split_part(name, '/'::text, 2))::uuid) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid) AND (EXISTS ( SELECT 1
   FROM data_rooms dr
  WHERE ((dr.id = (split_part(objects.name, '/'::text, 4))::uuid) AND (dr.workspace_id = (split_part(objects.name, '/'::text, 2))::uuid))))));
drop policy if exists ws_read_converted_docs on storage.objects;
create policy ws_read_converted_docs on storage.objects for select using (((bucket_id = 'converted-documents'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND is_workspace_member((split_part(name, '/'::text, 2))::uuid) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid)));
drop policy if exists ws_read_data_room on storage.objects;
create policy ws_read_data_room on storage.objects for select using (((bucket_id = 'data-room'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND (split_part(name, '/'::text, 3) = 'data-rooms'::text) AND is_workspace_member((split_part(name, '/'::text, 2))::uuid) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid) AND (EXISTS ( SELECT 1
   FROM data_rooms dr
  WHERE ((dr.id = (split_part(objects.name, '/'::text, 4))::uuid) AND (dr.workspace_id = (split_part(objects.name, '/'::text, 2))::uuid))))));
drop policy if exists ws_read_documents on storage.objects;
create policy ws_read_documents on storage.objects for select using (((bucket_id = 'documents'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND is_workspace_member((split_part(name, '/'::text, 2))::uuid) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid)));
drop policy if exists ws_update_converted_data_room on storage.objects;
create policy ws_update_converted_data_room on storage.objects for update using (((bucket_id = 'converted-data-room'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND (split_part(name, '/'::text, 3) = 'data-rooms'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text, 'editor'::text]) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid) AND (EXISTS ( SELECT 1
   FROM data_rooms dr
  WHERE ((dr.id = (split_part(objects.name, '/'::text, 4))::uuid) AND (dr.workspace_id = (split_part(objects.name, '/'::text, 2))::uuid)))))) with check (((bucket_id = 'converted-data-room'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND (split_part(name, '/'::text, 3) = 'data-rooms'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text, 'editor'::text]) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid) AND (EXISTS ( SELECT 1
   FROM data_rooms dr
  WHERE ((dr.id = (split_part(objects.name, '/'::text, 4))::uuid) AND (dr.workspace_id = (split_part(objects.name, '/'::text, 2))::uuid))))));
drop policy if exists ws_update_converted_docs on storage.objects;
create policy ws_update_converted_docs on storage.objects for update using (((bucket_id = 'converted-documents'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text, 'editor'::text]) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid))) with check (((bucket_id = 'converted-documents'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text, 'editor'::text]) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid)));
drop policy if exists ws_update_data_room on storage.objects;
create policy ws_update_data_room on storage.objects for update using (((bucket_id = 'data-room'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND (split_part(name, '/'::text, 3) = 'data-rooms'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text, 'editor'::text]) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid) AND (EXISTS ( SELECT 1
   FROM data_rooms dr
  WHERE ((dr.id = (split_part(objects.name, '/'::text, 4))::uuid) AND (dr.workspace_id = (split_part(objects.name, '/'::text, 2))::uuid)))))) with check (((bucket_id = 'data-room'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND (split_part(name, '/'::text, 3) = 'data-rooms'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text, 'editor'::text]) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid) AND (EXISTS ( SELECT 1
   FROM data_rooms dr
  WHERE ((dr.id = (split_part(objects.name, '/'::text, 4))::uuid) AND (dr.workspace_id = (split_part(objects.name, '/'::text, 2))::uuid))))));
drop policy if exists ws_update_documents on storage.objects;
create policy ws_update_documents on storage.objects for update using (((bucket_id = 'documents'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text, 'editor'::text]) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid))) with check (((bucket_id = 'documents'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text, 'editor'::text]) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid)));
drop policy if exists ws_write_converted_data_room on storage.objects;
create policy ws_write_converted_data_room on storage.objects for insert with check (((bucket_id = 'converted-data-room'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND (split_part(name, '/'::text, 3) = 'data-rooms'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text, 'editor'::text]) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid) AND (EXISTS ( SELECT 1
   FROM data_rooms dr
  WHERE ((dr.id = (split_part(objects.name, '/'::text, 4))::uuid) AND (dr.workspace_id = (split_part(objects.name, '/'::text, 2))::uuid))))));
drop policy if exists ws_write_converted_docs on storage.objects;
create policy ws_write_converted_docs on storage.objects for insert with check (((bucket_id = 'converted-documents'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text, 'editor'::text]) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid)));
drop policy if exists ws_write_data_room on storage.objects;
create policy ws_write_data_room on storage.objects for insert with check (((bucket_id = 'data-room'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND (split_part(name, '/'::text, 3) = 'data-rooms'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text, 'editor'::text]) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid) AND (EXISTS ( SELECT 1
   FROM data_rooms dr
  WHERE ((dr.id = (split_part(objects.name, '/'::text, 4))::uuid) AND (dr.workspace_id = (split_part(objects.name, '/'::text, 2))::uuid))))));
drop policy if exists ws_write_documents on storage.objects;
create policy ws_write_documents on storage.objects for insert with check (((bucket_id = 'documents'::text) AND (split_part(name, '/'::text, 1) = 'workspaces'::text) AND has_workspace_role((split_part(name, '/'::text, 2))::uuid, ARRAY['owner'::text, 'editor'::text]) AND workspace_has_entitlement((split_part(name, '/'::text, 2))::uuid)));

-- Triggers on auth.users
drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

drop trigger if exists trg_on_auth_user_notifications on auth.users;
create trigger trg_on_auth_user_notifications
after insert on auth.users
for each row execute function public.create_notification_settings_for_new_user();
