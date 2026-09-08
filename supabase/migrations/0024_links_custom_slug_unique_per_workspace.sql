-- Custom link slugs only need to be unique within a workspace.
-- The share URL includes the workspace slug, so global uniqueness is unnecessary.

drop index if exists public.uq_links_custom_slug;

create unique index if not exists uq_links_custom_slug_per_workspace
on public.links (workspace_id, custom_slug)
where custom_slug is not null;

