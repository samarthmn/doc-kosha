alter table public.links
add column if not exists short_code text;

alter table public.links
add column if not exists custom_slug text;

update public.links
set short_code = substring(replace(id::text, '-', '') from 1 for 10)
where short_code is null or btrim(short_code) = '';

update public.links
set short_code = lower(short_code),
    custom_slug = nullif(lower(custom_slug), '');

alter table public.links
alter column short_code set default substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10);

alter table public.links
alter column short_code set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where c.conname = 'links_short_code_format'
      and nsp.nspname = 'public'
      and rel.relname = 'links'
  ) then
    alter table public.links
      add constraint links_short_code_format
      check (short_code ~ '^[a-z0-9]{6,20}$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where c.conname = 'links_custom_slug_format'
      and nsp.nspname = 'public'
      and rel.relname = 'links'
  ) then
    alter table public.links
      add constraint links_custom_slug_format
      check (custom_slug is null or custom_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  end if;
end $$;

create unique index if not exists uq_links_short_code
on public.links (short_code);

create unique index if not exists uq_links_custom_slug
on public.links (custom_slug)
where custom_slug is not null;

comment on column public.links.short_code is 'System-generated short code for compact share URLs.';
comment on column public.links.custom_slug is 'Optional user-defined slug for branded share URLs.';
