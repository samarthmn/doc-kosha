-- Analytics v2: bot filtering support, 365-day retention, CSV export, version-by-version analytics
-- Notes:
-- - Legacy analytics_* tables remain (schema intact) but are purged and no longer written to.
-- - v2 stores daily rollups keyed by content_path (= storage_path of the viewed content).

-- 1) Purge legacy analytics immediately (decision lock: purge legacy)
truncate table public.analytics_session_pages;
truncate table public.analytics_viewer_pages;
truncate table public.analytics_document_pages;
truncate table public.analytics_media_sections;
truncate table public.analytics_resource_viewers;
truncate table public.analytics_resources;
truncate table public.analytics_link_country_views;
truncate table public.analytics_document_country_views;

-- 2) v2 tables

create table if not exists public.analytics_v2_viewer_state (
  workspace_id uuid not null,
  resource_type public.resource_type not null,
  resource_id uuid not null,
  link_id uuid not null,
  viewer_key text not null,
  viewer_email text null,
  anonymous_user_id text null,
  view_count bigint not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (workspace_id, resource_type, resource_id, link_id, viewer_key)
);

create index if not exists idx_analytics_v2_viewer_state_workspace_last_seen
  on public.analytics_v2_viewer_state(workspace_id, last_seen_at desc);

create table if not exists public.analytics_v2_resources_daily (
  workspace_id uuid not null,
  resource_type public.resource_type not null,
  resource_id uuid not null,
  link_id uuid not null,
  document_id uuid null,
  content_path text not null,
  day date not null,
  total_views bigint not null default 0,
  total_downloads bigint not null default 0,
  total_time_ms bigint not null default 0,
  total_page_views bigint not null default 0,
  first_viewed_at timestamptz null,
  last_seen_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, resource_type, resource_id, link_id, content_path, day)
);

create index if not exists idx_analytics_v2_resources_daily_workspace_resource_day
  on public.analytics_v2_resources_daily(workspace_id, resource_id, link_id, day desc);

create index if not exists idx_analytics_v2_resources_daily_workspace_document_day
  on public.analytics_v2_resources_daily(workspace_id, document_id, day desc)
  where document_id is not null;

create table if not exists public.analytics_v2_resource_viewers_daily (
  workspace_id uuid not null,
  resource_type public.resource_type not null,
  resource_id uuid not null,
  link_id uuid not null,
  document_id uuid null,
  content_path text not null,
  day date not null,
  viewer_key text not null,
  viewer_email text null,
  anonymous_user_id text null,
  view_count bigint not null default 0,
  download_count bigint not null default 0,
  total_time_ms bigint not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, resource_type, resource_id, link_id, content_path, day, viewer_key)
);

create index if not exists idx_analytics_v2_resource_viewers_daily_workspace_doc_day
  on public.analytics_v2_resource_viewers_daily(workspace_id, document_id, day desc)
  where document_id is not null;

create index if not exists idx_analytics_v2_resource_viewers_daily_workspace_email
  on public.analytics_v2_resource_viewers_daily(workspace_id, viewer_email)
  where viewer_email is not null;

create table if not exists public.analytics_v2_document_pages_daily (
  workspace_id uuid not null,
  document_id uuid not null,
  link_id uuid not null,
  content_path text not null,
  day date not null,
  page_number int not null check (page_number > 0),
  total_page_views bigint not null default 0,
  total_time_ms bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, document_id, link_id, content_path, day, page_number)
);

create index if not exists idx_analytics_v2_document_pages_daily_workspace_doc_day
  on public.analytics_v2_document_pages_daily(workspace_id, document_id, day desc);

create table if not exists public.analytics_v2_viewer_pages_daily (
  workspace_id uuid not null,
  document_id uuid not null,
  link_id uuid not null,
  content_path text not null,
  day date not null,
  viewer_key text not null,
  viewer_email text null,
  page_number int not null check (page_number > 0),
  view_count bigint not null default 0,
  total_time_ms bigint not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, document_id, link_id, content_path, day, viewer_key, page_number)
);

create index if not exists idx_analytics_v2_viewer_pages_daily_workspace_doc_day
  on public.analytics_v2_viewer_pages_daily(workspace_id, document_id, day desc);

create table if not exists public.analytics_v2_media_sections_daily (
  workspace_id uuid not null,
  document_id uuid not null,
  link_id uuid not null,
  content_path text not null,
  day date not null,
  section_offset int not null check (section_offset >= 0),
  total_time_ms bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, document_id, link_id, content_path, day, section_offset)
);

create index if not exists idx_analytics_v2_media_sections_daily_workspace_doc_day
  on public.analytics_v2_media_sections_daily(workspace_id, document_id, day desc);

create table if not exists public.analytics_v2_session_pages_daily (
  workspace_id uuid not null,
  document_id uuid not null,
  link_id uuid not null,
  content_path text not null,
  day date not null,
  session_id text not null check (char_length(session_id) > 0),
  page_number int not null check (page_number > 0),
  created_at timestamptz not null default now(),
  primary key (workspace_id, document_id, link_id, content_path, day, session_id, page_number)
);

create index if not exists idx_analytics_v2_session_pages_daily_workspace_doc_day
  on public.analytics_v2_session_pages_daily(workspace_id, document_id, day desc);

create table if not exists public.analytics_v2_link_country_daily (
  workspace_id uuid not null,
  link_id uuid not null,
  content_path text not null,
  day date not null,
  country_code text not null,
  total_views bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, link_id, content_path, day, country_code)
);

create index if not exists idx_analytics_v2_link_country_daily_workspace_link_day
  on public.analytics_v2_link_country_daily(workspace_id, link_id, day desc);

create table if not exists public.analytics_v2_document_country_daily (
  workspace_id uuid not null,
  document_id uuid not null,
  content_path text not null,
  day date not null,
  country_code text not null,
  total_views bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, document_id, content_path, day, country_code)
);

create index if not exists idx_analytics_v2_document_country_daily_workspace_doc_day
  on public.analytics_v2_document_country_daily(workspace_id, document_id, day desc);

-- 3) RLS + grants
alter table public.analytics_v2_viewer_state enable row level security;
alter table public.analytics_v2_resources_daily enable row level security;
alter table public.analytics_v2_resource_viewers_daily enable row level security;
alter table public.analytics_v2_document_pages_daily enable row level security;
alter table public.analytics_v2_viewer_pages_daily enable row level security;
alter table public.analytics_v2_media_sections_daily enable row level security;
alter table public.analytics_v2_session_pages_daily enable row level security;
alter table public.analytics_v2_link_country_daily enable row level security;
alter table public.analytics_v2_document_country_daily enable row level security;

grant all on table public.analytics_v2_viewer_state to postgres, service_role;
grant all on table public.analytics_v2_resources_daily to postgres, service_role;
grant all on table public.analytics_v2_resource_viewers_daily to postgres, service_role;
grant all on table public.analytics_v2_document_pages_daily to postgres, service_role;
grant all on table public.analytics_v2_viewer_pages_daily to postgres, service_role;
grant all on table public.analytics_v2_media_sections_daily to postgres, service_role;
grant all on table public.analytics_v2_session_pages_daily to postgres, service_role;
grant all on table public.analytics_v2_link_country_daily to postgres, service_role;
grant all on table public.analytics_v2_document_country_daily to postgres, service_role;

grant select on table public.analytics_v2_viewer_state to authenticated;
grant select on table public.analytics_v2_resources_daily to authenticated;
grant select on table public.analytics_v2_resource_viewers_daily to authenticated;
grant select on table public.analytics_v2_document_pages_daily to authenticated;
grant select on table public.analytics_v2_viewer_pages_daily to authenticated;
grant select on table public.analytics_v2_media_sections_daily to authenticated;
grant select on table public.analytics_v2_session_pages_daily to authenticated;
grant select on table public.analytics_v2_link_country_daily to authenticated;
grant select on table public.analytics_v2_document_country_daily to authenticated;

drop policy if exists analytics_v2_viewer_state_select_members on public.analytics_v2_viewer_state;
create policy analytics_v2_viewer_state_select_members
on public.analytics_v2_viewer_state
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists analytics_v2_viewer_state_cud_service on public.analytics_v2_viewer_state;
create policy analytics_v2_viewer_state_cud_service
on public.analytics_v2_viewer_state
for all
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));

drop policy if exists analytics_v2_resources_daily_select_members on public.analytics_v2_resources_daily;
create policy analytics_v2_resources_daily_select_members
on public.analytics_v2_resources_daily
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists analytics_v2_resources_daily_cud_service on public.analytics_v2_resources_daily;
create policy analytics_v2_resources_daily_cud_service
on public.analytics_v2_resources_daily
for all
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));

drop policy if exists analytics_v2_resource_viewers_daily_select_members on public.analytics_v2_resource_viewers_daily;
create policy analytics_v2_resource_viewers_daily_select_members
on public.analytics_v2_resource_viewers_daily
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists analytics_v2_resource_viewers_daily_cud_service on public.analytics_v2_resource_viewers_daily;
create policy analytics_v2_resource_viewers_daily_cud_service
on public.analytics_v2_resource_viewers_daily
for all
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));

drop policy if exists analytics_v2_document_pages_daily_select_members on public.analytics_v2_document_pages_daily;
create policy analytics_v2_document_pages_daily_select_members
on public.analytics_v2_document_pages_daily
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists analytics_v2_document_pages_daily_cud_service on public.analytics_v2_document_pages_daily;
create policy analytics_v2_document_pages_daily_cud_service
on public.analytics_v2_document_pages_daily
for all
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));

drop policy if exists analytics_v2_viewer_pages_daily_select_members on public.analytics_v2_viewer_pages_daily;
create policy analytics_v2_viewer_pages_daily_select_members
on public.analytics_v2_viewer_pages_daily
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists analytics_v2_viewer_pages_daily_cud_service on public.analytics_v2_viewer_pages_daily;
create policy analytics_v2_viewer_pages_daily_cud_service
on public.analytics_v2_viewer_pages_daily
for all
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));

drop policy if exists analytics_v2_media_sections_daily_select_members on public.analytics_v2_media_sections_daily;
create policy analytics_v2_media_sections_daily_select_members
on public.analytics_v2_media_sections_daily
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists analytics_v2_media_sections_daily_cud_service on public.analytics_v2_media_sections_daily;
create policy analytics_v2_media_sections_daily_cud_service
on public.analytics_v2_media_sections_daily
for all
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));

drop policy if exists analytics_v2_session_pages_daily_select_members on public.analytics_v2_session_pages_daily;
create policy analytics_v2_session_pages_daily_select_members
on public.analytics_v2_session_pages_daily
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists analytics_v2_session_pages_daily_cud_service on public.analytics_v2_session_pages_daily;
create policy analytics_v2_session_pages_daily_cud_service
on public.analytics_v2_session_pages_daily
for all
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));

drop policy if exists analytics_v2_link_country_daily_select_members on public.analytics_v2_link_country_daily;
create policy analytics_v2_link_country_daily_select_members
on public.analytics_v2_link_country_daily
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists analytics_v2_link_country_daily_cud_service on public.analytics_v2_link_country_daily;
create policy analytics_v2_link_country_daily_cud_service
on public.analytics_v2_link_country_daily
for all
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));

drop policy if exists analytics_v2_document_country_daily_select_members on public.analytics_v2_document_country_daily;
create policy analytics_v2_document_country_daily_select_members
on public.analytics_v2_document_country_daily
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists analytics_v2_document_country_daily_cud_service on public.analytics_v2_document_country_daily;
create policy analytics_v2_document_country_daily_cud_service
on public.analytics_v2_document_country_daily
for all
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));

-- 4) Event recording RPC (single write path)
create or replace function public.record_public_analytics_event_v2(
  p_workspace_id uuid,
  p_link_id uuid,
  p_resource_type public.resource_type,
  p_resource_id uuid,
  p_document_id uuid,
  p_viewer_key text,
  p_viewer_email text,
  p_anonymous_user_id text,
  p_session_id text,
  p_event public.analytics_event_type,
  p_page_number int,
  p_duration_ms bigint,
  p_section_offset int,
  p_content_path text,
  p_country_code text default null
) returns table(is_unique_view boolean, is_revisit boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_day date := (v_now at time zone 'utc')::date;
  v_view_increment int := case when p_event = 'view' then 1 else 0 end;
  v_download_increment int := case when p_event = 'download' then 1 else 0 end;
  v_time_increment bigint := case
    when p_event in ('page_view','section_time') then greatest(coalesce(p_duration_ms, 0), 0)
    else 0
  end;
  v_page_increment int := 0;
  v_session_page_row_count int := 0;
  v_is_new_session_page boolean := false;
  v_existing_views bigint := 0;
  v_is_unique boolean := false;
  v_is_revisit boolean := false;
  v_norm_viewer_email text := nullif(trim(coalesce(p_viewer_email, '')), '');
  v_norm_anon_id text := nullif(trim(coalesce(p_anonymous_user_id, '')), '');
  v_norm_session_id text := nullif(trim(coalesce(p_session_id, '')), '');
  v_norm_country text := nullif(trim(coalesce(p_country_code, '')), '');
begin
  if p_workspace_id is null then
    raise exception 'workspace_id is required';
  end if;
  if p_link_id is null then
    raise exception 'link_id is required';
  end if;
  if nullif(trim(coalesce(p_viewer_key, '')), '') is null then
    raise exception 'viewer_key is required';
  end if;
  if p_resource_id is null then
    raise exception 'resource_id is required';
  end if;

  -- For document-scoped analytics, content_path is required.
  if p_resource_type <> 'data_room'::public.resource_type
     and nullif(trim(coalesce(p_content_path, '')), '') is null then
    raise exception 'content_path is required for document analytics';
  end if;
  if p_resource_type <> 'data_room'::public.resource_type
     and p_document_id is null then
    raise exception 'document_id is required for document analytics';
  end if;

  -- Page view counters should be based on unique (day × session_id × page_number)
  -- per link/document/content_path. If session_id is missing, fall back to legacy
  -- behavior (increment per event) for backward compatibility.
  if p_event = 'page_view'
     and p_document_id is not null
     and p_page_number is not null
     and p_page_number > 0 then
    if v_norm_session_id is null then
      v_is_new_session_page := true;
    else
      insert into public.analytics_v2_session_pages_daily (
        workspace_id,
        document_id,
        link_id,
        content_path,
        day,
        session_id,
        page_number,
        created_at
      )
      values (
        p_workspace_id,
        p_document_id,
        p_link_id,
        p_content_path,
        v_day,
        v_norm_session_id,
        p_page_number,
        v_now
      )
      on conflict do nothing;

      get diagnostics v_session_page_row_count = row_count;
      v_is_new_session_page := (v_session_page_row_count > 0);
    end if;
  end if;

  v_page_increment := case
    when p_event = 'page_view' and v_is_new_session_page then 1
    else 0
  end;

  -- Viewer state for is_unique / is_revisit semantics (within retention window).
  -- Use an atomic upsert so concurrent transactions can't double-insert.
  insert into public.analytics_v2_viewer_state (
    workspace_id,
    resource_type,
    resource_id,
    link_id,
    viewer_key,
    viewer_email,
    anonymous_user_id,
    view_count,
    first_seen_at,
    last_seen_at
  )
  values (
    p_workspace_id,
    p_resource_type,
    p_resource_id,
    p_link_id,
    p_viewer_key,
    v_norm_viewer_email,
    v_norm_anon_id,
    v_view_increment,
    v_now,
    v_now
  )
  on conflict (workspace_id, resource_type, resource_id, link_id, viewer_key) do update
  set view_count = public.analytics_v2_viewer_state.view_count + v_view_increment,
      viewer_email = coalesce(v_norm_viewer_email, public.analytics_v2_viewer_state.viewer_email),
      anonymous_user_id = coalesce(v_norm_anon_id, public.analytics_v2_viewer_state.anonymous_user_id),
      last_seen_at = v_now
  returning (view_count - v_view_increment)::bigint into v_existing_views;

  v_is_unique := (p_event = 'view' and coalesce(v_existing_views, 0) = 0);
  v_is_revisit := (p_event = 'view' and coalesce(v_existing_views, 0) > 0);

  -- Daily resource totals.
  insert into public.analytics_v2_resources_daily (
    workspace_id,
    resource_type,
    resource_id,
    link_id,
    document_id,
    content_path,
    day,
    total_views,
    total_downloads,
    total_time_ms,
    total_page_views,
    first_viewed_at,
    last_seen_at,
    created_at,
    updated_at
  )
  values (
    p_workspace_id,
    p_resource_type,
    p_resource_id,
    p_link_id,
    p_document_id,
    coalesce(p_content_path, ''),
    v_day,
    v_view_increment,
    v_download_increment,
    v_time_increment,
    v_page_increment,
    case when v_view_increment > 0 then v_now else null end,
    v_now,
    v_now,
    v_now
  )
  on conflict (workspace_id, resource_type, resource_id, link_id, content_path, day) do update
  set total_views = public.analytics_v2_resources_daily.total_views + v_view_increment,
      total_downloads = public.analytics_v2_resources_daily.total_downloads + v_download_increment,
      total_time_ms = public.analytics_v2_resources_daily.total_time_ms + v_time_increment,
      total_page_views = public.analytics_v2_resources_daily.total_page_views + v_page_increment,
      first_viewed_at = coalesce(
        public.analytics_v2_resources_daily.first_viewed_at,
        case when v_view_increment > 0 then v_now else null end
      ),
      last_seen_at = greatest(coalesce(public.analytics_v2_resources_daily.last_seen_at, v_now), v_now),
      updated_at = v_now;

  -- Daily viewer totals (email-only rows have viewer_email populated).
  insert into public.analytics_v2_resource_viewers_daily (
    workspace_id,
    resource_type,
    resource_id,
    link_id,
    document_id,
    content_path,
    day,
    viewer_key,
    viewer_email,
    anonymous_user_id,
    view_count,
    download_count,
    total_time_ms,
    last_seen_at,
    created_at,
    updated_at
  )
  values (
    p_workspace_id,
    p_resource_type,
    p_resource_id,
    p_link_id,
    p_document_id,
    coalesce(p_content_path, ''),
    v_day,
    p_viewer_key,
    v_norm_viewer_email,
    v_norm_anon_id,
    v_view_increment,
    v_download_increment,
    v_time_increment,
    v_now,
    v_now,
    v_now
  )
  on conflict (workspace_id, resource_type, resource_id, link_id, content_path, day, viewer_key) do update
  set viewer_email = coalesce(v_norm_viewer_email, public.analytics_v2_resource_viewers_daily.viewer_email),
      anonymous_user_id = coalesce(v_norm_anon_id, public.analytics_v2_resource_viewers_daily.anonymous_user_id),
      view_count = public.analytics_v2_resource_viewers_daily.view_count + v_view_increment,
      download_count = public.analytics_v2_resource_viewers_daily.download_count + v_download_increment,
      total_time_ms = public.analytics_v2_resource_viewers_daily.total_time_ms + v_time_increment,
      last_seen_at = greatest(public.analytics_v2_resource_viewers_daily.last_seen_at, v_now),
      updated_at = v_now;

  if p_event = 'page_view'
     and p_document_id is not null
     and p_page_number is not null
     and p_page_number > 0 then
    insert into public.analytics_v2_viewer_pages_daily (
      workspace_id,
      document_id,
      link_id,
      content_path,
      day,
      viewer_key,
      viewer_email,
      page_number,
      view_count,
      total_time_ms,
      last_seen_at,
      created_at,
      updated_at
    )
    values (
      p_workspace_id,
      p_document_id,
      p_link_id,
      p_content_path,
      v_day,
      p_viewer_key,
      v_norm_viewer_email,
      p_page_number,
      v_page_increment,
      v_time_increment,
      v_now,
      v_now,
      v_now
    )
    on conflict (workspace_id, document_id, link_id, content_path, day, viewer_key, page_number) do update
    set viewer_email = coalesce(v_norm_viewer_email, public.analytics_v2_viewer_pages_daily.viewer_email),
        view_count = public.analytics_v2_viewer_pages_daily.view_count + v_page_increment,
        total_time_ms = public.analytics_v2_viewer_pages_daily.total_time_ms + v_time_increment,
        last_seen_at = greatest(public.analytics_v2_viewer_pages_daily.last_seen_at, v_now),
        updated_at = v_now;

    insert into public.analytics_v2_document_pages_daily (
      workspace_id,
      document_id,
      link_id,
      content_path,
      day,
      page_number,
      total_page_views,
      total_time_ms,
      created_at,
      updated_at
    )
    values (
      p_workspace_id,
      p_document_id,
      p_link_id,
      p_content_path,
      v_day,
      p_page_number,
      v_page_increment,
      v_time_increment,
      v_now,
      v_now
    )
    on conflict (workspace_id, document_id, link_id, content_path, day, page_number) do update
    set total_page_views = public.analytics_v2_document_pages_daily.total_page_views + v_page_increment,
        total_time_ms = public.analytics_v2_document_pages_daily.total_time_ms + v_time_increment,
        updated_at = v_now;
  end if;

  if p_event = 'section_time'
     and p_document_id is not null
     and p_section_offset is not null
     and p_section_offset >= 0 then
    insert into public.analytics_v2_media_sections_daily (
      workspace_id,
      document_id,
      link_id,
      content_path,
      day,
      section_offset,
      total_time_ms,
      created_at,
      updated_at
    )
    values (
      p_workspace_id,
      p_document_id,
      p_link_id,
      p_content_path,
      v_day,
      p_section_offset,
      v_time_increment,
      v_now,
      v_now
    )
    on conflict (workspace_id, document_id, link_id, content_path, day, section_offset) do update
    set total_time_ms = public.analytics_v2_media_sections_daily.total_time_ms + v_time_increment,
        updated_at = v_now;
  end if;

  if v_norm_country is not null and p_event = 'view' then
    if p_document_id is not null and nullif(trim(coalesce(p_content_path, '')), '') is not null then
      insert into public.analytics_v2_document_country_daily (
        workspace_id,
        document_id,
        content_path,
        day,
        country_code,
        total_views,
        updated_at
      )
      values (
        p_workspace_id,
        p_document_id,
        p_content_path,
        v_day,
        upper(v_norm_country),
        1,
        v_now
      )
      on conflict (workspace_id, document_id, content_path, day, country_code) do update
      set total_views = public.analytics_v2_document_country_daily.total_views + 1,
          updated_at = v_now;
    end if;

    insert into public.analytics_v2_link_country_daily (
      workspace_id,
      link_id,
      content_path,
      day,
      country_code,
      total_views,
      updated_at
    )
    values (
      p_workspace_id,
      p_link_id,
      coalesce(p_content_path, ''),
      v_day,
      upper(v_norm_country),
      1,
      v_now
    )
    on conflict (workspace_id, link_id, content_path, day, country_code) do update
    set total_views = public.analytics_v2_link_country_daily.total_views + 1,
        updated_at = v_now;
  end if;

  return query select v_is_unique, v_is_revisit;
end;
$$;

alter function public.record_public_analytics_event_v2(
  uuid, uuid, public.resource_type, uuid, uuid, text, text, text, text,
  public.analytics_event_type, int, bigint, int, text, text
) owner to postgres;

grant all on function public.record_public_analytics_event_v2(
  uuid, uuid, public.resource_type, uuid, uuid, text, text, text, text,
  public.analytics_event_type, int, bigint, int, text, text
) to anon, authenticated, service_role;

-- 5) Retention pruning + best-effort scheduling (03:00 UTC daily)
create or replace function public.prune_public_analytics_v2(p_keep_days int default 365)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_total int := 0;
  deleted_count int := 0;
  min_keep_days int := 1;
  v_keep_days int := greatest(coalesce(p_keep_days, 365), min_keep_days);
  cutoff_day date := (current_date - v_keep_days);
  cutoff_ts timestamptz := (now() - make_interval(days => v_keep_days));
begin
  delete from public.analytics_v2_resources_daily where day < cutoff_day;
  get diagnostics deleted_count = row_count; deleted_total := deleted_total + deleted_count;

  delete from public.analytics_v2_resource_viewers_daily where day < cutoff_day;
  get diagnostics deleted_count = row_count; deleted_total := deleted_total + deleted_count;

  delete from public.analytics_v2_document_pages_daily where day < cutoff_day;
  get diagnostics deleted_count = row_count; deleted_total := deleted_total + deleted_count;

  delete from public.analytics_v2_viewer_pages_daily where day < cutoff_day;
  get diagnostics deleted_count = row_count; deleted_total := deleted_total + deleted_count;

  delete from public.analytics_v2_media_sections_daily where day < cutoff_day;
  get diagnostics deleted_count = row_count; deleted_total := deleted_total + deleted_count;

  delete from public.analytics_v2_session_pages_daily where day < cutoff_day;
  get diagnostics deleted_count = row_count; deleted_total := deleted_total + deleted_count;

  delete from public.analytics_v2_link_country_daily where day < cutoff_day;
  get diagnostics deleted_count = row_count; deleted_total := deleted_total + deleted_count;

  delete from public.analytics_v2_document_country_daily where day < cutoff_day;
  get diagnostics deleted_count = row_count; deleted_total := deleted_total + deleted_count;

  delete from public.analytics_v2_viewer_state where last_seen_at < cutoff_ts;
  get diagnostics deleted_count = row_count; deleted_total := deleted_total + deleted_count;

  return deleted_total;
end;
$$;

alter function public.prune_public_analytics_v2(int) owner to postgres;
grant all on function public.prune_public_analytics_v2(int) to service_role;

-- Best-effort schedule via pg_cron if available. Migration must not fail if pg_cron isn't installed.
do $$
declare
  v_has_cron boolean := false;
  v_job_id int;
begin
  select exists(select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  if not v_has_cron then
    return;
  end if;

  -- Unschedule any prior job with the same name (ignore if missing).
  begin
    select jobid into v_job_id from cron.job where jobname = 'prune_public_analytics_v2_daily' limit 1;
    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;
  exception when undefined_table or invalid_schema_name then
    -- cron schema not available in this environment
    return;
  end;

  -- Schedule at 03:00 UTC daily.
  perform cron.schedule(
    'prune_public_analytics_v2_daily',
    '0 3 * * *',
    $dkcron$select public.prune_public_analytics_v2(365)$dkcron$
  );
exception when others then
  -- Fail open: if scheduling isn't supported here, retention can be invoked externally.
  return;
end $$;

-- 6) Read RPCs (UI + CSV export)

create or replace function public.get_document_link_metrics_v2(
  p_workspace_id uuid,
  p_document_id uuid,
  p_link_ids uuid[],
  p_content_paths text[] default null,
  p_from_ts timestamptz default null,
  p_to_ts timestamptz default null
) returns table(
  link_id uuid,
  total_views bigint,
  unique_viewers bigint,
  total_downloads bigint,
  total_revisits bigint,
  total_time_ms bigint,
  total_page_views bigint,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      coalesce((p_from_ts at time zone 'utc')::date, date '1970-01-01') as from_day,
      coalesce((p_to_ts at time zone 'utc')::date, current_date) as to_day
  ),
  requested_links as (
    select unnest(p_link_ids) as link_id
  ),
  filtered_resources as (
    select r.*
    from public.analytics_v2_resources_daily r, bounds b
    where r.workspace_id = p_workspace_id
      and r.document_id = p_document_id
      and r.link_id = any(p_link_ids)
      and (p_content_paths is null or r.content_path = any(p_content_paths))
      and r.day between b.from_day and b.to_day
  ),
  totals as (
    select
      link_id,
      sum(total_views) as total_views,
      sum(total_downloads) as total_downloads,
      sum(total_time_ms) as total_time_ms,
      sum(total_page_views) as total_page_views,
      max(last_seen_at) as last_seen_at
    from filtered_resources
    group by link_id
  ),
  unique_counts as (
    select
      link_id,
      count(distinct viewer_key) as unique_viewers
    from public.analytics_v2_resource_viewers_daily v, bounds b
    where v.workspace_id = p_workspace_id
      and v.document_id = p_document_id
      and v.link_id = any(p_link_ids)
      and (p_content_paths is null or v.content_path = any(p_content_paths))
      and v.day between b.from_day and b.to_day
      and v.view_count > 0
    group by link_id
  )
  select
    l.link_id,
    coalesce(t.total_views, 0) as total_views,
    coalesce(u.unique_viewers, 0) as unique_viewers,
    coalesce(t.total_downloads, 0) as total_downloads,
    greatest(coalesce(t.total_views, 0) - coalesce(u.unique_viewers, 0), 0) as total_revisits,
    coalesce(t.total_time_ms, 0) as total_time_ms,
    coalesce(t.total_page_views, 0) as total_page_views,
    t.last_seen_at
  from requested_links l
  left join totals t on t.link_id = l.link_id
  left join unique_counts u on u.link_id = l.link_id
  where public.is_workspace_member(p_workspace_id);
$$;

create or replace function public.get_document_page_attention_v2(
  p_workspace_id uuid,
  p_document_id uuid,
  p_link_ids uuid[],
  p_content_paths text[] default null,
  p_from_ts timestamptz default null,
  p_to_ts timestamptz default null
) returns table(
  page_number int,
  total_time_ms bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      coalesce((p_from_ts at time zone 'utc')::date, date '1970-01-01') as from_day,
      coalesce((p_to_ts at time zone 'utc')::date, current_date) as to_day
  )
  select
    p.page_number,
    sum(p.total_time_ms) as total_time_ms
  from public.analytics_v2_document_pages_daily p, bounds b
  where p.workspace_id = p_workspace_id
    and p.document_id = p_document_id
    and p.link_id = any(p_link_ids)
    and (p_content_paths is null or p.content_path = any(p_content_paths))
    and p.day between b.from_day and b.to_day
    and public.is_workspace_member(p_workspace_id)
  group by p.page_number
  order by p.page_number asc;
$$;

create or replace function public.get_document_viewer_insights_v2(
  p_workspace_id uuid,
  p_document_id uuid,
  p_link_ids uuid[],
  p_content_paths text[] default null,
  p_from_ts timestamptz default null,
  p_to_ts timestamptz default null
) returns table(
  viewer_key text,
  viewer_email text,
  document_id uuid,
  link_id uuid,
  content_path text,
  view_count bigint,
  download_count bigint,
  total_time_ms bigint,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      coalesce((p_from_ts at time zone 'utc')::date, date '1970-01-01') as from_day,
      coalesce((p_to_ts at time zone 'utc')::date, current_date) as to_day
  )
  select
    v.viewer_key,
    v.viewer_email,
    v.document_id,
    v.link_id,
    v.content_path,
    sum(v.view_count) as view_count,
    sum(v.download_count) as download_count,
    sum(v.total_time_ms) as total_time_ms,
    max(v.last_seen_at) as last_seen_at
  from public.analytics_v2_resource_viewers_daily v, bounds b
  where v.workspace_id = p_workspace_id
    and v.document_id = p_document_id
    and v.link_id = any(p_link_ids)
    and (p_content_paths is null or v.content_path = any(p_content_paths))
    and v.day between b.from_day and b.to_day
    and v.viewer_email is not null
    and char_length(v.viewer_email) > 0
    and public.is_workspace_member(p_workspace_id)
  group by v.viewer_key, v.viewer_email, v.document_id, v.link_id, v.content_path
  order by max(v.last_seen_at) desc;
$$;

create or replace function public.get_document_viewer_pages_v2(
  p_workspace_id uuid,
  p_document_id uuid,
  p_link_ids uuid[],
  p_content_paths text[] default null,
  p_from_ts timestamptz default null,
  p_to_ts timestamptz default null
) returns table(
  viewer_key text,
  document_id uuid,
  page_number int,
  total_time_ms bigint,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      coalesce((p_from_ts at time zone 'utc')::date, date '1970-01-01') as from_day,
      coalesce((p_to_ts at time zone 'utc')::date, current_date) as to_day
  )
  select
    p.viewer_key,
    p.document_id,
    p.page_number,
    sum(p.total_time_ms) as total_time_ms,
    max(p.last_seen_at) as last_seen_at
  from public.analytics_v2_viewer_pages_daily p, bounds b
  where p.workspace_id = p_workspace_id
    and p.document_id = p_document_id
    and p.link_id = any(p_link_ids)
    and (p_content_paths is null or p.content_path = any(p_content_paths))
    and p.day between b.from_day and b.to_day
    and p.viewer_email is not null
    and char_length(p.viewer_email) > 0
    and public.is_workspace_member(p_workspace_id)
  group by p.viewer_key, p.document_id, p.page_number
  order by p.page_number asc;
$$;

create or replace function public.get_link_country_views_v2(
  p_workspace_id uuid,
  p_link_ids uuid[],
  p_content_paths text[] default null,
  p_from_ts timestamptz default null,
  p_to_ts timestamptz default null
) returns table(
  country_code text,
  total_views bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      coalesce((p_from_ts at time zone 'utc')::date, date '1970-01-01') as from_day,
      coalesce((p_to_ts at time zone 'utc')::date, current_date) as to_day
  )
  select
    c.country_code,
    sum(c.total_views) as total_views
  from public.analytics_v2_link_country_daily c, bounds b
  where c.workspace_id = p_workspace_id
    and c.link_id = any(p_link_ids)
    and (p_content_paths is null or c.content_path = any(p_content_paths))
    and c.day between b.from_day and b.to_day
    and public.is_workspace_member(p_workspace_id)
  group by c.country_code
  order by sum(c.total_views) desc;
$$;

grant execute on function public.get_document_link_metrics_v2(uuid, uuid, uuid[], text[], timestamptz, timestamptz) to authenticated;
grant execute on function public.get_document_page_attention_v2(uuid, uuid, uuid[], text[], timestamptz, timestamptz) to authenticated;
grant execute on function public.get_document_viewer_insights_v2(uuid, uuid, uuid[], text[], timestamptz, timestamptz) to authenticated;
grant execute on function public.get_document_viewer_pages_v2(uuid, uuid, uuid[], text[], timestamptz, timestamptz) to authenticated;
grant execute on function public.get_link_country_views_v2(uuid, uuid[], text[], timestamptz, timestamptz) to authenticated;
