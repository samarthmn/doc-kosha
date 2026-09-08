-- Analytics v2: dashboard helpers (workspace-level rollups via RPCs).

create or replace function public.get_workspace_kpis_v2(
  p_workspace_id uuid,
  p_from_ts timestamptz default null,
  p_to_ts timestamptz default null
) returns table(
  total_views bigint,
  unique_viewers bigint,
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
  totals as (
    select
      sum(r.total_views) as total_views,
      sum(r.total_downloads) as total_downloads
    from public.analytics_v2_resources_daily r, bounds b
    where r.workspace_id = p_workspace_id
      and r.resource_type = 'document'::public.resource_type
      and r.day between b.from_day and b.to_day
  ),
  uniques as (
    select count(distinct v.viewer_key) as unique_viewers
    from public.analytics_v2_resource_viewers_daily v, bounds b
    where v.workspace_id = p_workspace_id
      and v.resource_type = 'document'::public.resource_type
      and v.day between b.from_day and b.to_day
      and v.view_count > 0
  )
  select
    coalesce(t.total_views, 0) as total_views,
    coalesce(u.unique_viewers, 0) as unique_viewers,
    coalesce(t.total_downloads, 0) as total_downloads
  from totals t cross join uniques u
  where public.is_workspace_member(p_workspace_id);
$$;

grant execute on function public.get_workspace_kpis_v2(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.get_workspace_most_active_documents_v2(
  p_workspace_id uuid,
  p_limit int default 5,
  p_from_ts timestamptz default null,
  p_to_ts timestamptz default null
) returns table(
  document_id uuid,
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
    r.resource_id as document_id,
    sum(r.total_views) as total_views
  from public.analytics_v2_resources_daily r, bounds b
  where r.workspace_id = p_workspace_id
    and r.resource_type = 'document'::public.resource_type
    and r.day between b.from_day and b.to_day
    and public.is_workspace_member(p_workspace_id)
  group by r.resource_id
  order by sum(r.total_views) desc
  limit greatest(coalesce(p_limit, 5), 1);
$$;

grant execute on function public.get_workspace_most_active_documents_v2(uuid, int, timestamptz, timestamptz) to authenticated;

create or replace function public.get_workspace_top_countries_v2(
  p_workspace_id uuid,
  p_limit int default 5,
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
  from public.analytics_v2_document_country_daily c, bounds b
  where c.workspace_id = p_workspace_id
    and c.day between b.from_day and b.to_day
    and public.is_workspace_member(p_workspace_id)
  group by c.country_code
  order by sum(c.total_views) desc
  limit greatest(coalesce(p_limit, 5), 1);
$$;

grant execute on function public.get_workspace_top_countries_v2(uuid, int, timestamptz, timestamptz) to authenticated;

