alter table public.links
drop constraint if exists links_custom_slug_format;

alter table public.links
add constraint links_custom_slug_format
check (
  custom_slug is null
  or custom_slug ~ '^[a-z0-9]+(?:[-_][a-z0-9]+)*$'
);
