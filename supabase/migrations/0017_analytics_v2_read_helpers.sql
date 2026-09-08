-- Analytics v2: additional read helpers for authenticated dashboards and data rooms.

create or replace function public.get_resource_link_metrics_v2(
  p_workspace_id uuid,
  p_resource_type public.resource_type,
  p_resource_id uuid,
  p_link_ids uuid[],
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
      and r.resource_type = p_resource_type
      and r.resource_id = p_resource_id
      and r.link_id = any(p_link_ids)
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
      and v.resource_type = p_resource_type
      and v.resource_id = p_resource_id
      and v.link_id = any(p_link_ids)
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

grant execute on function public.get_resource_link_metrics_v2(uuid, public.resource_type, uuid, uuid[], timestamptz, timestamptz) to authenticated;

create or replace function public.get_documents_metrics_v2(
  p_workspace_id uuid,
  p_document_ids uuid[],
  p_link_id uuid default null,
  p_from_ts timestamptz default null,
  p_to_ts timestamptz default null
) returns table(
  document_id uuid,
  total_views bigint,
  unique_viewers bigint,
  total_downloads bigint,
  total_revisits bigint,
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
  ),
  requested_docs as (
    select unnest(p_document_ids) as document_id
  ),
  totals as (
    select
      document_id,
      sum(total_views) as total_views,
      sum(total_downloads) as total_downloads,
      sum(total_time_ms) as total_time_ms,
      max(last_seen_at) as last_seen_at
    from public.analytics_v2_resources_daily r, bounds b
    where r.workspace_id = p_workspace_id
      and r.resource_type = 'document'::public.resource_type
      and r.document_id = any(p_document_ids)
      and (p_link_id is null or r.link_id = p_link_id)
      and r.day between b.from_day and b.to_day
    group by document_id
  ),
  unique_counts as (
    select
      document_id,
      count(distinct viewer_key) as unique_viewers
    from public.analytics_v2_resource_viewers_daily v, bounds b
    where v.workspace_id = p_workspace_id
      and v.resource_type = 'document'::public.resource_type
      and v.document_id = any(p_document_ids)
      and (p_link_id is null or v.link_id = p_link_id)
      and v.day between b.from_day and b.to_day
      and v.view_count > 0
    group by document_id
  )
  select
    d.document_id,
    coalesce(t.total_views, 0) as total_views,
    coalesce(u.unique_viewers, 0) as unique_viewers,
    coalesce(t.total_downloads, 0) as total_downloads,
    greatest(coalesce(t.total_views, 0) - coalesce(u.unique_viewers, 0), 0) as total_revisits,
    coalesce(t.total_time_ms, 0) as total_time_ms,
    t.last_seen_at
  from requested_docs d
  left join totals t on t.document_id = d.document_id
  left join unique_counts u on u.document_id = d.document_id
  where public.is_workspace_member(p_workspace_id);
$$;

grant execute on function public.get_documents_metrics_v2(uuid, uuid[], uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.get_documents_page_attention_v2(
  p_workspace_id uuid,
  p_document_ids uuid[],
  p_link_id uuid default null,
  p_from_ts timestamptz default null,
  p_to_ts timestamptz default null
) returns table(
  document_id uuid,
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
    p.document_id,
    p.page_number,
    sum(p.total_time_ms) as total_time_ms
  from public.analytics_v2_document_pages_daily p, bounds b
  where p.workspace_id = p_workspace_id
    and p.document_id = any(p_document_ids)
    and (p_link_id is null or p.link_id = p_link_id)
    and p.day between b.from_day and b.to_day
    and public.is_workspace_member(p_workspace_id)
  group by p.document_id, p.page_number
  order by p.document_id, p.page_number;
$$;

grant execute on function public.get_documents_page_attention_v2(uuid, uuid[], uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.get_documents_viewer_insights_v2(
  p_workspace_id uuid,
  p_document_ids uuid[],
  p_link_id uuid default null,
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
    and v.resource_type = 'document'::public.resource_type
    and v.document_id = any(p_document_ids)
    and (p_link_id is null or v.link_id = p_link_id)
    and v.day between b.from_day and b.to_day
    and v.viewer_email is not null
    and char_length(v.viewer_email) > 0
    and public.is_workspace_member(p_workspace_id)
  group by v.viewer_key, v.viewer_email, v.document_id, v.link_id, v.content_path
  order by max(v.last_seen_at) desc;
$$;

grant execute on function public.get_documents_viewer_insights_v2(uuid, uuid[], uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.get_documents_viewer_pages_v2(
  p_workspace_id uuid,
  p_document_ids uuid[],
  p_link_id uuid default null,
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
    and p.document_id = any(p_document_ids)
    and (p_link_id is null or p.link_id = p_link_id)
    and p.day between b.from_day and b.to_day
    and p.viewer_email is not null
    and char_length(p.viewer_email) > 0
    and public.is_workspace_member(p_workspace_id)
  group by p.viewer_key, p.document_id, p.page_number
  order by p.document_id, p.page_number;
$$;

grant execute on function public.get_documents_viewer_pages_v2(uuid, uuid[], uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.get_data_room_metrics_v2(
  p_workspace_id uuid,
  p_data_room_ids uuid[],
  p_from_ts timestamptz default null,
  p_to_ts timestamptz default null
) returns table(
  data_room_id uuid,
  total_views bigint,
  unique_views bigint,
  total_time_ms bigint,
  total_downloads bigint
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
  room_links as (
    select l.data_room_id, l.id as link_id
    from public.links l
    where l.workspace_id = p_workspace_id
      and l.data_room_id = any(p_data_room_ids)
  ),
  totals as (
    select
      rl.data_room_id,
      sum(r.total_views) as total_views,
      sum(r.total_downloads) as total_downloads,
      sum(r.total_time_ms) as total_time_ms
    from room_links rl
    join public.analytics_v2_resources_daily r
      on r.workspace_id = p_workspace_id
     and r.resource_type = 'document'::public.resource_type
     and r.link_id = rl.link_id
    join bounds b on true
    where r.day between b.from_day and b.to_day
    group by rl.data_room_id
  ),
  unique_room_viewers as (
    select distinct
      rl.data_room_id,
      v.viewer_key
    from room_links rl
    join public.analytics_v2_resource_viewers_daily v
      on v.workspace_id = p_workspace_id
     and v.resource_type = 'document'::public.resource_type
     and v.link_id = rl.link_id
    join bounds b on true
    where v.day between b.from_day and b.to_day
      and v.view_count > 0
  ),
  unique_totals as (
    select data_room_id, count(*) as unique_views
    from unique_room_viewers
    group by data_room_id
  ),
  requested_rooms as (
    select unnest(p_data_room_ids) as data_room_id
  )
  select
    rr.data_room_id,
    coalesce(t.total_views, 0) as total_views,
    coalesce(u.unique_views, 0) as unique_views,
    coalesce(t.total_time_ms, 0) as total_time_ms,
    coalesce(t.total_downloads, 0) as total_downloads
  from requested_rooms rr
  left join totals t on t.data_room_id = rr.data_room_id
  left join unique_totals u on u.data_room_id = rr.data_room_id
  where public.is_workspace_member(p_workspace_id);
$$;

grant execute on function public.get_data_room_metrics_v2(uuid, uuid[], timestamptz, timestamptz) to authenticated;

