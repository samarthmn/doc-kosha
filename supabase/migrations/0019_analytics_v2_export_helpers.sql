-- Analytics v2 export helpers: allow exports even when viewer email wasn't collected.

create or replace function public.get_document_viewer_insights_export_v2(
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
    coalesce(v.viewer_email, '') as viewer_email,
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
    and public.is_workspace_member(p_workspace_id)
  group by v.viewer_key, v.viewer_email, v.document_id, v.link_id, v.content_path
  order by max(v.last_seen_at) desc;
$$;

alter function public.get_document_viewer_insights_export_v2(
  uuid,
  uuid,
  uuid[],
  text[],
  timestamptz,
  timestamptz
) owner to postgres;

grant execute on function public.get_document_viewer_insights_export_v2(
  uuid,
  uuid,
  uuid[],
  text[],
  timestamptz,
  timestamptz
) to authenticated;
